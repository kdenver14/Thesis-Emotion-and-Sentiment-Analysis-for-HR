"""Modal serverless GPU deployment for video sentiment inference.

Phase A: orchestration only. The numerical stack and `inference.py` /
`models.py` are reused UNCHANGED — the model runs under byte-identical
library versions to the validated `requirements.lock` (see
MODAL_DEPLOYMENT_PLAN.md sections 0b and 3). Nothing here may alter what the
model sees or outputs.

Flow: Next POSTs the cheap CPU `trigger` endpoint (bearer auth) -> it
`.spawn()`s the T4 `Inference.run_inference` -> that downloads the video from
a presigned GET URL, runs the unchanged `predict_fn`, and POSTs an
HMAC-signed result to the Next callback.
"""

import hashlib
import hmac
import json
import os
import tempfile

import modal
from fastapi import Header, HTTPException  # locked fastapi==0.115.6

REQ_LOCK = "requirements.lock"
WEIGHTS_DIR = "/weights"
# Bound the download a presigned GET cannot bound by itself; the web layer
# also HEAD-checks the object before spawning (plan section 4b gap 1).
MAX_VIDEO_BYTES = 3 * 1024 * 1024 * 1024  # 3 GB
DOWNLOAD_CHUNK = 1024 * 1024  # 1 MB

weights = modal.Volume.from_name("sentiment-weights", create_if_missing=True)
hf_secret = modal.Secret.from_name("huggingface")  # HF_TOKEN (pyannote)
auth_secret = modal.Secret.from_name(  # MODAL_TRIGGER_TOKEN + INFERENCE_CALLBACK_SECRET
    "inference-auth"
)


def _prefetch_models() -> None:
    """Bake Whisper/BERT/pyannote into the image so cold start does not
    re-download ~600 MB. Runs under the locked versions. pyannote is
    best-effort: a missing/unlicensed HF token must not fail the build
    (inference.py already degrades without diarization)."""
    import whisper
    from transformers import AutoTokenizer

    whisper.load_model("base")
    AutoTokenizer.from_pretrained("bert-base-uncased")

    token = os.environ.get("HF_TOKEN")
    if token:
        try:
            from pyannote.audio import Pipeline

            Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1", use_auth_token=token
            )
        except Exception as exc:  # noqa: BLE001 - build must not hard-fail here
            print(f"[build] pyannote prefetch skipped: {exc}")


# Accuracy-locked image. `--no-deps` against the full pinned closure = zero
# resolver drift; `modal` is installed with the lock as a constraints file so
# it cannot upgrade any pinned (accuracy-relevant) package.
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "git")
    .add_local_file(REQ_LOCK, f"/tmp/{REQ_LOCK}", copy=True)
    .run_commands(
        f"pip install --no-deps -r /tmp/{REQ_LOCK}",
        f"pip install -c /tmp/{REQ_LOCK} modal",
    )
    .run_function(_prefetch_models, secrets=[hf_secret])
    .add_local_python_source("inference", "models")
)

app = modal.App("sentiment-inference")


def _sign(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _post_callback(url: str, payload: dict, secret: str) -> None:
    """Sign the EXACT serialized bytes that are POSTed (the Next callback
    verifies the raw body before parsing)."""
    import requests  # locked requests==2.32.5

    body = json.dumps(payload, separators=(",", ":")).encode()
    requests.post(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Inference-Signature": _sign(body, secret),
        },
        timeout=30,
    )


def _download(video_url: str, suffix: str) -> str:
    import requests

    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    total = 0
    try:
        with requests.get(video_url, stream=True, timeout=120) as resp:
            resp.raise_for_status()
            for chunk in resp.iter_content(DOWNLOAD_CHUNK):
                total += len(chunk)
                if total > MAX_VIDEO_BYTES:
                    raise ValueError("Video exceeds the 3 GB limit")
                tmp.write(chunk)
        return tmp.name
    finally:
        tmp.close()


@app.cls(
    gpu="T4",
    image=image,
    volumes={WEIGHTS_DIR: weights},
    secrets=[hf_secret, auth_secret],
    min_containers=0,
    scaledown_window=300,
    timeout=3600,
    max_containers=3,
    retries=1,
)
@modal.concurrent(max_inputs=1)  # model+Whisper+pyannote share one GPU, not thread-safe
class Inference:
    @modal.enter()
    def load(self) -> None:
        os.environ["MODEL_DIR"] = WEIGHTS_DIR
        from inference import load_model

        self.model_dict = load_model(WEIGHTS_DIR)  # unchanged accuracy path

    @modal.method()
    def run_inference(self, job: dict) -> None:
        from inference import predict_fn

        session_id = job["sessionId"]
        callback_url = job["callbackUrl"]
        secret = os.environ["INFERENCE_CALLBACK_SECRET"]
        video_path = None
        try:
            video_path = _download(job["videoUrl"], job.get("ext", ".mp4"))
            result = predict_fn({"video_path": video_path}, self.model_dict)
            _post_callback(
                callback_url,
                {"sessionId": session_id, "status": "completed", "result": result},
                secret,
            )
        except Exception as exc:  # noqa: BLE001 - report failure, never crash silently
            _post_callback(
                callback_url,
                {"sessionId": session_id, "status": "failed", "error": str(exc)},
                secret,
            )
        finally:
            if video_path and os.path.exists(video_path):
                os.remove(video_path)


# Separate CHEAP CPU function (no gpu=): a trigger must not boot a T4 just to
# enqueue (plan section 4b gap 3). It only authenticates and spawns.
@app.function(image=image, secrets=[auth_secret])
@modal.fastapi_endpoint(method="POST")
def trigger(job: dict, authorization: str = Header(default="")):
    expected = os.environ["MODAL_TRIGGER_TOKEN"]
    token = authorization.removeprefix("Bearer ").strip()
    if not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
    for key in ("sessionId", "videoUrl", "callbackUrl"):
        if not job.get(key):
            raise HTTPException(status_code=400, detail=f"Missing {key}")
    Inference().run_inference.spawn(job)
    return {"queued": True}
