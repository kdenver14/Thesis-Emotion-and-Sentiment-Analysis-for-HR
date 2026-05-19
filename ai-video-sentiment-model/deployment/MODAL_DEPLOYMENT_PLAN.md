# Modal Deployment Plan — Video Sentiment Inference (v2, large-video architecture)

Status: **PLANNED, NOT IMPLEMENTED.** Review before any code is written.

> v1 of this plan ("wrap FastAPI, change 2 web lines") is **superseded**. It
> assumed short clips. The real requirement is HR videos in the **~few-min to
> 30+ min** range, 30 min being the common high end. That breaks the v1 design
> on three independent axes (upload size, job duration, segment-loop speed).
> This v2 is the design that actually meets the requirement. Short videos run
> the exact same path, just faster and cheaper — no duration branching.

---

## 0. Design target

- Video range: ~2 min to 30+ min. Sized for the long end; degrades to instant
  for short clips through one shared pipeline.
- HR domain = **not real-time**. Correct UX is: upload, get an immediate
  "processing" acknowledgement, results appear later (frontend already polls
  via `ProcessingPoller.tsx`). Therefore optimize for **reliability** (no
  timeout, no OOM, no size cap) over raw latency.
- Modal cost model unchanged: scale-to-zero, pay per-second of actual work.

---

## 0b. HARD CONSTRAINT — model accuracy is never traded for convenience

Non-negotiable (user, 2026-05-19). No speed/cost/simplicity change may alter
what the model sees or outputs.

- Whisper stays `base` (no `tiny`/`small` downgrade for speed).
- pyannote diarization stays, global, full audio.
- Fix 3 target = **byte-identical model inputs vs today**, just produced
  without the wasteful lossy re-encode. Not "close enough" — identical.
- **Parity gate:** Fix 3 ships only if an automated old-vs-new test shows
  identical per-utterance emotions/sentiments on a sample set. If parity
  cannot be proven, model inputs are NOT changed: keep the exact current
  decode path and optimize only around it (no input-affecting change).
- Model-forward batching is bit-identical (model in eval mode → BatchNorm
  uses running stats, not batch stats) so it is accuracy-safe by
  construction. Fixes 1 and 2 (upload, job model) never touch model inputs.

## 1. Why v1 breaks at 30 min (root causes)

| Axis | v1 failure | Root cause in code |
|---|---|---|
| Upload size | 30-min video ≈ 300 MB-2 GB; `MAX_UPLOAD_BYTES=100 MB` rejects it; raising the cap just moves the failure to OOM | `route.ts` does `Buffer.from(await file.arrayBuffer())` — whole file in RAM, then re-sent to Modal (double hop) |
| Job duration | Long inference held inside one fire-and-forget fetch; `timeout=900` (15 min) kills it | `void runInferenceBackground(...)` keeps a connection open for the whole job |
| Speed | 30-min video ≈ 15-35+ min inference | `inference.py extract_segment()` **re-encodes** every Whisper segment (libx264/aac) in a separate ffmpeg subprocess, serialized, CPU-bound; `AudioProcessor` re-extracts wav per segment too. GPU is idle ~80% of the time — a bigger GPU does not help this. |

---

## 2. v2 architecture (the three fixes = v1 scope of this project)

```
client ──(presigned PUT)──▶ Object storage (Cloudflare R2)
   │                                  ▲
   │ 1. POST /api/upload-init         │ 4. Modal downloads object by key
   ▼                                  │
Next route ── create session(PROCESSING, videoKey=objectKey)
   │
   │ 2. Modal .spawn(objectKey, sessionId)   (returns instantly)
   ▼
   returns {sessionId} to client ──▶ ProcessingPoller polls status
                                          ▲
Modal GPU container (T4):                  │
  download object ▶ inference ▶ 3. callback Next webhook ──┘
                                  → updateSessionResult / updateSessionFailed
```

### Fix 1 — Presigned direct-to-storage upload
- Object storage: **Cloudflare R2** (S3-compatible, zero egress fees, cheap;
  S3 also works — R2 chosen to avoid egress cost when Modal downloads).
- Flow: client calls a new Next action `createUpload` → returns a presigned
  PUT URL + object key. Client uploads the video **straight to R2**. Next
  never sees the bytes → no size cap, no RAM buffer, no double hop.
- `AnalysisSession.videoKey` (already `@unique`, currently a throwaway UUID,
  video currently discarded) is **repurposed as the R2 object key**. No
  schema migration needed for the key itself.
- Retention decision (OPEN, §6): delete the R2 object after inference
  (privacy-default for HR) vs keep for replay/audit.

