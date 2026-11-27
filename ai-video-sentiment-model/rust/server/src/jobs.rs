//! Job handling, mirroring deployment/server.py: download queue (2 at a
//! time), analysis queue (1 at a time, FIFO), cancel, resume after restart,
//! and the HMAC-signed callback. The analysis itself is still the Python
//! job_worker.py, so results are unchanged.

use std::collections::{HashMap, HashSet};
use std::os::unix::process::ExitStatusExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::Sha256;
use tokio::io::AsyncWriteExt;
use tokio::sync::{Semaphore, mpsc, oneshot, watch};

pub const MAX_VIDEO_BYTES: u64 = 3 * 1024 * 1024 * 1024; // 3 GB, same as the web cap
pub const ALLOWED_EXTENSIONS: [&str; 3] = [".mp4", ".mov", ".avi"]; // same as web upload.ts
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(120); // per connect and per read, like requests
const CALLBACK_TIMEOUT: Duration = Duration::from_secs(30);
const CALLBACK_ATTEMPTS: u32 = 3; // rides out a dev-server reload mid-callback
const CALLBACK_RETRY_DELAY: Duration = Duration::from_secs(10);
const PARALLEL_DOWNLOADS: usize = 2;
const SIG_HEADER: &str = "X-Inference-Signature";
const SESSION_ID_LEN: std::ops::RangeInclusive<usize> = 20..=40;
pub const RESTART_LOST_MESSAGE: &str =
    "The analysis server restarted before the video finished downloading. Please upload it again.";

#[derive(Clone, Serialize, Deserialize)]
pub struct Meta {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub ext: String,
    #[serde(rename = "callbackUrl")]
    pub callback_url: String,
}

pub struct Config {
    pub here: PathBuf, // deployment/ (job_worker.py lives here)
    pub jobs_dir: PathBuf,
    pub python: PathBuf,
    pub token: String,
    pub secret: String,
    pub callback_override: Option<String>,
}

pub enum Analysis {
    Session(Meta),
    Infer { key: String, video: PathBuf, reply: oneshot::Sender<Option<Value>> },
}

enum Download {
    Accept(Meta, String),
    Fail(Meta, String),
}

/// One lock covers "check cancelled + start worker" and "mark cancelled +
/// find worker", so a cancel can never slip between them.
#[derive(Default)]
struct Tracking {
    cancelled: HashSet<String>,
    running: HashMap<String, i32>, // key -> worker process group id
}

pub struct State {
    pub cfg: Config,
    http: reqwest::Client,
    tracking: Mutex<Tracking>,
    stopping: AtomicBool,
    analysis_tx: mpsc::UnboundedSender<Analysis>,
    download_tx: mpsc::UnboundedSender<Download>,
    /// Download-queue jobs not finished yet. Shutdown waits for them, like
    /// Python's executor does at exit, so no upload is dropped silently.
    pending_downloads: watch::Sender<usize>,
}

/// Prisma cuid. It also names the job files, so it must never carry a path.
pub fn valid_session_id(value: &str) -> bool {
    SESSION_ID_LEN.contains(&value.len()) && value.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
}

pub fn sign(body: &[u8], secret: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC takes keys of any length");
    mac.update(body);
    format!("sha256={}", hex::encode(mac.finalize().into_bytes()))
}

/// Constant-time comparison, like hmac.compare_digest.
pub fn same_secret(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(suffix);
    path.with_file_name(name)
}

fn kill_group(pgid: i32) {
    // SAFETY: killpg only sends a signal; an already-exited group returns ESRCH, which is fine.
    unsafe {
        libc::killpg(pgid, libc::SIGKILL);
    }
}

fn exit_code(status: &std::io::Result<std::process::ExitStatus>) -> i32 {
    match status {
        Ok(s) => s.code().unwrap_or_else(|| -s.signal().unwrap_or(0)), // -9 when killed, like Python
        Err(_) => -1,
    }
}

