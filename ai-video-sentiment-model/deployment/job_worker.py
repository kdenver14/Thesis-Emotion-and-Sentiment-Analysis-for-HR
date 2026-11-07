"""Analyze one video in its own process (spawned by server.py).

A separate process lets the server stop a running analysis instantly
(cancel) and frees all model memory after every video. The analysis itself
is the unchanged load_model + predict_fn path.

Usage: python job_worker.py <video_path> <result_json_path>
Writes {"result": ...} on success or {"error": "..."} on failure.
"""

import json
import os
import sys
import traceback

from inference import load_model, predict_fn

MODEL_DIR = os.environ.get("MODEL_DIR", "../../model_normalized")
# Lower CPU priority, so the web server on the same Mac stays responsive while
# a video is analysed. Scheduling only: the computation and results are unchanged.
WORKER_NICENESS = 10


def main() -> int:
    video_path, out_path = sys.argv[1], sys.argv[2]
    os.nice(WORKER_NICENESS)
    try:
        result = predict_fn({"video_path": video_path}, load_model(MODEL_DIR))
        payload, code = {"result": result}, 0
    except Exception as exc:  # noqa: BLE001 - reported to the server, which reports it to the web app
        traceback.print_exc()
        payload, code = {"error": str(exc)}, 1
    # Write then rename, so the server never reads a half-written file.
    tmp_path = out_path + ".tmp"
    with open(tmp_path, "w") as f:
        json.dump(payload, f)
    os.replace(tmp_path, out_path)
    return code


if __name__ == "__main__":
    sys.exit(main())
