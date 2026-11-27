"""Compare a candidate run against the golden run, line by line, and print
PASS or FAIL per video.

  python compare_runs.py GOLDEN CANDIDATE [--prob-tol 1e-4] [--mel-tol 1e-5]

GOLDEN and CANDIDATE are each one of:
  - a folder of run folders (dump_golden.py --out ...); videos pair by folder name
  - a single run folder (one that holds run.json)
  - a result JSON from POST /infer ({"utterances": [...]}); only the final
    labels and confidences are compared then

Exit code 0 when every video passes, 1 otherwise. Any changed label is a FAIL
and is listed; nothing is averaged away.
"""

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

EMOTIONS = ["anger", "disgust", "fear", "joy", "neutral", "sadness", "surprise"]
SENTIMENTS = ["negative", "neutral", "positive"]
MAX_LISTED = 30
SNIPPET = 45


@dataclass
class Run:
    name: str
    video_sha256: str | None
    timings: dict
    lines: list[dict]
    folder: Path | None  # None for a result-only JSON

    def arrays(self, i: int) -> dict:
        path = self.folder / "lines" / f"{i:04d}.npz" if self.folder else None
        if path is None or not path.exists():
            return {}
        with np.load(path) as data:
            return {k: data[k] for k in data.files}


@dataclass
class Report:
    rows: list[tuple[str, str, bool]] = field(default_factory=list)
    changes: list[str] = field(default_factory=list)

    def check(self, name: str, detail: str, ok: bool) -> None:
        self.rows.append((name, detail, ok))

    @property
    def passed(self) -> bool:
        return all(ok for _, _, ok in self.rows)


def load_run_folder(folder: Path) -> Run:
    run = json.loads((folder / "run.json").read_text())
    return Run(folder.name, run.get("video_sha256"), run.get("timings_s", {}), run["lines"], folder)


def load_result_json(path: Path) -> Run:
    utterances = json.loads(path.read_text())["utterances"]
    lines = [{
        "i": i, "start": u["start_time"], "end": u["end_time"], "text": u["text"],
        "speaker": u.get("speaker"), "status": "ok",
        "emotions": [e["label"] for e in u["emotions"]],
        "sentiments": [s["label"] for s in u["sentiments"]],
        "confidences": [e["confidence"] for e in u["emotions"]] + [s["confidence"] for s in u["sentiments"]],
    } for i, u in enumerate(utterances)]
    return Run(path.stem, None, {}, lines, None)


def load_side(path: Path) -> dict[str, Run]:
    if path.is_file():
        run = load_result_json(path)
        return {run.name: run}
    if (path / "run.json").exists():
        run = load_run_folder(path)
        return {run.name: run}
    return {d.name: load_run_folder(d) for d in sorted(path.iterdir()) if (d / "run.json").exists()}


def pair_lines(golden: Run, cand: Run, time_tol: float) -> tuple[list[tuple[dict, dict]], list[dict]]:
    """Pair by position when the transcripts agree, otherwise by time and text."""
    def same(a: dict, b: dict) -> bool:
        return (a["text"].strip() == b["text"].strip()
                and abs(a["start"] - b["start"]) <= time_tol and abs(a["end"] - b["end"]) <= time_tol)

    if len(golden.lines) == len(cand.lines) and all(map(same, golden.lines, cand.lines)):
        return list(zip(golden.lines, cand.lines)), []
    pool = list(cand.lines)
    pairs, unmatched = [], []
    for g in golden.lines:
        match = next((c for c in pool if same(g, c)), None)
        if match is None:
            unmatched.append(g)
        else:
            pool.remove(match)
            pairs.append((g, match))
    return pairs, unmatched


def top3(line: dict, arrays: dict) -> tuple[list[str], list[str]]:
    if "emotion_probs" in arrays:
        emo = [EMOTIONS[k] for k in np.argsort(-arrays["emotion_probs"], kind="stable")[:3]]
        sen = [SENTIMENTS[k] for k in np.argsort(-arrays["sentiment_probs"], kind="stable")[:3]]
        return emo, sen
    return line.get("emotions", []), line.get("sentiments", [])


