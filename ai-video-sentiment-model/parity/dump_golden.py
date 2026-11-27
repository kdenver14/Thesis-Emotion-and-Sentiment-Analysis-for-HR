"""Record exactly what today's Python pipeline does, so a rewrite can be
checked against it line by line.

Runs the unchanged inference.load_model + predict_fn on each video. Every
stage is observed by wrapping it (inference.py itself is not modified), and
per video this writes:

  <out>/<video stem>/run.json          versions, stage timings, Whisper
                                       segments, speaker turns, final result
  <out>/<video stem>/lines/NNNN.npz    per line: mel, token ids, full emotion
                                       and sentiment probabilities and logits
                                       (+ frames_u8 with --keep-frames)

The frames are always checked through frames_sha256 (stored in run.json):
SHA-256 of the float32 [30, 3, 224, 224] tensor the model received.

Usage, from ai-video-sentiment-model/deployment/:
  set -a; source .env; set +a          # HF_TOKEN for speaker detection
  ./venv/bin/python ../parity/dump_golden.py VIDEO [VIDEO ...] --out ../parity/runs/python
"""

import argparse
import datetime
import hashlib
import json
import os
import platform
import random
import subprocess
import sys
import threading
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DEPLOYMENT = HERE.parent / "deployment"
sys.path.insert(0, str(DEPLOYMENT))
MODEL_DIR = Path(os.environ.get("MODEL_DIR", HERE.parent.parent / "model_normalized"))
HASH_CHUNK = 1024 * 1024