### Fix 2 — Spawn + callback async job model
- After the client confirms upload, Next: validate metadata/auth, create the
  session `PROCESSING`, call Modal `.spawn(objectKey, sessionId, callbackUrl)`
  (returns immediately, no held connection), respond `{sessionId}`.
- Modal processes, then POSTs results to a new authenticated Next webhook
  (e.g. `/api/inference-callback`) which calls the existing
  `updateSessionResult` / `updateSessionFailed` (session.ts:561 / :605).
- Frontend unchanged: `ProcessingPoller.tsx` + `status`/`errorMessage`
  columns already drive the PROCESSING → COMPLETED/FAILED UX.
- `runInferenceBackground` fire-and-forget in `route.ts` is **removed**.

### Fix 3 — Rewrite the `inference.py` segment loop
The single biggest speed/reliability win. Code change in
`deployment/inference.py` (reused by both local `server.py` and Modal):
- **Stop re-encoding per segment.** Do not write a libx264 mp4 per Whisper
  segment. Seek + decode the needed frame window (OpenCV/pyav) and audio
  slice directly from the source file, in process.
- **Extract full audio once.** Slice per-utterance windows in memory
  (torchaudio) instead of an ffmpeg wav extraction per segment.
- **Batch the model forward pass** over K segments.
- Expected: 30-min video drops from ~15-35 min to ~**3-6 min** on one T4.
- `server.py` local path keeps working unchanged in contract (same
  `predict_fn` signature, same `{utterances}` output).

### Hard constraint — global diarization
pyannote diarization MUST run once on the **whole** audio. Speaker labels are
the per-employee analytics join key ([[project_meeting_sessions]]); chunking
the video across containers would scramble speaker → employee mapping. So:
no per-chunk diarization. (This is also why the fan-out optimization in §7 is
deferred, not v1.)

---

## 3. Modal app (`deployment/modal_app.py`, new)

- Image (ACCURACY-LOCKED — see §0b):
  - `debian_slim(py3.12)` → `apt_install("ffmpeg")`.
  - Install the EXACT validated env: copy `requirements.lock` into the image,
    `pip install --no-deps -r requirements.lock` (full pinned transitive
    closure; `--no-deps` = zero resolver drift, no pinned accuracy lib can
    move). NOT `requirements.txt` (that is only the 12 top-level pins).
  - `modal` is NOT in the lock: `pip install -c requirements.lock
    "modal==<pinned>"` — the lock acts as a constraints file so `modal`
    cannot upgrade any pinned package. A hard conflict is surfaced and
    resolved deliberately, never auto-resolved.
  - NO `boto3`. `requests==2.32.5` is already in the lock; Modal downloads
    the video via a presigned GET URL using that locked `requests`. Removes
    the entire botocore/s3transfer transitive-dep risk surface.
  - Build step pre-downloads Whisper `base` + `bert-base-uncased` + pyannote
    3.1 under these locked versions (consistent with runtime).
  - `add_local_python_source("inference", "models")`.
- Accuracy invariant: the model runs under byte-identical library versions
  to the current validated environment. Modal changes orchestration, never
  the numerical stack.
- Volume `sentiment-weights` at `/weights` (546 MB `model.pth`, uploaded once
  via CLI, not image-baked — see §6 precondition).
- Secrets: `huggingface` (HF_TOKEN), `inference-auth` (callback HMAC + R2
  creds, or a dedicated R2 secret).
- Job is a **`@app.function`** (not a web endpoint now — the trigger is
  `.spawn()` from Next, and the result goes back via callback):
  ```python
  @app.function(
      gpu="T4", image=image, volumes={"/weights": weights},
      secrets=[hf_secret, auth_secret],
      min_containers=0, scaledown_window=300,
      timeout=3600,            # raised: long video floor; with Fix 3, ample
      max_containers=3,        # cost ceiling
      retries=1,               # one auto-retry on infra failure
  )
  def run_inference(object_key: str, session_id: str, callback_url: str):
      # download object_key from R2 → predict_fn(.., model_dict)
      #   model loaded via a module-level @modal.enter-style cls OR
      #   load-once pattern; large videos amortize load anyway
      # → POST signed result to callback_url
  ```
- Model load: use a `@app.cls` + `@modal.enter()` so weights load once per
  warm container (same as v1), `run_inference` becomes a method, Next calls
  `Cls(...).run_inference.spawn(...)`. Concurrency `@modal.concurrent(
  max_inputs=1)` (model + Whisper + pyannote share one GPU, not thread-safe).
- App name: `sentiment-inference`.

---

## 4. Web app changes (`ai-video-sentiment-web/`)