def speaker_agreement(pairs: list[tuple[dict, dict]]) -> tuple[int, int]:
    """Labels may be named differently; map each candidate label to the golden
    label it overlaps most, then count lines that agree."""
    counts: dict[tuple, int] = {}
    for g, c in pairs:
        counts[(c.get("speaker"), g.get("speaker"))] = counts.get((c.get("speaker"), g.get("speaker")), 0) + 1
    mapping, used = {}, set()
    for (c_lbl, g_lbl), _ in sorted(counts.items(), key=lambda kv: -kv[1]):
        if c_lbl not in mapping and g_lbl not in used:
            mapping[c_lbl] = g_lbl
            used.add(g_lbl)
    agree = sum(1 for g, c in pairs if mapping.get(c.get("speaker")) == g.get("speaker"))
    return agree, len(pairs)


def when(line: dict) -> str:
    secs = int(line["start"])
    return f"line {line['i']} {secs // 60:02d}:{secs % 60:02d} \"{line['text'].strip()[:SNIPPET]}\""


def compare_arrays(g: dict, c: dict, ga: dict, ca: dict, tol: argparse.Namespace, rep: Report, stats: dict) -> None:
    if "input_ids" in ga and "input_ids" in ca:
        stats["tokens_checked"] += 1
        if not (np.array_equal(ga["input_ids"], ca["input_ids"]) and np.array_equal(ga["attention_mask"], ca["attention_mask"])):
            rep.changes.append(f"{when(g)}: token ids differ")
    if g.get("frames_sha256") and c.get("frames_sha256"):
        stats["frames_checked"] += 1
        if g["frames_sha256"] != c["frames_sha256"]:
            detail = ""
            if "frames_u8" in ga and "frames_u8" in ca:
                diff = np.abs(ga["frames_u8"].astype(int) - ca["frames_u8"].astype(int))
                detail = f" ({int((diff > 0).sum())} values differ, max {int(diff.max())}/255)"
            rep.changes.append(f"{when(g)}: frames differ{detail}")
    if "mel" in ga and "mel" in ca:
        stats["mel_max"] = max(stats["mel_max"], float(np.max(np.abs(ga["mel"] - ca["mel"]))))
    if "emotion_probs" in ga and "emotion_probs" in ca:
        d = max(float(np.max(np.abs(ga["emotion_probs"] - ca["emotion_probs"]))),
                float(np.max(np.abs(ga["sentiment_probs"] - ca["sentiment_probs"]))))
        stats["prob_max"] = max(stats["prob_max"], d)


def compare_line(g: dict, c: dict, golden: Run, cand: Run, tol, rep: Report, stats: dict) -> None:
    if c.get("status") != "ok":
        rep.changes.append(f"{when(g)}: no result in candidate ({c.get('error') or c.get('status')})")
        return
    ga, ca = golden.arrays(g["i"]), cand.arrays(c["i"])
    compare_arrays(g, c, ga, ca, tol, rep, stats)
    if "confidences" in g and "confidences" in c:
        d = max(abs(a - b) for a, b in zip(g["confidences"], c["confidences"]))
        stats["prob_max"] = max(stats["prob_max"], d)
    (g_emo, g_sen), (c_emo, c_sen) = top3(g, ga), top3(c, ca)
    if g_emo[:1] != c_emo[:1] or g_sen[:1] != c_sen[:1]:
        stats["flips"] += 1
        rep.changes.append(f"{when(g)}: LABEL {g_emo[:1]}/{g_sen[:1]} -> {c_emo[:1]}/{c_sen[:1]}")
    elif g_emo != c_emo or g_sen != c_sen:
        stats["order"] += 1
        rep.changes.append(f"{when(g)}: top-3 order {g_emo}/{g_sen} -> {c_emo}/{c_sen}")


