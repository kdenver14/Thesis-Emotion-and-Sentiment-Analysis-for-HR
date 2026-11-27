"""Self-check for compare_runs.py on made-up runs (no videos or models needed).

  ./venv/bin/python ../parity/test_compare_runs.py      (from deployment/)
"""

import argparse
import copy
import json
import shutil
import tempfile
from pathlib import Path

import numpy as np

import compare_runs as cr

TOL = argparse.Namespace(prob_tol=1e-4, mel_tol=1e-5, time_tol=0.0, speaker_min=1.0)


def make_run(folder: Path, emotion_probs: list[list[float]], texts: list[str], speakers: list[str]) -> Path:
    (folder / "lines").mkdir(parents=True)
    lines = []
    for i, (probs, text, spk) in enumerate(zip(emotion_probs, texts, speakers)):
        np.savez_compressed(
            folder / "lines" / f"{i:04d}.npz",
            emotion_probs=np.array(probs, dtype=np.float32),
            sentiment_probs=np.array([0.2, 0.7, 0.1], dtype=np.float32),
            mel=np.full((1, 64, 300), i, dtype=np.float32),
            input_ids=np.arange(128) + i,
            attention_mask=np.ones(128, dtype=np.int64),
        )
        lines.append({"i": i, "start": float(i), "end": i + 0.9, "text": text, "speaker": spk,
                      "status": "ok", "frames_sha256": f"hash{i}"})
    run = {"video_sha256": "abc", "timings_s": {"whisper": 1.0}, "lines": lines}
    (folder / "run.json").write_text(json.dumps(run))
    return folder


def check(golden: Path, cand: Path) -> cr.Report:
    return cr.compare_video(cr.load_run_folder(golden), cr.load_run_folder(cand), TOL)


def main() -> None:
    tmp = Path(tempfile.mkdtemp())
    try:
        probs = [[0.1, 0.1, 0.1, 0.1, 0.5, 0.05, 0.05], [0.05, 0.05, 0.05, 0.05, 0.1, 0.6, 0.1]]
        texts, speakers = [" Hello there.", " I am sad."], ["SPEAKER_00", "SPEAKER_01"]
        golden = make_run(tmp / "golden", probs, texts, speakers)

        same = make_run(tmp / "same", probs, texts, ["X", "Y"])
        assert check(golden, same).passed, "identical numbers with renamed speakers must pass"

        flipped = copy.deepcopy(probs)
        flipped[1] = [0.05, 0.05, 0.05, 0.05, 0.6, 0.1, 0.1]  # sadness -> neutral
        rep = check(golden, make_run(tmp / "flip", flipped, texts, speakers))
        assert not rep.passed and any("LABEL" in c and "sadness" in c for c in rep.changes), rep.changes

        tiny = copy.deepcopy(probs)
        tiny[0][4] += 5e-5  # under the 1e-4 limit, same labels
        assert check(golden, make_run(tmp / "tiny", tiny, texts, speakers)).passed

        rep = check(golden, make_run(tmp / "text", probs, [" Hello there.", " I am glad."], speakers))
        assert not rep.passed and any("not in candidate" in c for c in rep.changes), rep.changes

        rep = check(golden, make_run(tmp / "spk", probs, texts, ["SPEAKER_00", "SPEAKER_00"]))
        assert not rep.passed and any(name == "speakers" and not ok for name, _, ok in rep.rows)

        result = {"utterances": [{"start_time": 0.0, "end_time": 0.9, "text": " Hi.", "speaker": None,
                                  "emotions": [{"label": "neutral", "confidence": 0.5}],
                                  "sentiments": [{"label": "neutral", "confidence": 0.7}]}]}
        a, b = tmp / "a.json", tmp / "b.json"
        a.write_text(json.dumps(result))
        result["utterances"][0]["emotions"][0] = {"label": "joy", "confidence": 0.5}
        b.write_text(json.dumps(result))
        assert cr.compare_video(cr.load_result_json(a), cr.load_result_json(a), TOL).passed
        assert not cr.compare_video(cr.load_result_json(a), cr.load_result_json(b), TOL).passed
        print("compare_runs self-check: all 7 cases pass")
    finally:
        shutil.rmtree(tmp)


if __name__ == "__main__":
    main()