Bigger than v1 (v1 was 2 lines; this is a real feature).

| File | Change |
|---|---|
| `prisma/schema.prisma` | No new field strictly required (`videoKey` reused as object key, `status`/`errorMessage` exist). Possible add: `videoBytes Int?` / `videoMime` if retention kept. Confirm in §6. |
| New: `src/actions/upload.ts` (or extend) | `createUpload(metadata)` → validate + auth + create `AnalysisSession(PROCESSING, videoKey=objectKey)` + return presigned R2 PUT URL. Replaces the upload half of `route.ts`. |
| New: `src/app/api/inference-callback/route.ts` | Auth via HMAC shared secret (constant-time). Maps Modal payload → `updateSessionResult` / `updateSessionFailed`. Idempotent (ignore if session already terminal). |
| `src/app/api/sentiment-inference/route.ts` | Gutted: no buffering, no fire-and-forget. Either removed or reduced to the `.spawn()` trigger after client confirms upload. |
| `src/env.js` | Add: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `MODAL_APP_URL`/token, `INFERENCE_CALLBACK_SECRET`. All validated; secrets required only when the Modal path is enabled (keep optional-with-default so main still boots — see backward-compat below). |
| `.env.example` | Add all of the above with empty values + comments. |

Backward-compat / safe-merge: new env vars optional with empty defaults;
`LOCAL_INFERENCE_URL` localhost default kept. A flag (e.g. presence of
`R2_BUCKET`) selects Modal-path vs legacy-local-path so main stays bootable
and the old local flow still works in dev without R2/Modal.

---

## 4b. Phase A hardening (advisor review)

1. **Size cap is server-side, not presigned.** A presigned PUT signs the URL,
   not the body length, so the client can send any size. `triggerInference`
   does an R2 `HEAD` on the object after the client reports upload done;
   if absent or `ContentLength > 3 GB`, delete the object, mark the session
   `FAILED`, do not `.spawn()`.
2. **Callback HMAC over raw bytes.** `inference-callback` route:
   `const raw = await req.text()` → constant-time compare
   `HMAC(raw, INFERENCE_CALLBACK_SECRET)` vs the signature header → only then
   `JSON.parse(raw)`. Never `req.json()` first (bytes lost, whitespace/key
   order breaks verification). Modal signs the exact serialized bytes it
   POSTs, same convention.
3. **Trigger is a separate cheap CPU function.** The `@modal.fastapi_endpoint`
   trigger is its own `@app.function()` (NO `gpu=`, not a method of the T4
   `@app.cls`), body `Inference().run_inference.spawn(...)`. Otherwise every
   trigger boots a T4 just to enqueue. Heavy GPU work stays in the class.
4. **No orphaned PROCESSING sessions.** `createUpload` sets initial status
   **`UPLOADING`**. `triggerInference` flips it to `PROCESSING` only after the
   gap-1 HEAD confirms the object. A client crash between create and trigger
   leaves it `UPLOADING` (frontend treats that as abandonable, not a
   spinner-forever). Scope: `UPLOADING` must be handled wherever status is
   branched — `ProcessingPoller.tsx`, `RecentSessionsList.tsx` `statusLabel`,
   `SessionTable.tsx`. Optional belt-and-suspenders: a Modal
   `schedule=Period(minutes=15)` sweep marking stale `UPLOADING` → `FAILED`
   (deferred unless needed).
5. **Parity baseline captured in Phase A.** While Modal runs the UNCHANGED
   `inference.py`, snapshot per-utterance emotions/sentiments for a small
   fixed video corpus and commit them as `deployment/parity_baseline/`. This
   is the fixed reference Phase B's accuracy gate (§0b) diffs against. Must
   exist before Phase B starts.

## 5. Security

- **R2 presigned URL**: short TTL (e.g. 10 min), scoped to one object key,
  PUT only. A leaked URL cannot list or overwrite other objects. NOTE: a
  presigned PUT cannot cryptographically bound body size; the 3 GB cap is
  enforced server-side by a post-upload HEAD (see §4b gap 1).
- **Modal trigger**: `.spawn()` is server-to-server from Next using Modal
  client auth (Modal token), not a public HTTP endpoint — smaller surface
  than v1's public `/infer`.
- **Callback webhook**: Modal → Next must be authenticated. HMAC signature
  over the body with `INFERENCE_CALLBACK_SECRET`, constant-time verify,
  reject + 401 otherwise. Prevents a forged "your session is COMPLETED with
  this fake data" call.
- **Object hygiene**: per retention decision, delete R2 object after
  terminal status (default) — HR video is sensitive PII.