impl State {
    pub fn start(cfg: Config) -> Arc<Self> {
        let (analysis_tx, analysis_rx) = mpsc::unbounded_channel();
        let (download_tx, download_rx) = mpsc::unbounded_channel();
        let http = reqwest::Client::builder()
            .connect_timeout(DOWNLOAD_TIMEOUT)
            .build()
            .expect("HTTP client");
        let state = Arc::new(Self {
            cfg,
            http,
            tracking: Mutex::default(),
            stopping: AtomicBool::new(false),
            analysis_tx,
            download_tx,
            pending_downloads: watch::Sender::new(0),
        });
        tokio::spawn(state.clone().analysis_loop(analysis_rx));
        tokio::spawn(state.clone().download_loop(download_rx));
        state
    }

    /// Strictly one analysis at a time: each worker loads the model, Whisper
    /// and pyannote, and two at once would not fit this Mac's RAM.
    async fn analysis_loop(self: Arc<Self>, mut rx: mpsc::UnboundedReceiver<Analysis>) {
        while let Some(job) = rx.recv().await {
            match job {
                Analysis::Session(meta) => self.analyze(meta).await,
                Analysis::Infer { key, video, reply } => {
                    if reply.is_closed() {
                        continue; // the /infer caller went away; don't hold the slot for nobody
                    }
                    let _ = reply.send(self.run_worker(&key, &video).await);
                }
            }
        }
    }

    /// Downloads start as soon as a job arrives, so a job waiting for the
    /// analysis slot never outlives its 1 h presigned URL.
    async fn download_loop(self: Arc<Self>, mut rx: mpsc::UnboundedReceiver<Download>) {
        let slots = Arc::new(Semaphore::new(PARALLEL_DOWNLOADS));
        while let Some(job) = rx.recv().await {
            let permit = slots.clone().acquire_owned().await.expect("semaphore is never closed");
            let state = self.clone();
            tokio::spawn(async move {
                match job {
                    Download::Accept(meta, url) => state.clone().accept(meta, url).await,
                    Download::Fail(meta, message) => state.fail(&meta, &message).await,
                }
                drop(permit);
                state.pending_downloads.send_modify(|n| *n = n.saturating_sub(1));
            });
        }
    }

    fn queue(&self, job: Download) {
        self.pending_downloads.send_modify(|n| *n += 1);
        if self.download_tx.send(job).is_err() {
            self.pending_downloads.send_modify(|n| *n = n.saturating_sub(1));
        }
    }

    pub fn queue_download(&self, meta: Meta, video_url: String) {
        self.queue(Download::Accept(meta, video_url));
    }

    pub fn pending_downloads(&self) -> usize {
        *self.pending_downloads.borrow()
    }

    pub async fn wait_for_downloads(&self) {
        let _ = self.pending_downloads.subscribe().wait_for(|n| *n == 0).await;
    }

    pub async fn infer(&self, key: String, video: PathBuf) -> Option<Value> {
        let (reply, answer) = oneshot::channel();
        self.analysis_tx.send(Analysis::Infer { key, video, reply }).ok()?;
        answer.await.ok().flatten()
    }

    /// Marks the session cancelled and kills its worker if one is running.
    /// Returns whether a worker was running.
    pub fn cancel(&self, session_id: &str) -> bool {
        let pgid = {
            let mut t = self.tracking.lock().expect("lock");
            t.cancelled.insert(session_id.to_string());
            t.running.get(session_id).copied()
        };
        if let Some(pgid) = pgid {
            kill_group(pgid); // run_worker still sees the cancel even if it just finished
        }
        pgid.is_some()
    }

    /// Workers run in their own process group (so a cancel can kill their
    /// ffmpeg children), which also means Ctrl+C never reaches them: shutdown
    /// kills them itself and leaves their job files for the next start.
    pub fn shutdown(&self) {
        self.stopping.store(true, Ordering::SeqCst);
        let groups: Vec<i32> = self.tracking.lock().expect("lock").running.values().copied().collect();
        groups.into_iter().for_each(kill_group);
    }

