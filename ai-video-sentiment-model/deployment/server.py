import os
import tempfile
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from inference import load_model, predict_fn

MODEL_DIR = os.environ.get("MODEL_DIR", "../../model_normalized")

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

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp_path = tmp.name
        tmp.write(await file.read())

    try:
        result = predict_fn({"video_path": tmp_path}, model_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return JSONResponse(content=result)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