- Validate the Modal payload with the existing `inferenceResultSchema`
  before it touches the DB (already done today in `route.ts`, keep it).

---

## 6. Setup steps the USER runs (own infra creds, like git / SMTP)

```
# Modal
pip install modal && modal token new
# accept pyannote/speaker-diarization-3.1 license on huggingface.co
modal secret create huggingface HF_TOKEN=<...>
# TWO distinct random tokens. modal_app.py reads BOTH from os.environ; the
# command MUST include MODAL_TRIGGER_TOKEN or every trigger call 401s
# (KeyError). Modal does NOT need R2 creds (presigned GET; no boto3).
modal secret create inference-auth \
       MODAL_TRIGGER_TOKEN=<random-A> \
       INFERENCE_CALLBACK_SECRET=<random-B>
# Web .env: MODAL_TRIGGER_TOKEN = random-A, INFERENCE_CALLBACK_SECRET =
# random-B (must match the secret values exactly).
modal volume create sentiment-weights
modal volume put sentiment-weights model_normalized/model.pth /model.pth
cd deployment && modal deploy modal_app.py   # run FROM deployment/ so
                                              # add_local_python_source can
                                              # resolve inference/models
# Cloudflare R2: create bucket, API token (S3 creds)
# Modal prints two URLs; the `trigger` one is MODAL_TRIGGER_URL for .env
```
Precondition: `model_normalized/model.pth` (546 MB, gitignored) must exist
locally before `modal volume put`.

**CRITICAL `APP_URL`:** `triggerInference` builds the callback as
`${APP_URL}/api/inference-callback`. If `APP_URL` is left at the
`http://localhost:3000` default while Modal runs in the cloud, Modal POSTs
the result to its own localhost and it never reaches the app → every session
stuck `PROCESSING`. Set web `.env` `APP_URL` to the PUBLIC URL where Next is
reachable from the internet before triggering any inference.

**Parity baseline is a PRE-Phase-B user step (do before touching
inference.py):** run a few representative videos through the current laptop
`python inference.py <video>` and save the JSON outputs to
`deployment/parity_baseline/`. This is the fixed accuracy reference the
Phase B gate (§0b) diffs against. Capture it against the unchanged code
while it still exists.

RESOLVED decisions (user, 2026-05-19):
1. Storage: **Cloudflare R2** (zero egress; S3-compatible).
2. Retention: **delete the R2 object after inference** (privacy default for
   HR PII; no replay; no extra schema field needed).
3. Max cap: **60 min / 3 GB** (presigned content-length bound; cost ceiling).
4. Order: **Phase A** (Fix 1+2 + Modal on unchanged `inference.py`) first,
   then **Phase B** (Fix 3 behind parity gate) separately.

---

## 7. Deferred (explicitly NOT v1)

- **Fan-out parallelism**: split a long video into time-chunks across
  multiple Modal containers for wall-clock speed. Deferred — Fixes 1-3 make
  30 min reliable on one container (~3-6 min), and global-diarization (§2)
  makes correct chunking non-trivial. Revisit only if wall-clock becomes a
  complaint.
- **Memory snapshots** (`enable_memory_snapshot`) to cut cold start. Long
  videos amortize the cold start anyway; low priority.
- These belong to the wider 4-step full-app deploy roadmap (Modal=1,
  container host not Vercel=2, SQLite→Postgres=3, build-lint gate=4 — see
  [[project-modal-deployment]] / [[project-build-lint-gate]]).

---

## 8. Cost (range)

- Per-second T4 (~$0.59/hr) of actual work, only while a container is up.
- ~3-min video ≈ pennies. ~30-min video (post Fix 3, ~5 min compute + 5 min
  keep-alive) ≈ **~$0.30-0.50**. Idle = **$0** (scale-to-zero).
- R2: storage ~negligible at HR volume; **zero egress** (key reason over S3).
- Within Modal's monthly free credit for thesis-scale usage.

---

## 9. Verification (when implemented)

- `createUpload` → presigned URL; client PUT a real 30-min file to R2 OK.
- `.spawn()` returns instantly; UI shows PROCESSING immediately (no hang).
- Modal downloads, processes a 30-min video without timeout; callback flips
  session COMPLETED with correct per-speaker utterances.
- Forged callback (bad/no HMAC) → 401, session untouched.
- Short (2-min) video → same path, COMPLETED in seconds.
- Speaker → employee mapping correct on a multi-speaker 30-min meeting
  (global diarization intact).
- `tsc --noEmit` + scoped eslint on touched web files green (full
  `next build` lint = repo-wide pre-existing debt, not a gate).
</content>
