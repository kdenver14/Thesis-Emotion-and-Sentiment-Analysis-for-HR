"""Run the same requests against server.py and the Rust server and check
that they behave the same (Phase 1 parity).

From ai-video-sentiment-model/deployment/:
  set -a; source .env; set +a          # HF_TOKEN for speaker detection
  ./venv/bin/python ../parity/test_server_contract.py VIDEO.mp4

It never touches the real server or its jobs: each server gets a temporary
jobs folder, test tokens and its own port, and callbacks go to a local mock
that checks every signature. A short video (under a minute) keeps it quick.
"""

import argparse
import functools
import hashlib
import hmac
import json
import os
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

import compare_runs

HERE = Path(__file__).resolve().parent
DEPLOYMENT = HERE.parent / "deployment"
RUST_BIN = HERE.parent / "rust" / "target.nosync" / "release" / "inference-server"
PORTS = {"python": 8765, "rust": 8766}
CALLBACK_PORT, FILES_PORT, SLOW_FILES_PORT = 8767, 8768, 8769
SLOW_STEPS, SLOW_DELAY_S = 40, 0.1  # the slow file server takes about 4 s per video
RESTART_MESSAGE = ("The analysis server restarted before the video finished downloading. "
                   "Please upload it again.")
# What each test job must end with, on both servers: (status, error) per callback.
EXPECTED = {
    "resume": [("completed", None)],
    "lost": [("failed", RESTART_MESSAGE)],
    "done": [("completed", None)],
    "nofile": [("failed", "Video download failed: HTTP 404")],
    "gone": [("completed", None)],  # the web app answers 404: dropped, never retried
    "cancel": [],
}
TOKEN, SECRET = secrets.token_hex(16), secrets.token_hex(16)
WAIT_S = 600
QUIET_S = 25  # how long a cancelled or dropped job must stay silent

CALLS: list[dict] = []
CALLS_LOCK = threading.Lock()


