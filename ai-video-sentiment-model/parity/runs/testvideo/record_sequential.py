"""One-off: record with the OLD order (Whisper, then speaker detection, then
lines), using the same helper functions, so it can be compared with the new
parallel order. Usage: python record_sequential.py VIDEO --out DIR"""

import os
import sys
from pathlib import Path

PARITY = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PARITY))
sys.path.insert(0, str(PARITY.parent / "deployment"))

import inference  # noqa: E402
import dump_golden  # noqa: E402


def predict_sequential(input_data, md):
    video = input_data["video_path"]
    result = md["transcriber"].transcribe(video, word_timestamps=True)
    diarization, wav = (inference._diarize(md["diarization"], video)
                        if md.get("diarization") is not None else (None, None))
    try:
        return inference._predict_lines(result, diarization, video, md["model"], md["tokenizer"], md["device"])
    finally:
        if wav and os.path.exists(wav):
            os.remove(wav)


inference.predict_fn = predict_sequential
sys.exit(dump_golden.main())
