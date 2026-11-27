"""Can ONNX Runtime run the model in place of PyTorch? Checks, on every
recorded line, that it gives the same answers, and measures how much faster
it is.

Needs a golden run made with --keep-frames, and its own venv, so the
validated deployment venv is never changed:

  cd ai-video-sentiment-model/parity
  ../deployment/venv/bin/python -m venv onnx-venv.nosync
  ./onnx-venv.nosync/bin/pip install torch==2.5.1 torchvision==0.20.1 \\
      transformers==4.47.1 numpy==1.26.4 onnx onnxruntime
  ./onnx-venv.nosync/bin/python onnx_check.py runs/python

Gate: the same top-1 label and top-3 order on every line, and probabilities
within 1e-4 of PyTorch. CPU only: the CoreML provider computes in fp16.
"""

import argparse
import hashlib
import json
import statistics
import sys
import time
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "deployment"))
from models import MultimodalSentimentModel  # noqa: E402  (the deployed model code)

MODEL_PATH = HERE.parent.parent / "model_normalized" / "model.pth"
DEFAULT_ONNX = HERE / "onnx-out.nosync" / "model.onnx"
INPUT_NAMES = ["input_ids", "attention_mask", "video_frames", "audio_features"]
OPSET = 17


class Flat(torch.nn.Module):
    """The model with plain tensor inputs and outputs, as ONNX needs."""

    def __init__(self, model: torch.nn.Module) -> None:
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask, video_frames, audio_features):
        out = self.model({"input_ids": input_ids, "attention_mask": attention_mask}, video_frames, audio_features)
        return out["emotions"], out["sentiments"]


def load_model() -> Flat:
    """Same as inference.load_model on CPU: weights loaded, eval mode."""
    model = MultimodalSentimentModel()
    model.load_state_dict(torch.load(MODEL_PATH, map_location="cpu", weights_only=True))
    return Flat(model.eval()).eval()


def line_inputs(arrays: dict) -> tuple[torch.Tensor, ...]:
    """Rebuild exactly what predict_fn fed the model for this line."""
    frames = (arrays["frames_u8"].astype(np.float64) / 255.0).astype(np.float32)  # cv2 frame / 255.0, then FloatTensor
    return (
        torch.from_numpy(arrays["input_ids"]).unsqueeze(0),
        torch.from_numpy(arrays["attention_mask"]).unsqueeze(0),
        torch.from_numpy(frames).unsqueeze(0),
        torch.from_numpy(arrays["mel"]).unsqueeze(0),
    )


def recorded_lines(root: Path):
    runs = [root] if (root / "run.json").exists() else sorted(d for d in root.iterdir() if (d / "run.json").exists())
    for run in runs:
        for line in json.loads((run / "run.json").read_text())["lines"]:
            path = run / "lines" / f"{line['i']:04d}.npz"
            if line["status"] == "ok" and path.exists():
                with np.load(path) as data:
                    arrays = {k: data[k] for k in data.files}
                if "frames_u8" not in arrays:
                    sys.exit(f"{run.name}: no frames stored; record it again with dump_golden.py --keep-frames")
                yield run.name, line, arrays


def probs(logits) -> np.ndarray:
    return torch.softmax(torch.as_tensor(np.asarray(logits)), dim=1)[0].numpy()


def top3(p: np.ndarray) -> list[int]:
    return list(np.argsort(-p, kind="stable")[:3])


def export(model: Flat, sample: tuple, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with torch.no_grad():
        torch.onnx.export(model, sample, str(path), input_names=INPUT_NAMES,
                          output_names=["emotions", "sentiments"], opset_version=OPSET)


def timed(fn):
    start = time.perf_counter()
    out = fn()
    return out, (time.perf_counter() - start) * 1000


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("runs", type=Path, help="golden runs folder (or one run folder), made with --keep-frames")
    parser.add_argument("--onnx", type=Path, default=DEFAULT_ONNX)
    parser.add_argument("--prob-tol", type=float, default=1e-4)
    args = parser.parse_args()

    import onnxruntime as ort

    lines = list(recorded_lines(args.runs))
    if not lines:
        sys.exit("No recorded lines found.")
    model = load_model()
    if not args.onnx.exists():
        print(f"exporting the model to {args.onnx} ...", flush=True)
        export(model, line_inputs(lines[0][2]), args.onnx)
    session = ort.InferenceSession(str(args.onnx), providers=["CPUExecutionProvider"])

    def run_both(inputs):
        with torch.inference_mode():
            (te, ts), t_ms = timed(lambda: model(*inputs))
        (oe, os_), o_ms = timed(lambda: session.run(None, {n: x.numpy() for n, x in zip(INPUT_NAMES, inputs)}))
        return (te, ts, oe, os_), t_ms, o_ms

    run_both(line_inputs(lines[0][2]))  # warm-up, not timed
    hash_ok, golden_max, onnx_max, flips, order = 0, 0.0, 0.0, [], []
    torch_ms, onnx_ms = [], []
    for name, line, arrays in lines:
        inputs = line_inputs(arrays)
        hash_ok += hashlib.sha256(inputs[2][0].numpy().tobytes()).hexdigest() == line.get("frames_sha256")
        (te, ts, oe, os_), t_ms, o_ms = run_both(inputs)
        torch_ms.append(t_ms)
        onnx_ms.append(o_ms)
        pt = (probs(te), probs(ts))
        ox = (probs(oe), probs(os_))
        golden_max = max(golden_max, float(np.abs(pt[0] - arrays["emotion_probs"]).max()),
                         float(np.abs(pt[1] - arrays["sentiment_probs"]).max()))
        onnx_max = max(onnx_max, float(np.abs(pt[0] - ox[0]).max()), float(np.abs(pt[1] - ox[1]).max()))
        where = f"{name} line {line['i']} \"{line['text'].strip()[:40]}\""
        if top3(pt[0])[0] != top3(ox[0])[0] or top3(pt[1])[0] != top3(ox[1])[0]:
            flips.append(where)
        elif top3(pt[0]) != top3(ox[0]) or top3(pt[1]) != top3(ox[1]):
            order.append(where)

    passed = not flips and not order and onnx_max <= args.prob_tol
    t_med, o_med = statistics.median(torch_ms), statistics.median(onnx_ms)
    print(f"lines checked: {len(lines)}")
    print(f"rebuilt inputs: frames identical on {hash_ok}/{len(lines)} lines; "
          f"PyTorch now vs recorded probabilities: max diff {golden_max:.1e}")
    print(f"ONNX vs PyTorch: max probability diff {onnx_max:.1e} (limit {args.prob_tol:.0e}), "
          f"{len(flips)} label flips, {len(order)} top-3 order changes -> {'PASS' if passed else 'FAIL'}")
    for where in flips[:20]:
        print(f"  label flip: {where}")
    for where in order[:20]:
        print(f"  top-3 order: {where}")
    print(f"speed per line (median of {len(lines)}): PyTorch {t_med:.0f} ms, ONNX Runtime {o_med:.0f} ms "
          f"-> {t_med / o_med:.2f}x  (threads: torch {torch.get_num_threads()})")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