    fn consume_cancel(&self, key: &str) -> bool {
        self.tracking.lock().expect("lock").cancelled.remove(key)
    }

    fn job_files(&self, meta: &Meta) -> (PathBuf, PathBuf) {
        let sid = &meta.session_id;
        (self.cfg.jobs_dir.join(format!("{sid}.json")), self.cfg.jobs_dir.join(format!("{sid}{}", meta.ext)))
    }

    fn cleanup(&self, meta: &Meta) {
        let (meta_path, video) = self.job_files(meta);
        // predict_fn writes <video stem>_diarize.wav beside the video.
        let diarize = video.with_file_name(format!("{}_diarize.wav", meta.session_id));
        let extras = [with_suffix(&video, ".part"), with_suffix(&video, ".result.json"), diarize];
        for path in [meta_path, video].iter().chain(extras.iter()) {
            let _ = std::fs::remove_file(path);
        }
    }

    /// Analyze `video` in a child process. None when the job was cancelled
    /// (or the server is stopping) before or while it ran.
    pub async fn run_worker(&self, key: &str, video: &Path) -> Option<Value> {
        let out = with_suffix(video, ".result.json");
        let mut child = {
            let mut t = self.tracking.lock().expect("lock");
            if self.stopping.load(Ordering::SeqCst) || t.cancelled.remove(key) {
                return None; // a stopping caller keeps the job for resume
            }
            let mut command = tokio::process::Command::new(&self.cfg.python);
            command
                .arg(self.cfg.here.join("job_worker.py"))
                .arg(video)
                .arg(&out)
                .current_dir(&self.cfg.here)
                .env("PYTHONUNBUFFERED", "1");
            // Own session, like Python's start_new_session=True. That makes the
            // worker its own process group (a cancel also kills its ffmpeg
            // children) and detaches it from the terminal: in a background
            // group of the terminal, ffmpeg's keyboard check gets it stopped
            // (SIGTTIN) and the analysis hangs.
            // SAFETY: setsid is async-signal-safe and touches no Rust state.
            unsafe {
                command.pre_exec(|| {
                    if libc::setsid() == -1 { Err(std::io::Error::last_os_error()) } else { Ok(()) }
                });
            }
            let spawned = command.spawn();
            match spawned {
                Ok(child) => {
                    // Never record group 0: killpg(0) would hit this server's own group.
                    if let Some(pid) = child.id().and_then(|id| i32::try_from(id).ok()).filter(|&p| p > 0) {
                        t.running.insert(key.to_string(), pid);
                    }
                    child
                }
                Err(e) => return Some(json!({"error": format!("Could not start the analysis worker: {e}")})),
            }
        };
        let status = child.wait().await;
        self.tracking.lock().expect("lock").running.remove(key);
        if self.consume_cancel(key) {
            let _ = std::fs::remove_file(&out);
            return None;
        }
        let payload = std::fs::read(&out)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
            .unwrap_or_else(|| json!({"error": format!("Analysis stopped unexpectedly (exit code {})", exit_code(&status))}));
        let _ = std::fs::remove_file(&out);
        Some(payload)
    }

    async fn accept(self: Arc<Self>, meta: Meta, video_url: String) {
        if self.consume_cancel(&meta.session_id) {
            return;
        }
        let (meta_path, video) = self.job_files(&meta);
        // Metadata first: a crash mid-download is then visible on restart.
        // The presigned URL is never written to disk.
        let saved = std::fs::write(&meta_path, serde_json::to_vec(&meta).expect("meta serializes"));
        let downloaded = match saved {
            Ok(()) => self.download(&video_url, &video).await,
            Err(e) => Err(e.to_string()),
        };
        if let Err(message) = downloaded {
            self.cleanup(&meta);
            self.fail(&meta, &message).await;
            return;
        }
        let _ = self.analysis_tx.send(Analysis::Session(meta));
    }

