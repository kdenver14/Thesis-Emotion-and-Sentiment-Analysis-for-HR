# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projects

Two sub-projects:
- `ai-video-sentiment-web/` — Next.js full-stack web app (T3 Stack pattern)
- `ai-video-sentiment-model/` — PyTorch multimodal ML model + FastAPI inference server

---

## Web App (`ai-video-sentiment-web/`)

### Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run check        # Lint + typecheck (run before committing)
npm run lint:fix     # Auto-fix ESLint issues
npm run format:write # Format with Prettier
npm run db:generate  # Generate Prisma client after schema changes
npm run db:push      # Push schema to dev DB (no migration file)
npm run db:migrate   # Deploy migrations (production)
npm run db:studio    # Open Prisma Studio
```

### Architecture

```
src/
├── app/                    # Next.js App Router — pages and API routes only
│   └── api/sentiment-inference/  # Bridge to FastAPI inference server
├── server/
│   ├── auth/               # Auth.js config (Credentials provider, JWT)
│   └── db.ts               # Prisma singleton
├── actions/                # Next.js Server Actions (business logic boundary)
├── components/client/      # Client components
├── schemas/                # Zod validation schemas (single source of truth)
└── env.js                  # Zod-validated env vars — import from here, not process.env
```

**Key constraints:**
- All env vars must go through `src/env.js` (Zod-validated)
- DB access only via Prisma in `server/` layer — never in components or actions directly
- Auth via `auth()` from `server/auth/` — protected routes handled in `middleware.ts`
- `LOCAL_INFERENCE_URL` env var points to the FastAPI server (default: `http://localhost:8000`)

### Database

SQLite via Prisma. Key models: `User`, `VideoFile` (tracks uploads + analysis status), `Session`/`Account` (Auth.js).

---

## ML Model (`ai-video-sentiment-model/`)

### Training

```bash
cd training/
pip install -r requirements.txt
python train_sagemaker.py    # Launches AWS SageMaker training job
```

### Inference Server

```bash
cd deployment/
pip install -r requirements.txt
python server.py             # FastAPI on port 8000
```

Endpoint: `POST /infer` — accepts video file upload, returns sentiment + emotion predictions.

### Model Architecture

Three encoders fused into a single classifier:

| Modality | Encoder | Output dim |
|----------|---------|------------|
| Text | BERT-base-uncased (frozen) → linear | 128 |
| Video | R3D-18 (frozen) → fc | 128 |
| Audio | Conv1D stack → projection | 128 |

Fusion: concatenate [128×3] → Dense → 256 → two heads:
- Sentiment: 3 classes (negative, neutral, positive)
- Emotion: 7 classes (MELD labels)

Training dataset: MELD (Multimodal EmotionLines Dataset). Checkpoints stored in S3.

### Key files

| File | Purpose |
|------|---------|
| `training/models.py` | Full model definition |
| `training/meld_dataset.py` | Dataset + preprocessing |
| `deployment/inference.py` | Video → prediction pipeline |
| `deployment/server.py` | FastAPI server |

---

## Data Flow

```
User uploads video
  → Next.js API route (app/api/sentiment-inference/)
  → FastAPI /infer (LOCAL_INFERENCE_URL)
  → FFmpeg frame/audio extraction + Whisper transcription
  → Multimodal model inference
  → Sentiment + emotion returned to frontend
  → VideoFile record saved to SQLite
```
