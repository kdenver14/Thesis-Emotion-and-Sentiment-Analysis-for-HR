//! Local inference server (Rust port of deployment/server.py).
//!
//! Run it from deployment/ with the same environment as server.py:
//!   set -a; source .env; set +a
//!   ../rust/target.nosync/release/inference-server
//!
//! Analysis still runs in deployment/job_worker.py (one process per video),
//! so results are unchanged. Keep the callback signature format in sync with
//! src/app/api/inference-callback/route.ts.

use std::path::PathBuf;
use std::process::ExitCode;

// writeln! instead of eprintln!: a closed stderr must not panic the job loops.
macro_rules! log_at {
    ($level:literal, $($t:tt)*) => {{
        use std::io::Write as _;
        let _ = writeln!(std::io::stderr(), "{}:inference-server:{}", $level, format!($($t)*));
    }};
}
macro_rules! log_info { ($($t:tt)*) => { log_at!("INFO", $($t)*) } }
macro_rules! log_warn { ($($t:tt)*) => { log_at!("WARNING", $($t)*) } }
macro_rules! log_error { ($($t:tt)*) => { log_at!("ERROR", $($t)*) } }

mod api;
mod jobs;

const DEFAULT_PORT: u16 = 8000;

/// Absolute, so the worker (which runs with deployment/ as its directory)
/// gets paths that still point at the right files.
fn env_path(key: &str, default: PathBuf) -> Result<PathBuf, String> {
    let path = std::env::var_os(key).map(PathBuf::from).unwrap_or(default);
    std::path::absolute(&path).map_err(|e| format!("Bad path {}: {e}", path.display()))
}

fn config_from_env() -> Result<jobs::Config, String> {
    let here = env_path("DEPLOYMENT_DIR", std::env::current_dir().map_err(|e| e.to_string())?)?;
    if !here.join("job_worker.py").exists() {
        return Err(format!("job_worker.py not found in {}; run this from deployment/", here.display()));
    }
    // Checked now: a wrong path would otherwise fail every job, resumed ones included.
    let python = env_path("PYTHON", here.join("venv/bin/python"))?;
    if !python.exists() {
        return Err(format!("Python not found at {}; set PYTHON or create deployment/venv", python.display()));
    }
    let var = |k: &str| std::env::var(k).ok().filter(|v| !v.is_empty());
    let missing: Vec<&str> =
        ["MODAL_TRIGGER_TOKEN", "INFERENCE_CALLBACK_SECRET"].into_iter().filter(|k| var(k).is_none()).collect();
    if !missing.is_empty() {
        return Err(format!("Set {} in deployment/.env (same values as the web .env)", missing.join(", ")));
    }
    Ok(jobs::Config {
        jobs_dir: env_path("JOBS_DIR", here.join("jobs"))?,
        python,
        token: var("MODAL_TRIGGER_TOKEN").unwrap_or_default(),
        secret: var("INFERENCE_CALLBACK_SECRET").unwrap_or_default(),
        callback_override: var("CALLBACK_URL"),
        here,
    })
}

async fn stop_signal() {
    let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).expect("SIGTERM handler");
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {},
        _ = term.recv() => {},
    }
}

#[tokio::main]
async fn main() -> ExitCode {
    let cfg = match config_from_env() {
        Ok(cfg) => cfg,
        Err(message) => {
            log_error!("{message}");
            return ExitCode::FAILURE;
        }
    };
    if let Err(e) = std::fs::create_dir_all(&cfg.jobs_dir) {
        log_error!("Cannot create {}: {e}", cfg.jobs_dir.display());
        return ExitCode::FAILURE;
    }
    let port = match std::env::var("PORT") {
        Err(_) => DEFAULT_PORT,
        Ok(text) => match text.parse::<u16>() {
            Ok(port) => port,
            Err(_) => {
                log_error!("PORT must be a port number, got {text:?}");
                return ExitCode::FAILURE;
            }
        },
    };
    // Loopback only: the web app on this Mac is the only caller.
    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
        Ok(l) => l,
        Err(e) => {
            log_error!("Cannot listen on 127.0.0.1:{port}: {e}");
            return ExitCode::FAILURE;
        }
    };
    let state = jobs::State::start(cfg);
    state.resume_pending();
    log_info!("Listening on http://127.0.0.1:{port}");
    let shutdown_state = state.clone();
    let served = axum::serve(listener, api::router(state.clone()))
        .with_graceful_shutdown(async move {
            stop_signal().await;
            shutdown_state.shutdown();
        })
        .await;
    if let Err(e) = served {
        log_error!("Server error: {e}");
        return ExitCode::FAILURE;
    }
    finish_downloads(&state).await;
    ExitCode::SUCCESS
}

/// Like Python's executor at exit: queued and running downloads (and their
/// failure callbacks) finish first, so their job files exist for the next
/// start. A second Ctrl+C quits at once.
async fn finish_downloads(state: &jobs::State) {
    let pending = state.pending_downloads();
    if pending == 0 {
        return;
    }
    log_info!("Finishing {pending} download job(s) before exiting; press Ctrl+C again to quit now");
    tokio::select! {
        () = state.wait_for_downloads() => {}
        () = stop_signal() => log_warn!("Quit before downloads finished; those videos will need to be uploaded again"),
    }
}
