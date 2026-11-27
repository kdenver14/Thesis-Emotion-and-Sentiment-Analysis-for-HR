"""Local inference server (runs on the host Mac).

- POST /trigger: bearer token, {sessionId, videoUrl, ext, callbackUrl}. The
  web app calls it through MODAL_TRIGGER_URL (a historical name). Results go
  back through an HMAC-signed callback.
- POST /cancel: {sessionId}. Drops a queued job or kills a running one.
- POST /infer: direct file upload, for curl testing.

Each analysis runs in its own process (job_worker.py), so a cancel can stop
it at once and memory is released after every video.

Keep the signature format in sync with
src/app/api/inference-callback/route.ts.
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
import re
import signal
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

import requests  # locked requests==2.32.5
import uvicorn
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("inference-server")

HERE = Path(__file__).resolve().parent
WORKER = HERE / "job_worker.py"
# Pending jobs (metadata + downloaded video) persist here, so a restart
# resumes them instead of leaving sessions stuck in PROCESSING.
JOBS_DIR = Path(os.environ.get("JOBS_DIR", HERE / "jobs"))

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB (/infer)
MAX_VIDEO_BYTES = 3 * 1024 * 1024 * 1024  # 3 GB (/trigger), same as the web cap
CHUNK_BYTES = 1024 * 1024  # 1 MB
DOWNLOAD_TIMEOUT_S = 120
CALLBACK_TIMEOUT_S = 30
CALLBACK_ATTEMPTS = 3  # rides out a dev-server reload mid-callback
CALLBACK_RETRY_DELAY_S = 10
HTTP_NOT_FOUND = 404
SIG_HEADER = "X-Inference-Signature"
# Prisma cuid. It also names the job files, so it must never carry a path.
SESSION_ID = re.compile(r"[a-z0-9]{20,40}")
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi"}  # same as web upload.ts
RESTART_LOST_MESSAGE = (
    "The analysis server restarted before the video finished downloading. "
    "Please upload it again."
)

# Analysis runs strictly one job at a time: each worker loads the model,
# Whisper and pyannote, and two at once would not fit this Mac's RAM.
# Downloads start as soon as a job arrives, so a job waiting in line never
# outlives its 1 h presigned URL.
analysis_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="analysis")
download_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="download")

# Cancellation state. One lock covers "check cancelled + start worker" and
# "mark cancelled + find worker", so a cancel can never slip between them.
_lock = threading.Lock()
_cancelled: set[str] = set()
_running: dict[str, subprocess.Popen] = {}
# Set on shutdown. Workers live in their own process group (so a cancel can
# kill their ffmpeg children), which also means Ctrl+C never reaches them:
# shutdown kills them itself and leaves their job files for the next start.
_stopping = threading.Event()


def _log_crash(future: Future) -> None:
    exc = future.exception()
    if exc is not None:
        logger.error("Background job crashed", exc_info=exc)


def _submit(pool: ThreadPoolExecutor, fn, *args) -> None:
    pool.submit(fn, *args).add_done_callback(_log_crash)


def _consume_cancel(key: str) -> bool:
    with _lock:
        if key in _cancelled:
            _cancelled.discard(key)
            return True
    return False


def _kill(proc: subprocess.Popen) -> None:
    """Kill a worker and its ffmpeg children (one process group)."""
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass  # already exited on its own


def _job_files(meta: dict) -> tuple[Path, Path]:
    sid = meta["sessionId"]
    return JOBS_DIR / f"{sid}.json", JOBS_DIR / f"{sid}{meta['ext']}"


def _cleanup(meta: dict) -> None:
    meta_path, video = _job_files(meta)
    # predict_fn writes <video stem>_diarize.wav beside the video.
    extras = [
        video.with_name(video.name + ".part"),
        video.with_name(video.name + ".result.json"),
        video.with_name(f"{video.stem}_diarize.wav"),
    ]
    for path in (meta_path, video, *extras):
        path.unlink(missing_ok=True)


def _check_token(authorization: str) -> None:
    token = authorization.removeprefix("Bearer ").strip()
    if not hmac.compare_digest(token.encode(), os.environ["MODAL_TRIGGER_TOKEN"].encode()):
        raise HTTPException(status_code=401, detail="Unauthorized")


def _check_session_id(value: object) -> str:
    if not isinstance(value, str) or not SESSION_ID.fullmatch(value):
        raise HTTPException(status_code=400, detail="Invalid sessionId")
    return value


def _sign(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _post_callback(meta: dict, payload: dict) -> None:
    """Sign the EXACT serialized bytes that are POSTed (the web route verifies
    the raw body before parsing)."""
    sid = meta["sessionId"]
    # The web app runs on this same Mac, so CALLBACK_URL (deployment/.env)
    # reaches it directly. The callbackUrl saved with the job points at the
    # tunnel as it was at upload time, and a quick tunnel's URL changes on
    # every restart, which would strand the result.
    url = os.environ.get("CALLBACK_URL") or meta["callbackUrl"]
    body = json.dumps(payload, separators=(",", ":")).encode()
    headers = {
        "Content-Type": "application/json",
        SIG_HEADER: _sign(body, os.environ["INFERENCE_CALLBACK_SECRET"]),
    }
    for attempt in range(1, CALLBACK_ATTEMPTS + 1):
        try:
            resp = requests.post(url, data=body, headers=headers, timeout=CALLBACK_TIMEOUT_S)
            if resp.ok:
                return
            if resp.status_code == HTTP_NOT_FOUND:
                logger.info("Session %s no longer exists (cancelled or deleted); result dropped", sid)
                return
            problem = f"HTTP {resp.status_code}"
        except requests.RequestException as exc:
            problem = type(exc).__name__
        logger.warning("Callback for %s failed (%s), attempt %d", sid, problem, attempt)
        if attempt < CALLBACK_ATTEMPTS:
            time.sleep(CALLBACK_RETRY_DELAY_S)
    logger.error("Giving up on callback for %s; the session stays PROCESSING", sid)


def _fail(meta: dict, message: str) -> None:
    _post_callback(meta, {"sessionId": meta["sessionId"], "status": "failed", "error": message})


def _download(video_url: str, dest: Path) -> None:
    part = dest.with_name(dest.name + ".part")
    total = 0
    try:
        with requests.get(video_url, stream=True, timeout=DOWNLOAD_TIMEOUT_S) as resp, part.open("wb") as out:
            resp.raise_for_status()
            for chunk in resp.iter_content(CHUNK_BYTES):
                total += len(chunk)
                if total > MAX_VIDEO_BYTES:
                    raise ValueError("Video exceeds the 3 GB limit")
                out.write(chunk)
    except requests.RequestException as exc:
        # requests messages embed the presigned URL (signature included) and
        # this error is persisted and shown in the UI, so never forward it.
        status = getattr(exc.response, "status_code", None)
        detail = f"HTTP {status}" if status else type(exc).__name__
        raise RuntimeError(f"Video download failed: {detail}") from None
    part.rename(dest)


def _run_worker(key: str, video: Path) -> dict | None:
    """Analyze `video` in a child process. Returns the worker's payload, or
    None when the job was cancelled before or while it ran."""
    out = video.with_name(video.name + ".result.json")
    with _lock:
        if _stopping.is_set():
            return None  # caller sees _stopping and keeps the job for resume
        if key in _cancelled:
            _cancelled.discard(key)
            return None
        proc = subprocess.Popen(
            [sys.executable, str(WORKER), str(video), str(out)],
            cwd=HERE,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
            start_new_session=True,  # own process group: a cancel also kills its ffmpeg children
        )
        _running[key] = proc
    try:
        proc.wait()
    finally:
        with _lock:
            _running.pop(key, None)
    if _consume_cancel(key):
        out.unlink(missing_ok=True)
        return None
    try:
        payload = json.loads(out.read_text())
    except (OSError, ValueError):
        payload = {"error": f"Analysis stopped unexpectedly (exit code {proc.returncode})"}
    out.unlink(missing_ok=True)
    return payload


def _accept(meta: dict, video_url: str) -> None:
    sid = meta["sessionId"]
    if _consume_cancel(sid):
        return
    meta_path, video = _job_files(meta)
    # Metadata first: a crash mid-download is then visible on restart. The
    # presigned URL is never written to disk.
    meta_path.write_text(json.dumps(meta))
    try:
        _download(video_url, video)
    except Exception as exc:  # noqa: BLE001 - report failure, never drop a job silently
        _cleanup(meta)
        _fail(meta, str(exc))
        return
    _submit(analysis_pool, _analyze, meta)


def _analyze(meta: dict) -> None:
    sid = meta["sessionId"]
    _, video = _job_files(meta)
    payload = _run_worker(sid, video)
    if _stopping.is_set():
        # Killed (or never started) by shutdown: no callback, keep the job
        # files so _resume_pending runs it again on the next start.
        logger.info("Server stopping; %s will resume on the next start", sid)
        return
    if payload is None:
        logger.info("Cancelled %s", sid)
    elif "result" in payload:
        _post_callback(meta, {"sessionId": sid, "status": "completed", "result": payload["result"]})
    else:
        logger.error("Analysis failed for %s: %s", sid, payload.get("error"))
        _fail(meta, str(payload.get("error", "Analysis failed")))
    _cleanup(meta)


def _resume_pending() -> None:
    """Re-queue jobs a previous run accepted but never finished, oldest first."""
    for meta_path in sorted(JOBS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime):
        if meta_path.name.endswith(".result.json"):
            continue
        meta = json.loads(meta_path.read_text())
        _, video = _job_files(meta)
        if video.exists():
            logger.info("Resuming %s", meta["sessionId"])
            _submit(analysis_pool, _analyze, meta)
        else:
            _cleanup(meta)
            _submit(download_pool, _fail, meta, RESTART_LOST_MESSAGE)


@asynccontextmanager
async def lifespan(app: FastAPI):
    missing = [k for k in ("MODAL_TRIGGER_TOKEN", "INFERENCE_CALLBACK_SECRET") if not os.environ.get(k)]
    if missing:
        raise RuntimeError(f"Set {', '.join(missing)} in deployment/.env (same values as the web .env)")
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    _resume_pending()
    yield
    _stopping.set()
    with _lock:
        procs = list(_running.values())
    for proc in procs:
        _kill(proc)


app = FastAPI(lifespan=lifespan)


@app.post("/trigger")
def trigger(job: dict, authorization: str = Header(default="")):
    _check_token(authorization)
    for key in ("sessionId", "videoUrl", "callbackUrl"):
        if not isinstance(job.get(key), str) or not job[key]:
            raise HTTPException(status_code=400, detail=f"Missing {key}")
    sid = _check_session_id(job["sessionId"])
    ext = job.get("ext", ".mp4")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
    meta = {"sessionId": sid, "ext": ext, "callbackUrl": job["callbackUrl"]}
    _submit(download_pool, _accept, meta, job["videoUrl"])
    return {"queued": True}


@app.post("/cancel")
def cancel(body: dict, authorization: str = Header(default="")):
    _check_token(authorization)
    sid = _check_session_id(body.get("sessionId"))
    with _lock:
        _cancelled.add(sid)
        proc = _running.get(sid)
    if proc is not None:
        _kill(proc)  # _run_worker still sees the cancel even if it just finished
    logger.info("Cancel requested for %s (%s)", sid, "running, stopped" if proc else "not running")
    return {"cancelled": True}


@app.post("/infer")
async def infer(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    # Stream to disk with a running byte cap; reading the whole body
    # first (file.read()) would defeat the limit (OOM on a hostile body).
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp_path = tmp.name
        total = 0
        while chunk := await file.read(CHUNK_BYTES):
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                tmp.close()
                os.remove(tmp_path)
                raise HTTPException(
                    status_code=413, detail="File exceeds the 100 MB upload limit"
                )
            tmp.write(chunk)

    try:
        # Same single worker slot as /trigger jobs.
        payload = await asyncio.wrap_future(
            analysis_pool.submit(_run_worker, f"infer:{uuid.uuid4()}", Path(tmp_path))
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    if not payload or "result" not in payload:
        logger.error("Inference failed: %s", (payload or {}).get("error"))
        raise HTTPException(status_code=500, detail="Inference failed")
    return JSONResponse(content=payload["result"])


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    # Loopback only: the web app on this Mac is the only caller.
    uvicorn.run("server:app", host="127.0.0.1", port=port, reload=False)
