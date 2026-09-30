# Running the Project

This guide explains how to set up and run everything in this repo yourself.
It is written from the current code, so trust it over older notes if they disagree.

## Read this first

The repo has two parts:

| Folder | What it is |
|---|---|
| `ai-video-sentiment-web/` | Next.js 15 app: login, dashboard, employees, video upload, exports. Uses Prisma with SQLite. |
| `ai-video-sentiment-model/` | Python model code. `deployment/` holds the inference code, the Modal app, and an optional local FastAPI server. `training/` holds the training script. |

Some facts shape everything below:

- **Video analysis in the web UI only works through Modal and Cloudflare R2.** The upload action refuses with "Inference service is not configured" unless the R2 variables and `MODAL_TRIGGER_URL` are set.
- **The web app must be reachable from the internet while a video is processing.** Modal sends the result back to `APP_URL/api/inference-callback`. It cannot reach `localhost`, so you need a cloudflared tunnel even when you are the only user.
- **The local FastAPI server is not an offline mode for the UI.** The web app never calls it. You test it by itself with `curl`.
- **Email is required to log in.** Every password login emails a 6-digit code, unless the device was remembered. Without working SMTP settings, nobody can log in.
- **There is no signup page.** Users come from the admin scripts or from the Admin > Users page.

## How a video gets analyzed

1. The browser asks the app for an upload URL. The app creates a session with status PROCESSING and returns a presigned R2 URL.
2. The browser uploads the video straight to R2. The app never holds the video bytes.
3. The app checks the object in R2, then calls the Modal `trigger` endpoint with a bearer token.
4. Modal runs the model on a T4 GPU: Whisper transcription, pyannote speaker diarization, and the multimodal emotion and sentiment model.
5. Modal POSTs an HMAC-signed result to the callback route. The app saves the utterances and summary, marks the session COMPLETED or FAILED, and deletes the video from R2.
6. The dashboard page polls the session status and shows results when they arrive.

---

## 1. Prerequisites

**Tools on your Mac**

| Tool | Why | Install |
|---|---|---|
| Node.js 20 or newer | Web app | `brew install node` |
| Python 3.12 | Model code, Modal CLI | `brew install python@3.12` |
| ffmpeg | Local inference and training | `brew install ffmpeg` |
| cloudflared | Public URL for the local web app | `brew install cloudflared` |
| Modal CLI | Deploy the GPU inference app | See section 4 |

**Accounts**

| Account | Why |
|---|---|
| Modal (modal.com) | Runs inference on a GPU |
| Cloudflare with R2 enabled | Stores uploaded videos until Modal reads them |
| Hugging Face | Token for the pyannote diarization model |
| Gmail with 2-Step Verification | Sends login codes, verification links and password reset links |

On Hugging Face, open `pyannote/speaker-diarization-3.1` and `pyannote/segmentation-3.0` and accept both user agreements.
If you skip this, diarization quietly turns off and every utterance has no speaker label.

---

## 2. One-time web app setup

Run these from `ai-video-sentiment-web/`.

```bash
cd ai-video-sentiment-web
npm install              # also runs "prisma generate"
cp .env.example .env
openssl rand -base64 32  # put the output in AUTH_SECRET
```

Fill in `.env`. Sections 3 and 4 give you the R2 and Modal values.

| Variable | Value |
|---|---|
| `AUTH_SECRET` | Output of `openssl rand -base64 32` |
| `DATABASE_URL` | Keep `file:./db.sqlite`. The file lands at `prisma/db.sqlite`. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | From section 3 |
| `MODAL_TRIGGER_URL` | The `trigger` URL that `modal deploy` prints |
| `MODAL_TRIGGER_TOKEN` | The same random value you put in the Modal `inference-auth` secret |
| `INFERENCE_CALLBACK_SECRET` | The same random value you put in the Modal `inference-auth` secret |
| `SMTP_USER` | The demo Gmail address |
| `SMTP_PASS` | A 16-character Gmail App Password, not the Gmail login password |
| `APP_URL` | Your current public tunnel URL. See section 5. |
| `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `LOCAL_INFERENCE_URL` | Leave as is. The app does not use them. |

To make a Gmail App Password, turn on 2-Step Verification, then go to Google Account > Security > App passwords.

**Create the database**

```bash
npm run db:push
```

Use `db:push`, not `db:migrate`. The repo has no migrations folder, so `db:migrate` has nothing to apply.
Run `db:push` again whenever `prisma/schema.prisma` changes.

**Create the first admin**

```bash
npx tsx scripts/create-admin.ts blastasia.hr.app+admin@gmail.com "Admin Name" "<password>" MANAGER
```

Use a `blastasia.hr.app+<name>@gmail.com` address.
The plus part routes the login code into the one demo inbox, so you can read it.
The script marks the email as verified, so this account can log in right away.

Do not rely on `npx prisma db seed` for your first login.
The seed creates admins with `@sentr.hr` addresses, and those inboxes cannot receive login codes.

---

## 3. One-time Cloudflare R2 setup

1. In the Cloudflare dashboard, open R2 and create a bucket. Put its name in `R2_BUCKET`.
2. Copy your Cloudflare account ID into `R2_ACCOUNT_ID`.
3. Create an R2 API token with Object Read and Write on that bucket. Put the access key ID and secret into `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
4. Add a CORS policy on the bucket. Without it, the browser upload fails.

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"]
  }
]
```

---

## 4. One-time Modal setup

**Install the Modal CLI in its own virtual environment.**
Do not install it into `deployment/venv`. That venv holds the accuracy-locked packages.

```bash
python3.12 -m venv ~/modal-env
~/modal-env/bin/pip install modal
~/modal-env/bin/modal token new     # opens a browser to log in
```

**Create two random tokens.** Run this twice and keep both values.

```bash
openssl rand -hex 32
```

Call the first one token A and the second one token B.

**Create the secrets.**
Type the `inference-auth` command with the backslashes exactly as shown.
A pasted one-line version has dropped the second key before, and then every trigger call fails.

```bash
~/modal-env/bin/modal secret create huggingface HF_TOKEN=<your-hf-token>