    async fn download(&self, url: &str, dest: &Path) -> Result<(), String> {
        let part = with_suffix(dest, ".part");
        let response = tokio::time::timeout(DOWNLOAD_TIMEOUT, self.http.get(url).send())
            .await
            .map_err(|_| download_error("ReadTimeout"))?
            .and_then(reqwest::Response::error_for_status)
            .map_err(|e| download_error(&request_problem(&e)))?;
        let mut response = response;
        let mut file = tokio::fs::File::create(&part).await.map_err(|e| e.to_string())?;
        let mut total: u64 = 0;
        loop {
            let chunk = tokio::time::timeout(DOWNLOAD_TIMEOUT, response.chunk())
                .await
                .map_err(|_| download_error("ReadTimeout"))?
                .map_err(|e| download_error(&request_problem(&e)))?;
            let Some(chunk) = chunk else { break };
            total += chunk.len() as u64;
            if total > MAX_VIDEO_BYTES {
                return Err("Video exceeds the 3 GB limit".into());
            }
            file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        }
        file.flush().await.map_err(|e| e.to_string())?;
        drop(file);
        tokio::fs::rename(&part, dest).await.map_err(|e| e.to_string())
    }

    async fn analyze(self: &Arc<Self>, meta: Meta) {
        let sid = meta.session_id.clone();
        let (_, video) = self.job_files(&meta);
        let payload = self.run_worker(&sid, &video).await;
        if self.stopping.load(Ordering::SeqCst) {
            // Killed (or never started) by shutdown: no callback, keep the job
            // files so resume_pending runs it again on the next start.
            log_info!("Server stopping; {sid} will resume on the next start");
            return;
        }
        match payload {
            None => log_info!("Cancelled {sid}"),
            Some(payload) => match payload.get("result") {
                Some(result) => {
                    let body = json!({"sessionId": sid, "status": "completed", "result": result});
                    self.post_callback(&meta, &body).await;
                }
                None => {
                    let message = match payload.get("error") {
                        Some(Value::String(s)) => s.clone(),
                        Some(other) => other.to_string(),
                        None => "Analysis failed".to_string(),
                    };
                    log_error!("Analysis failed for {sid}: {message}");
                    self.fail(&meta, &message).await;
                }
            },
        }
        self.cleanup(&meta);
    }

    async fn fail(&self, meta: &Meta, message: &str) {
        let body = json!({"sessionId": meta.session_id, "status": "failed", "error": message});
        self.post_callback(meta, &body).await;
    }

    /// Signs the EXACT serialized bytes that are POSTed (the web route
    /// verifies the raw body before parsing).
    async fn post_callback(&self, meta: &Meta, payload: &Value) {
        let sid = &meta.session_id;
        // The web app runs on this same Mac, so CALLBACK_URL reaches it directly.
        let url = self.cfg.callback_override.clone().unwrap_or_else(|| meta.callback_url.clone());
        let body = serde_json::to_vec(payload).expect("payload serializes");
        let signature = sign(&body, &self.cfg.secret);
        for attempt in 1..=CALLBACK_ATTEMPTS {
            let sent = self
                .http
                .post(&url)
                .header("Content-Type", "application/json")
                .header(SIG_HEADER, &signature)
                .body(body.clone())
                .timeout(CALLBACK_TIMEOUT)
                .send()
                .await;
            let problem = match sent {
                Ok(r) if r.status().as_u16() == 404 => {
                    log_info!("Session {sid} no longer exists (cancelled or deleted); result dropped");
                    return;
                }
                Ok(r) if r.status().as_u16() < 400 => return,
                Ok(r) => format!("HTTP {}", r.status().as_u16()),
                Err(e) => request_problem(&e),
            };
            log_warn!("Callback for {sid} failed ({problem}), attempt {attempt}");
            if attempt < CALLBACK_ATTEMPTS {
                tokio::time::sleep(CALLBACK_RETRY_DELAY).await;
            }
        }
        log_error!("Giving up on callback for {sid}; the session stays PROCESSING");
    }