class CallbackMock(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        expected = "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
        payload = json.loads(body)
        with CALLS_LOCK:
            CALLS.append({"sig_ok": hmac.compare_digest(expected, self.headers.get("X-Inference-Signature", "")),
                          "payload": payload})
        self.send_response(404 if payload.get("sessionId", "").endswith("gone") else 200)
        self.end_headers()

    def log_message(self, *args):
        pass


class QuietFiles(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class SlowFiles(QuietFiles):
    """Serves files slowly, so a test can stop a server mid-download."""

    def copyfile(self, source, outputfile):
        data = source.read()
        step = max(1, len(data) // SLOW_STEPS)
        try:
            for i in range(0, len(data), step):
                outputfile.write(data[i:i + step])
                outputfile.flush()
                time.sleep(SLOW_DELAY_S)
        except (BrokenPipeError, ConnectionResetError):
            pass  # expected: the test stops the server mid-download


def serve(handler, port):
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def request(port, path, body=None, auth=True, raw=None, files=None):
    url = f"http://127.0.0.1:{port}{path}"
    headers = {"Authorization": f"Bearer {TOKEN}"} if auth else {}
    if files:
        boundary = secrets.token_hex(8)
        name, content = files
        data = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\n"
                f"Content-Type: application/octet-stream\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    else:
        data = raw if raw is not None else json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=WAIT_S) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def sid(kind, tag):
    """A valid session id (lowercase letters and digits, 20-40) that ends with the tag."""
    return f"{kind[:2]}{'0' * 18}{tag}"


def start_server(kind, jobs_dir, log_path):
    env = {**os.environ, "PORT": str(PORTS[kind]), "JOBS_DIR": str(jobs_dir), "MODAL_TRIGGER_TOKEN": TOKEN,
           "INFERENCE_CALLBACK_SECRET": SECRET, "CALLBACK_URL": f"http://127.0.0.1:{CALLBACK_PORT}/cb"}
    cmd = [sys.executable, "server.py"] if kind == "python" else [str(RUST_BIN)]
    proc = subprocess.Popen(cmd, cwd=DEPLOYMENT, env=env, stdout=log_path.open("w"), stderr=subprocess.STDOUT)
    for _ in range(120):
        try:
            if request(PORTS[kind], "/cancel", {}, auth=False)[0] == 401:
                return proc
        except OSError:
            time.sleep(0.5)
    proc.kill()
    raise RuntimeError(f"{kind} server did not start; see {log_path}")


def calls_for(session):
    with CALLS_LOCK:
        return [c for c in CALLS if c["payload"].get("sessionId") == session]


def wait_for(sessions):
    deadline = time.time() + WAIT_S
    while time.time() < deadline and not all(calls_for(s) for s in sessions):
        time.sleep(1)


def error_cases(port):
    good = {"sessionId": "a" * 25, "videoUrl": "http://127.0.0.1:1/x.mp4", "callbackUrl": "http://x/cb"}
    cases = {
        "trigger without token": request(port, "/trigger", good, auth=False),
        "trigger without videoUrl": request(port, "/trigger", {**good, "videoUrl": ""}),
        "trigger with path in sessionId": request(port, "/trigger", {**good, "sessionId": "../../etc/passwd0000000"}),
        "trigger with .exe": request(port, "/trigger", {**good, "ext": ".exe"}),
        "cancel without token": request(port, "/cancel", {"sessionId": "a" * 25}, auth=False),
        "cancel with bad sessionId": request(port, "/cancel", {"sessionId": "x"}),
        "cancel unknown job": request(port, "/cancel", {"sessionId": "b" * 25}),
        "infer with .txt": request(port, "/infer", files=("notes.txt", b"hello")),
    }
    status_only = {"trigger with broken JSON": request(port, "/trigger", raw=b"{not json")[0]}
    return cases, status_only


def outcome(calls):
    return [(c.get("status"), c.get("error")) for c in calls]


def infer_temp_files():
    return {p.name for p in Path(tempfile.gettempdir()).glob("infer-*")}


def drain_suite(kind, video, work):
    """Stop the server while a download is running: the job must not be
    lost. It must be on disk after the stop and complete after a restart."""
    jobs_dir = work / f"drain-{kind}"
    jobs_dir.mkdir()
    s = sid(kind, "drain")
    proc = start_server(kind, jobs_dir, work / f"{kind}-drain-1.log")
    request(PORTS[kind], "/trigger", {"sessionId": s, "videoUrl": f"http://127.0.0.1:{SLOW_FILES_PORT}/{video.name}",
                                      "ext": ".mp4", "callbackUrl": "http://unused/cb"})
    time.sleep(1)  # the download is now in progress
    proc.send_signal(signal.SIGTERM)
    proc.wait(timeout=120)
    kept, calls_at_stop = sorted(p.name for p in jobs_dir.iterdir()), len(calls_for(s))
    proc = start_server(kind, jobs_dir, work / f"{kind}-drain-2.log")
    try:
        wait_for([s])
        return {"kept": kept, "calls_at_stop": calls_at_stop, "after_restart": outcome([c["payload"] for c in calls_for(s)]),
                "leftover": sorted(p.name for p in jobs_dir.iterdir()), "sid": s}
    finally:
        proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=60)


def tty_suite(kind, video, work):
    """Run one job with the server inside a real terminal, as when started by
    hand. A worker left in a background group of the terminal gets frozen
    (SIGTTIN) as soon as ffmpeg checks the keyboard."""
    jobs_dir = work / f"tty-{kind}"
    jobs_dir.mkdir()
    env = {**os.environ, "PORT": str(PORTS[kind]), "JOBS_DIR": str(jobs_dir), "MODAL_TRIGGER_TOKEN": TOKEN,
           "INFERENCE_CALLBACK_SECRET": SECRET, "CALLBACK_URL": f"http://127.0.0.1:{CALLBACK_PORT}/cb"}
    server = [sys.executable, "server.py"] if kind == "python" else [str(RUST_BIN)]
    wrapper = subprocess.Popen(["script", "-q", "/dev/null", *server], cwd=DEPLOYMENT, env=env, stdin=subprocess.PIPE,
                               stdout=(work / f"{kind}-tty.log").open("w"), stderr=subprocess.STDOUT)
    s = sid(kind, "tty")
    try:
        for _ in range(120):
            try:
                if request(PORTS[kind], "/cancel", {}, auth=False)[0] == 401:
                    break
            except OSError:
                time.sleep(0.5)
        request(PORTS[kind], "/trigger", {"sessionId": s, "videoUrl": f"http://127.0.0.1:{FILES_PORT}/{video.name}",
                                          "ext": ".mp4", "callbackUrl": "http://unused/cb"})
        wait_for([s])
        return outcome([c["payload"] for c in calls_for(s)])
    finally:
        # Stop the server itself (the child of `script`), never by name.
        for pid in subprocess.run(["pgrep", "-P", str(wrapper.pid)], capture_output=True, text=True).stdout.split():
            os.kill(int(pid), signal.SIGTERM)
        wrapper.wait(timeout=60)


def run_suite(kind, video, work):
    jobs_dir = work / f"jobs-{kind}"
    jobs_dir.mkdir()
    temp_before = infer_temp_files()
    s = {name: sid(kind, name) for name in ("resume", "lost", "done", "nofile", "cancel", "gone")}
    shutil.copy(video, jobs_dir / f"{s['resume']}.mp4")
    for name in ("resume", "lost"):
        (jobs_dir / f"{s[name]}.json").write_text(json.dumps({"sessionId": s[name], "ext": ".mp4", "callbackUrl": "http://unused/cb"}))
    proc = start_server(kind, jobs_dir, work / f"{kind}.log")
    try:
        port, files_url = PORTS[kind], f"http://127.0.0.1:{FILES_PORT}"
        out = {"errors": error_cases(port)}
        for name, file in (("done", video.name), ("nofile", "missing.mp4"), ("gone", video.name), ("cancel", video.name)):
            request(port, "/trigger", {"sessionId": s[name], "videoUrl": f"{files_url}/{file}", "ext": ".mp4", "callbackUrl": "http://unused/cb"})
        time.sleep(2)
        out["cancel_response"] = request(port, "/cancel", {"sessionId": s["cancel"]})
        out["infer"] = request(port, "/infer", files=(video.name, video.read_bytes()))
        wait_for([s["resume"], s["lost"], s["done"], s["nofile"], s["gone"]])
        time.sleep(QUIET_S)
        out["callbacks"] = {name: [{"sig_ok": c["sig_ok"], **c["payload"]} for c in calls_for(s[name])] for name in s}
        out["leftover_files"] = sorted(p.name for p in jobs_dir.iterdir())
        out["infer_temp_left"] = sorted(infer_temp_files() - temp_before)
        return out
    finally:
        proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=30)