~/modal-env/bin/modal secret create inference-auth \
  MODAL_TRIGGER_TOKEN=<token-A> \
  INFERENCE_CALLBACK_SECRET=<token-B>
```

In the web `.env`, set `MODAL_TRIGGER_TOKEN` to token A and `INFERENCE_CALLBACK_SECRET` to token B.
They must match the Modal secret exactly.

**Upload the model weights.**
The trained weights file is `model_normalized/model.pth` at the repo root. It is about 546 MB.

```bash
cd ai-video-sentiment-model/deployment
~/modal-env/bin/modal volume create sentiment-weights
~/modal-env/bin/modal volume put sentiment-weights ../../model_normalized/model.pth /model.pth
```

**Deploy.** Run this from `deployment/`, because the app reads `requirements.lock`, `inference.py` and `models.py` by relative path.

```bash
cd ai-video-sentiment-model/deployment
~/modal-env/bin/modal deploy modal_app.py
```

The first build takes several minutes. It installs the locked packages and downloads Whisper, BERT and pyannote into the image.
When it finishes, it prints the URL of the `trigger` endpoint. Put that URL in `MODAL_TRIGGER_URL`.

**Redeploy** after any change to `inference.py`, `models.py`, `modal_app.py` or `requirements.lock`.
To replace the model weights, run `modal volume put` again with `--force`.

---

## 5. Daily run

Do these steps each time you start working.

1. **Terminal A: start the tunnel.** The URL is new every launch.

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

   Copy the `https://<random>.trycloudflare.com` URL that it prints.

2. **Update `APP_URL`.** In `ai-video-sentiment-web/.env`, set `APP_URL` to that tunnel URL.

3. **Terminal B: start the web app.**

   ```bash
   cd ai-video-sentiment-web
   npm run dev
   ```

   If the dev server was already running, restart it after you change `APP_URL`.
   The callback URL and the links in emails come from `APP_URL`.

4. **Open the tunnel URL in your browser**, not `localhost:3000`, and log in.
   Check the demo Gmail inbox for the 6-digit code. Tick "Remember me" to skip the code on this device for 30 days.

5. **Upload a video** on the home page. The session shows as processing on the dashboard until Modal calls back.
   DIRECTOR users are sent from the home page to the dashboard, so use a STAFF or MANAGER account to upload.

The first video after Modal has been idle takes about 4 to 5 minutes longer, because a GPU container has to start and load the models.
A warm container stays up for 30 minutes after its last job.

Modal does not need anything from you day to day. The deployed app stays in place until you redeploy or stop it.

---

## 6. Managing users

Run these from `ai-video-sentiment-web/`. The roles are STAFF, MANAGER and DIRECTOR.

```bash
# Create a user (role defaults to MANAGER)
npx tsx scripts/create-admin.ts blastasia.hr.app+jane@gmail.com "Jane Doe" "<password>" STAFF

# Change the role of an existing user
npx tsx scripts/promote.ts blastasia.hr.app+jane@gmail.com DIRECTOR

# Delete a user
npx tsx scripts/delete-admin.ts blastasia.hr.app+jane@gmail.com --yes
```

In the app, MANAGER and DIRECTOR users can also create users on the Admin > Users page.
That form only accepts `blastasia.hr.app+<name>@gmail.com` addresses. The new user gets a verification email and must verify before logging in.

To browse or edit the database directly:

```bash
npm run db:studio
```

---

## 7. Local inference server (optional)

This runs the same model code on your Mac with FastAPI. It is useful to test the model without Modal. The web app does not use it.

**One-time setup**, from `ai-video-sentiment-model/deployment/`:

```bash
cd ai-video-sentiment-model/deployment
python3.12 -m venv venv                  # skip if venv/ already exists
./venv/bin/pip install -r requirements.lock
```

Create `deployment/.env` with one line, only if the file does not exist yet:

```
HF_TOKEN=<your-hf-token>
```

Install from `requirements.lock`, not `requirements.txt`.
The lock file pins the exact package versions the model was validated with. Other versions can change the model output.

**Start the server**, from `deployment/`:

```bash
source venv/bin/activate
set -a; source .env; set +a
uvicorn server:app --host 0.0.0.0 --port 8000
```

Start it from `deployment/`, because it finds the weights at `../../model_normalized` by default. Set `MODEL_DIR` to use another folder.
If `HF_TOKEN` is missing, the server still runs but prints "speaker diarization disabled".

**Send a video:**

```bash
curl -F "file=@/path/to/video.mp4" http://localhost:8000/infer
```

Accepted types are `.mp4`, `.mov` and `.avi`, up to 100 MB. The response is JSON with one entry per utterance.
On a Mac without a GPU, a long video can take a long time.

---

## 8. Training the model (optional)

The training code lives in `ai-video-sentiment-model/training/` and uses the MELD dataset.
Use a separate virtual environment, because its package pins differ from the inference lock.

```bash
cd ai-video-sentiment-model/training
python3.12 -m venv venv
./venv/bin/pip install -r requirements.txt
```

Download MELD from https://affective-meld.github.io and arrange it like this:

```
<data-root>/
  train/
    train_sent_emo.csv
    train_splits/                  # .mp4 clips
  dev/
    dev_sent_emo.csv
    dev_splits_complete/
  test/
    test_sent_emo.csv
    output_repeated_splits_test/
```

The script defaults to AWS SageMaker paths, so pass every folder yourself:

```bash
./venv/bin/python train.py \
  --train-dir <data-root>/train \
  --val-dir <data-root>/dev \
  --test-dir <data-root>/test \
  --model-dir <output-folder> \
  --epochs 20 --batch-size 16
```

Before training starts, the script runs `install_ffmpeg.py`. That helper upgrades pip and setuptools in the active environment.
It also tries to download a Linux ffmpeg binary into `/usr/local/bin`. On a Mac that step fails or has no effect, and the script continues if Homebrew ffmpeg is on your PATH.
It was written for a Linux SageMaker container, so expect some error output on a Mac.

Training needs a CUDA GPU to finish in a reasonable time.
It saves `model.pth` to the model folder each time the validation loss improves, so the file always holds the best epoch. To use the new weights, copy the file to `model_normalized/model.pth` for local inference.
Then upload it to the Modal volume with `modal volume put ... --force`, as in section 4.

---

## 9. Checking your changes

Run these from `ai-video-sentiment-web/`.

```bash
npm run typecheck                              # TypeScript, whole project
npx eslint <changed files> --max-warnings=0    # lint only what you touched
npx next build --no-lint                       # production build without lint
```

`npm run build` currently compiles, then fails at the lint step.
The errors come from older files, not from your change. Check whether the failing files are ones you edited before you treat it as a problem.

---

## 10. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Upload says "Inference service is not configured" | One of the R2 variables or `MODAL_TRIGGER_URL` is empty in `.env`. Fill it in and restart `npm run dev`. |
| Upload fails in the browser before processing starts | The R2 bucket has no CORS policy. Add the policy from section 3. |
| Session stays PROCESSING forever | Modal cannot reach the callback. The tunnel is down, `APP_URL` is stale, or `npm run dev` was not restarted after the change. Also check that `INFERENCE_CALLBACK_SECRET` matches the Modal secret. Look at the logs in the Modal dashboard. |
| Trigger returns 401 | `MODAL_TRIGGER_TOKEN` in `.env` does not match the Modal `inference-auth` secret. |
| Trigger fails with a KeyError on `MODAL_TRIGGER_TOKEN` | The Modal secret is missing a key. Recreate `inference-auth` with both keys, as in section 4. |
| No login code arrives | `SMTP_USER` or `SMTP_PASS` is wrong or empty. `SMTP_PASS` must be an App Password. Check the demo inbox spam folder. |
| Login says the email is not verified | Open the verification link from the email, or use the resend page. Accounts from `create-admin.ts` are verified already. |
| Links in emails point to an old tunnel | `APP_URL` was not updated, or the dev server was not restarted. |
| Logs say "speaker diarization disabled" | `HF_TOKEN` is missing, or the Hugging Face account has not accepted the pyannote agreements. |
| `pip` fails inside `deployment/venv` | The venv is broken. Delete the `venv` folder, create it again, and reinstall from `requirements.lock`. |
| Local server says "Model file not found" | You did not start it from `deployment/`, or `model_normalized/model.pth` is missing. Set `MODEL_DIR` if the weights are elsewhere. |
| Prisma errors about missing tables or columns | Run `npm run db:push`. |