    /// Re-queue jobs a previous run accepted but never finished, oldest first.
    pub fn resume_pending(&self) {
        let Ok(entries) = std::fs::read_dir(&self.cfg.jobs_dir) else { return };
        let mut metas: Vec<(std::time::SystemTime, PathBuf)> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                name.ends_with(".json") && !name.ends_with(".result.json")
            })
            .filter_map(|p| Some((std::fs::metadata(&p).ok()?.modified().ok()?, p)))
            .collect();
        metas.sort();
        for (_, path) in metas {
            let parsed = std::fs::read(&path).ok().and_then(|b| serde_json::from_slice::<Meta>(&b).ok());
            let Some(meta) = parsed.filter(|m| valid_session_id(&m.session_id)) else {
                log_error!("Skipping unreadable job file {}", path.display());
                continue;
            };
            let (_, video) = self.job_files(&meta);
            if video.exists() {
                log_info!("Resuming {}", meta.session_id);
                let _ = self.analysis_tx.send(Analysis::Session(meta));
            } else {
                self.cleanup(&meta);
                self.queue(Download::Fail(meta, RESTART_LOST_MESSAGE.to_string()));
            }
        }
    }
}

/// Never echo the error text: it embeds the presigned URL (signature
/// included), and this message is stored and shown in the UI.
fn request_problem(e: &reqwest::Error) -> String {
    if let Some(status) = e.status() {
        format!("HTTP {}", status.as_u16())
    } else if e.is_timeout() {
        "ReadTimeout".into()
    } else if e.is_connect() {
        "ConnectionError".into()
    } else {
        "RequestException".into()
    }
}

fn download_error(detail: &str) -> String {
    format!("Video download failed: {detail}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signature_matches_python_hmac() {
        let body = br#"{"sessionId":"x","status":"failed","error":"boom"}"#;
        assert_eq!(sign(body, "test-secret"), "sha256=2fbeec73fc045bdb03236bdc3b419fddc476ee2976792ebd4f438dd4ba3dfc1c");
    }

    #[test]
    fn session_ids_are_lowercase_alphanumerics_of_20_to_40() {
        assert!(valid_session_id("cmwez20zx0001yj3v62gh5dei"));
        assert!(!valid_session_id("short"));
        assert!(!valid_session_id("../../etc/passwd/aaaaaaaaaaaaaa"));
        assert!(!valid_session_id("CMWEZ20ZX0001YJ3V62GH5DEI"));
        assert!(!valid_session_id(&"a".repeat(41)));
    }

    #[test]
    fn secret_comparison_needs_exact_match() {
        assert!(same_secret(b"abc", b"abc"));
        assert!(!same_secret(b"abc", b"abd"));
        assert!(!same_secret(b"abc", b"abcd"));
    }

    #[test]
    fn worker_floats_pass_through_unchanged() {
        // Python writes shortest round-trip floats; their values must reach the web
        // app bit for bit (1e-05 may be spelled 0.00001: same number).
        let text = "[0.19135960936546326,0.1,1e-05,0.7612019777297974]";
        let parsed: Value = serde_json::from_str(text).expect("valid JSON");
        assert_eq!(serde_json::to_string(&parsed).expect("serializes"), "[0.19135960936546326,0.1,0.00001,0.7612019777297974]");
    }

    #[test]
    fn suffix_is_appended_to_the_file_name() {
        assert_eq!(with_suffix(Path::new("/j/abc.mp4"), ".part"), PathBuf::from("/j/abc.mp4.part"));
    }
}
