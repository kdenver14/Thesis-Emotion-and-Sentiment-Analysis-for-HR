import logging
import os
import tempfile
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from inference import load_model, predict_fn

logger = logging.getLogger("inference-server")

MODEL_DIR = os.environ.get("MODEL_DIR", "../../model_normalized")

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB
CHUNK_BYTES = 1024 * 1024  # 1 MB

model_dict: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    model_dict.update(load_model(MODEL_DIR))
    yield
    model_dict.clear()


app = FastAPI(lifespan=lifespan)

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi"}


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
        result = predict_fn({"video_path": tmp_path}, model_dict)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Inference failed")
        raise HTTPException(status_code=500, detail="Inference failed")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return JSONResponse(content=result)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
