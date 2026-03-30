import os
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

import asyncio
import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from inference import load_model, predict_fn

MODEL_DIR = os.environ.get("MODEL_DIR", "../../model_normalized")

model_dict: dict = {}
jobs: dict[str, dict] = {}
_executor = ThreadPoolExecutor(max_workers=2)

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    model_dict.update(load_model(MODEL_DIR))
    yield
    model_dict.clear()
    _executor.shutdown(wait=False)


app = FastAPI(lifespan=lifespan)


def _run_job(job_id: str, tmp_path: str, num_speakers: int | None) -> None:
    try:
        result = predict_fn(
            {"video_path": tmp_path, "num_speakers": num_speakers}, model_dict
        )
        jobs[job_id] = {"status": "completed", "result": result}
    except Exception as e:
        jobs[job_id] = {"status": "failed", "error": str(e)}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.post("/jobs")
async def create_job(
    file: UploadFile = File(...),
    num_speakers: int | None = Form(default=None),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp_path = tmp.name
        tmp.write(await file.read())

    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "processing"}

    loop = asyncio.get_running_loop()
    loop.run_in_executor(_executor, _run_job, job_id, tmp_path, num_speakers)

    return JSONResponse(content={"job_id": job_id})


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JSONResponse(content=job)


# Keep /infer for local CLI usage
@app.post("/infer")
async def infer(
    file: UploadFile = File(...),
    num_speakers: int | None = Form(default=None),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp_path = tmp.name
        tmp.write(await file.read())

    try:
        result = predict_fn({"video_path": tmp_path, "num_speakers": num_speakers}, model_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return JSONResponse(content=result)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