class Recorder:
    """What one predict_fn call did. Worker threads write, so writes lock."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.local = threading.local()  # .index = line being prepared on this thread
        self.times: dict[str, float] = {}
        self.lines: dict[int, dict] = {}
        self.errors: dict[int, str] = {}
        self.segments: list[dict] = []
        self.turns: list[list] = []
        self.index_of: dict[tuple[float, float], int] = {}
        self.index_of_mel: dict[int, int] = {}  # mel tensor data_ptr -> line

    def add_time(self, stage: str, seconds: float) -> None:
        with self.lock:
            self.times[stage] = self.times.get(stage, 0.0) + seconds

    def put(self, i: int, **values) -> None:
        with self.lock:
            self.lines.setdefault(i, {}).update(values)

    def fail(self, i, message: str) -> None:
        if i is not None:
            with self.lock:
                self.errors.setdefault(i, message)


REC = Recorder()


def mel_key(mel) -> str:
    """Identifies a line by its audio features, on CPU or GPU."""
    return hashlib.sha1(mel.detach().cpu().contiguous().numpy().tobytes()).hexdigest()


def timed(stage, fn, *args, **kwargs):
    start = time.perf_counter()
    try:
        return fn(*args, **kwargs)
    finally:
        REC.add_time(stage, time.perf_counter() - start)


def install_wrappers(inference, model_dict: dict, keep_frames: bool) -> None:
    """Observe every stage predict_fn runs. Each wrapper returns the real
    result untouched, so the pipeline's behaviour is unchanged."""
    import torch

    real = dict(model_dict)

    class Transcriber:
        def transcribe(self, *args, **kwargs):
            result = timed("whisper", real["transcriber"].transcribe, *args, **kwargs)
            REC.segments = result["segments"]
            for i, seg in enumerate(result["segments"]):
                REC.index_of.setdefault((seg["start"], seg["end"]), i)
            return result

    class Diarizer:
        def __call__(self, *args, **kwargs):
            result = timed("pyannote", real["diarization"], *args, **kwargs)
            REC.turns = [[t.start, t.end, spk] for t, _, spk in result.itertracks(yield_label=True)]
            return result

    class Tokenizer:
        def __call__(self, *args, **kwargs):
            out = timed("tokenize", real["tokenizer"], *args, **kwargs)
            i = getattr(REC.local, "index", None)
            if i is not None:
                REC.put(i, input_ids=out["input_ids"][0].numpy(),
                        attention_mask=out["attention_mask"][0].numpy())
            return out

    class Model:
        def __call__(self, text_inputs, video_frames, audio_features):
            def forward():
                out = real["model"](text_inputs, video_frames, audio_features)
                if out["emotions"].device.type == "mps":
                    torch.mps.synchronize()  # GPU work is async; time it fully
                return out

            out = timed("model", forward)
            # On a GPU the input is a copy, so the line is found by its mel content.
            i = REC.index_of_mel.get(mel_key(audio_features[0]))
            if i is not None:
                REC.put(
                    i,
                    emotion_logits=out["emotions"][0].float().cpu().numpy(),
                    sentiment_logits=out["sentiments"][0].float().cpu().numpy(),
                    emotion_probs=torch.softmax(out["emotions"], dim=1)[0].float().cpu().numpy(),
                    sentiment_probs=torch.softmax(out["sentiments"], dim=1)[0].float().cpu().numpy(),
                )
            return out

    model_dict["transcriber"] = Transcriber()
    model_dict["tokenizer"] = Tokenizer()
    model_dict["model"] = Model()
    if real.get("diarization") is not None:
        model_dict["diarization"] = Diarizer()

    vup, vp, ap = inference.VideoUtteranceProcessor, inference.VideoProcessor, inference.AudioProcessor
    if getattr(vup, "_parity_wrapped", False):
        return  # class methods are wrapped once; they read the current REC
    vup._parity_wrapped = True
    real_cut, real_frames, real_mel = vup.extract_segment, vp.process_video, ap.extract_features

    def extract_segment(self, video_path, start_time, end_time, *args, **kwargs):
        i = REC.index_of.get((start_time, end_time))
        REC.local.index = i
        try:
            return timed("ffmpeg_cut", real_cut, self, video_path, start_time, end_time, *args, **kwargs)
        except Exception as exc:
            REC.fail(i, f"extract_segment: {exc}")
            raise

    def process_video(self, path, *args, **kwargs):
        i = getattr(REC.local, "index", None)
        try:
            frames = timed("frames", real_frames, self, path, *args, **kwargs)
        except Exception as exc:
            REC.fail(i, f"frames: {exc}")
            raise
        if i is not None:
            arr = np.ascontiguousarray(frames.numpy())
            REC.put(i, frames_sha256=hashlib.sha256(arr.tobytes()).hexdigest())
            if keep_frames:
                # The model saw uint8/255 in float64, cast to float32; this undoes it exactly.
                REC.put(i, frames_u8=np.rint(arr.astype(np.float64) * 255).astype(np.uint8))
        return frames

    def extract_features(self, path, *args, **kwargs):
        i = getattr(REC.local, "index", None)
        try:
            mel = timed("mel", real_mel, self, path, *args, **kwargs)
        except Exception as exc:
            REC.fail(i, f"mel: {exc}")
            raise
        if i is not None:
            REC.put(i, mel=mel.numpy().astype(np.float32))
            with REC.lock:
                REC.index_of_mel[mel_key(mel)] = i
        return mel

    vup.extract_segment, vp.process_video, ap.extract_features = extract_segment, process_video, extract_features


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(HASH_CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def versions() -> dict:
    import cv2
    import torch
    import transformers
    import whisper

    found = {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "torch": torch.__version__,
        "opencv": cv2.__version__,
        "numpy": np.__version__,
        "transformers": transformers.__version__,
        "whisper": getattr(whisper, "__version__", "unknown"),
        "ffmpeg": subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout.splitlines()[0],
    }
    try:
        import pyannote.audio
        found["pyannote.audio"] = pyannote.audio.__version__
    except ImportError:
        found["pyannote.audio"] = "not installed"
    return found


def seed_everything(seed: int) -> None:
    """Whisper's temperature fallback samples; a fixed seed makes reruns
    repeatable. The pipeline itself is unchanged."""
    import torch

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def save_run(video: Path, out_dir: Path, result: dict, total_s: float, load_s: float, info: dict) -> dict:
    lines_dir = out_dir / "lines"
    lines_dir.mkdir(parents=True, exist_ok=True)
    speaker_of = {(u["start_time"], u["end_time"]): u.get("speaker") for u in result["utterances"]}
    lines = []
    for i, seg in enumerate(REC.segments):
        captured = REC.lines.get(i, {})
        arrays = {k: v for k, v in captured.items() if isinstance(v, np.ndarray)}
        if arrays:
            np.savez_compressed(lines_dir / f"{i:04d}.npz", **arrays)
        if "emotion_probs" in captured:
            status = "ok"
        elif i in REC.errors:
            status = "error"
        else:
            status = "no_output"
        lines.append({
            "i": i,
            "start": seg["start"],
            "end": seg["end"],
            "text": seg["text"],
            "speaker": speaker_of.get((seg["start"], seg["end"])),
            "status": status,
            "error": REC.errors.get(i),
            "frames_sha256": captured.get("frames_sha256"),
        })
    timings = {k: round(v, 3) for k, v in sorted(REC.times.items())}
    timings["load_models"] = round(load_s, 3)
    timings["total_analysis"] = round(total_s, 3)
    run = {
        "tool": "python",
        "created": datetime.datetime.now().isoformat(timespec="seconds"),
        "video": str(video),
        "video_sha256": file_sha256(video),
        **info,
        "timings_s": timings,
        "segments": [{"i": i, "start": s["start"], "end": s["end"], "text": s["text"]} for i, s in enumerate(REC.segments)],
        "turns": REC.turns,
        "lines": lines,
        "result": result,
    }
    (out_dir / "run.json").write_text(json.dumps(run, indent=1))
    return run


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("videos", nargs="+", type=Path)
    parser.add_argument("--out", type=Path, required=True, help="folder for the runs, one subfolder per video")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--keep-frames", action="store_true",
                        help="also store each line's frames (about 2-4 MB per line)")
    args = parser.parse_args()

    missing = [str(v) for v in args.videos if not v.is_file()]
    if missing:
        parser.error("not found: " + ", ".join(missing))
    if not os.environ.get("HF_TOKEN"):
        print("warning: HF_TOKEN not set, so there is no speaker detection (source deployment/.env first)")

    global REC
    import inference  # heavy imports only after the arguments are valid

    info = {"seed": args.seed, "versions": versions()}
    for video in args.videos:
        out_dir = args.out / video.stem
        if out_dir.exists():
            print(f"skip {video.name}: {out_dir} already exists")
            continue
        REC = Recorder()
        seed_everything(args.seed)
        print(f"== {video.name}")
        load_start = time.perf_counter()
        model_dict = inference.load_model(str(MODEL_DIR))
        load_s = time.perf_counter() - load_start
        install_wrappers(inference, model_dict, args.keep_frames)
        start = time.perf_counter()
        result = inference.predict_fn({"video_path": str(video.resolve())}, model_dict)
        run = save_run(video.resolve(), out_dir, result, time.perf_counter() - start, load_s, info)
        ok = sum(1 for line in run["lines"] if line["status"] == "ok")
        print(f"   {ok}/{len(run['lines'])} lines recorded -> {out_dir}")
        print("   seconds: " + ", ".join(f"{k} {v}" for k, v in run["timings_s"].items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