def same(py, rs):
    return py == rs, "same" if py == rs else f"python {py} | rust {rs}"


def callback_result(calls):
    return calls[0].get("result") if calls else None


def infer_result(response):
    status, body = response
    return body if status == 200 else None


def same_results(py, rs, work):
    """Analysis results from both servers must be identical, every number
    exactly. On a mismatch, compare_runs explains where."""
    notes = []
    for label, a, b in (("trigger", callback_result(py["callbacks"]["done"]), callback_result(rs["callbacks"]["done"])),
                        ("infer", infer_result(py["infer"]), infer_result(rs["infer"]))):
        if not (isinstance(a, dict) and isinstance(b, dict) and a.get("utterances")):
            return False, f"{label}: missing or empty result"
        if a != b:
            pa, pb = work / f"{label}-python.json", work / f"{label}-rust.json"
            pa.write_text(json.dumps(a))
            pb.write_text(json.dumps(b))
            exact = argparse.Namespace(prob_tol=0.0, mel_tol=0.0, time_tol=0.0, speaker_min=1.0)
            rep = compare_runs.compare_video(compare_runs.load_result_json(pa), compare_runs.load_result_json(pb), exact)
            return False, f"{label}: results differ; " + "; ".join(rep.changes[:3] or [r[1] for r in rep.rows if not r[2]])
        notes.append(f"{label}: {len(a['utterances'])} lines identical")
    return True, ", ".join(notes)