def compare_video(golden: Run, cand: Run, tol: argparse.Namespace) -> Report:
    rep = Report()
    if golden.video_sha256 and cand.video_sha256:
        rep.check("video", "same file" if golden.video_sha256 == cand.video_sha256 else "DIFFERENT input file",
                  golden.video_sha256 == cand.video_sha256)
    pairs, unmatched = pair_lines(golden, cand, tol.time_tol)
    rep.check("transcript", f"{len(pairs)}/{len(golden.lines)} lines same text and times "
              f"(candidate has {len(cand.lines)})", not unmatched and len(cand.lines) == len(golden.lines))
    rep.changes += [f"{when(g)}: not in candidate" for g in unmatched[:MAX_LISTED]]
    if any(g.get("speaker") for g, _ in pairs):
        agree, total = speaker_agreement(pairs)
        rep.check("speakers", f"{agree}/{total} lines same speaker", total == 0 or agree / total >= tol.speaker_min)
    stats = {"tokens_checked": 0, "frames_checked": 0, "mel_max": 0.0, "prob_max": 0.0, "flips": 0, "order": 0}
    before = len(rep.changes)
    for g, c in pairs:
        if g.get("status") == "ok":
            compare_line(g, c, golden, cand, tol, rep, stats)
    line_problems = [x for x in rep.changes[before:] if "token ids" in x or "frames differ" in x or "no result" in x]
    if stats["tokens_checked"]:
        rep.check("tokens", f"{stats['tokens_checked']} lines checked", not any("token ids" in x for x in line_problems))
    if stats["frames_checked"]:
        rep.check("frames", f"{stats['frames_checked']} lines checked", not any("frames differ" in x for x in line_problems))
    rep.check("results", "every line has a result", not any("no result" in x for x in line_problems))
    if stats["mel_max"] or stats["tokens_checked"]:
        rep.check("mel", f"max diff {stats['mel_max']:.2e} (limit {tol.mel_tol:.0e})", stats["mel_max"] <= tol.mel_tol)
    rep.check("probabilities", f"max diff {stats['prob_max']:.2e} (limit {tol.prob_tol:.0e})", stats["prob_max"] <= tol.prob_tol)
    rep.check("labels", f"{stats['flips']} flipped, {stats['order']} top-3 order changes",
              stats["flips"] == 0 and stats["order"] == 0)
    return rep


def print_report(name: str, golden: Run, cand: Run, rep: Report) -> None:
    print(f"\n{name}  {'PASS' if rep.passed else 'FAIL'}")
    for check, detail, ok in rep.rows:
        print(f"  {check:<14}{detail:<58}{'ok' if ok else 'FAIL'}")
    shared = [k for k in golden.timings if k in cand.timings]
    if shared:
        print("  seconds       " + " | ".join(f"{k} {golden.timings[k]} -> {cand.timings[k]}" for k in shared))
    for change in rep.changes[:MAX_LISTED]:
        print(f"    {change}")
    if len(rep.changes) > MAX_LISTED:
        print(f"    ... and {len(rep.changes) - MAX_LISTED} more")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("golden", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--prob-tol", type=float, default=1e-4, help="max probability difference (default 1e-4)")
    parser.add_argument("--mel-tol", type=float, default=1e-5, help="max mel difference (default 1e-5)")
    parser.add_argument("--time-tol", type=float, default=0.0, help="max start/end difference in seconds (default 0)")
    parser.add_argument("--speaker-min", type=float, default=1.0, help="min share of lines with the same speaker (default 1.0)")
    tol = parser.parse_args()

    golden, cand = load_side(tol.golden), load_side(tol.candidate)
    single = len(golden) == 1 and len(cand) == 1
    if single:  # one run each: compare them whatever their names
        pairs = [(next(iter(golden)), *golden.values(), *cand.values())]
        missing = []
    else:
        pairs = [(name, golden[name], cand[name]) for name in golden if name in cand]
        missing = sorted(golden.keys() - cand.keys())
    if not pairs:
        print("Nothing to compare: no matching runs found.")
        return 1
    results = []
    for name, g, c in pairs:
        rep = compare_video(g, c, tol)
        print_report(name, g, c, rep)
        results.append(rep.passed)
    for name in missing:
        print(f"\n{name}  FAIL\n  missing from the candidate")
    passed = all(results) and not missing
    print(f"\n{'PASS' if passed else 'FAIL'}: {sum(results)}/{len(results) + len(missing)} videos match")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