def expected_rows(py, rs):
    rows = []
    for name, want in EXPECTED.items():
        got_py, got_rs = outcome(py["callbacks"][name]), outcome(rs["callbacks"][name])
        rows.append((f"expected: {name}", got_py == want and got_rs == want,
                     f"want {want}" if got_py == want and got_rs == want else f"want {want} | python {got_py} | rust {got_rs}"))
    # Intended difference: server.py abandons a running download on stop (the
    # user must upload again); the Rust server finishes it first, so the job
    # completes after the restart.
    for kind, drain in (("python", py["drain"]), ("rust", rs["drain"])):
        sid_ = drain["sid"]
        want = ({"kept": [f"{sid_}.json", f"{sid_}.mp4.part"], "after_restart": [("failed", RESTART_MESSAGE)]}
                if kind == "python" else
                {"kept": [f"{sid_}.json", f"{sid_}.mp4"], "after_restart": [("completed", None)]})
        want |= {"calls_at_stop": 0, "leftover": []}
        got = {k: drain[k] for k in want}
        rows.append((f"stop mid-download ({kind})", got == want,
                     f"after restart: {want['after_restart'][0][0]}" if got == want else f"got {got}"))
    for kind, got in (("python", py["tty"]), ("rust", rs["tty"])):
        rows.append((f"started in a terminal ({kind})", got == [("completed", None)], f"got {got}"))
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("video", type=Path)
    args = parser.parse_args()
    if not RUST_BIN.exists():
        parser.error(f"build the Rust server first: cd {RUST_BIN.parents[2]} && cargo build --release")
    video = args.video.resolve()
    work = Path(tempfile.mkdtemp(prefix="server-contract-"))
    serve(CallbackMock, CALLBACK_PORT)
    serve(functools.partial(QuietFiles, directory=str(video.parent)), FILES_PORT)
    serve(functools.partial(SlowFiles, directory=str(video.parent)), SLOW_FILES_PORT)
    runs = {}
    for kind in ("python", "rust"):
        print(f"running the suite against the {kind} server ...", flush=True)
        runs[kind] = run_suite(kind, video, work)
        runs[kind]["drain"] = drain_suite(kind, video, work)
        runs[kind]["tty"] = tty_suite(kind, video, work)
    py, rs = runs["python"], runs["rust"]
    def strip(calls):  # session ids differ per server; results are compared separately
        return [{k: v for k, v in c.items() if k not in ("sessionId", "result")} for c in calls]

    rows = [(f"error: {k}", *same(v, rs["errors"][0][k])) for k, v in py["errors"][0].items()]
    rows += [(f"error: {k}", *same(v, rs["errors"][1][k])) for k, v in py["errors"][1].items()]
    rows += [(f"callback: {k}", *same(strip(py["callbacks"][k]), strip(rs["callbacks"][k]))) for k in py["callbacks"]]
    rows += [("cancel response", *same(py["cancel_response"], rs["cancel_response"])),
             ("jobs folder empty", rs["leftover_files"] == [] and py["leftover_files"] == [],
              f"python {py['leftover_files']} | rust {rs['leftover_files']}"),
             ("signatures valid", all(c["sig_ok"] for r in (py, rs) for cs in r["callbacks"].values() for c in cs),
              "checked every callback"),
             ("/infer temp files removed", not rs["infer_temp_left"], f"rust left {rs['infer_temp_left']}"),
             ("results", *same_results(py, rs, work))]
    rows += expected_rows(py, rs)
    for name, ok, detail in rows:
        print(f"  {name:<36}{'ok  ' if ok else 'FAIL'}  {detail[:110]}")
    passed = all(ok for _, ok, _ in rows)
    print(f"\n{'PASS' if passed else 'FAIL'}  (server logs and outputs in {work})")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
