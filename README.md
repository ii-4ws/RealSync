# RealSync

Real-time deepfake detection for video meetings.

**Team:** Mohammed Atwani, Ahmed Sarhan,Mohamed Ghazi, Yousef Kanjo, Aws Diab  
**Supervisor:** Dr. May El Barachi  
**Course:** CSIT321 — Graduation Project, University of Wollongong in Dubai

---

## What is RealSync

RealSync monitors live video meetings for synthetic media — face swaps, voice cloning, and social engineering. A meeting bot created via Recall.ai's API joins the call as a native participant, captures per-participant video frames and audio in real time, and streams them through a multi-modal AI pipeline. The system supports Zoom, Google Meet, and Microsoft Teams.

Detection runs across three layers. Video is processed by a CLIP ViT-L/14 ensemble (semantic detection + frequency-domain analysis + boundary texture analysis) that catches both raw and post-processed face swaps. Audio is analyzed by a WavLM-based classifier trained to distinguish natural speech from synthesized or cloned voices. Transcripts are processed by a DeBERTa NLI model that flags social engineering patterns like credential requests, urgency pressure, and authority impersonation.

Results from all three layers feed into a Sequential Probability Ratio Test (SPRT), which accumulates evidence over time before committing to a session-level decision at 95% confidence. Real faces converge to REAL in 5-8 frames. Raw face swaps converge to FAKE in 2-3 frames. The meeting host sees a live trust score, per-layer confidence indicators, and an alert feed on the dashboard — all updating over WebSocket with sub-second latency.

---

## Architecture

```
┌─────────────────────┐     WebSocket      ┌──────────────────────┐     HTTP/REST      ┌──────────────────────┐
│  Frontend           │◄──────────────────►│  Backend             │◄──────────────────►│  AI Service          │
│  React + TypeScript │  subscribe/ingest  │  Node.js + Express   │  /api/analyze/*    │  Python + FastAPI    │
│  :3000              │                    │  :4000               │                    │  :5100               │
│  Cloudflare Pages   │                    │  Oracle Cloud VPS    │                    │  RunPod GPU          │
│  real-sync.app      │                    │  api.real-sync.app   │                    │  RTX 4000 Ada        │
└─────────────────────┘                    └──────────┬───────────┘                    └──────────────────────┘
                                                      │
                                            ┌─────────▼──────────┐
                                            │  Recall.ai API     │
                                            │  Meeting bot       │
                                            │  (Zoom/Meet/Teams) │
                                            └────────────────────┘
                                                      │
                                            ┌─────────▼──────────┐
                                            │  Supabase          │
                                            │  PostgreSQL + Auth │
                                            └────────────────────┘
```

**Data flow:** The Recall.ai bot joins the meeting as a native SDK participant. It streams per-participant video frames (PNG, 640x360, ~2 fps) and audio (PCM16 mono 16kHz) over WebSocket to the backend. The backend forwards data to the AI service for analysis, fuses the returned scores into a unified trust signal, and broadcasts it to the frontend dashboard in real time.

---

## How to run

### Prerequisites

- Node.js 18+
- Python 3.10+
- A CUDA-capable GPU is recommended for the AI service. CPU inference works but is significantly slower.

### Frontend

```bash
cd Front-End-v2
npm install
cp .env.example .env   # then fill in values below
npm run dev            # http://localhost:3000
```

`Front-End-v2/.env` values:

```
VITE_API_BASE_URL=http://localhost:4000
VITE_WS_BASE_URL=ws://localhost:4000
VITE_SUPABASE_URL=<your-supabase-project-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
VITE_PROTOTYPE_MODE=0
```

Set `VITE_PROTOTYPE_MODE=1` to bypass authentication and explore the UI with mock data — useful for demos without a live backend.

### Backend

```bash
cd realsync-backend
npm install
cp .env.example .env   # then fill in values below
node index.js          # http://localhost:4000
```

`realsync-backend/.env` values:

```
PORT=4000
AI_SERVICE_URL=http://localhost:5100
AI_API_KEY=<your-ai-service-api-key>
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_SERVICE_KEY=<your-supabase-service-role-key>
ALLOWED_ORIGIN=http://localhost:3000
BOT_ADAPTER=recall
RECALL_API_KEY=<your-recall-api-key>
RECALL_REGION=ap-northeast-1
RECALL_WS_BASE_URL=wss://your-domain.com
LOG_LEVEL=info
```

Set `BOT_ADAPTER=puppeteer` to fall back to the legacy Puppeteer bot (preserved on the `puppeteer-backup` branch).

### AI service

```bash
cd RealSync-AI-Prototype
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
AI_API_KEY=<your-key> python -m serve.app   # http://localhost:5100
```

Models loaded at startup:

| Model | Size | Purpose |
|-------|------|---------|
| CLIP ViT-L/14 (GenD) | ~1.8 GB | Face-swap deepfake detection |
| MediaPipe face detection | ~224 KB | Face localization and cropping |
| Emotion classifier (EfficientNet-B2) | 31 MB | Six-class emotion recognition |
| WavLM audio classifier | 361 MB | Voice authenticity scoring |
| Whisper (base) | ~140 MB | Audio transcription |
| DeBERTa-v3-base | ~440 MB | Social engineering / phishing detection |
| Frequency analyzer | — | DCT high-frequency analysis (no model weights) |
| Boundary analyzer | — | Face boundary texture analysis (no model weights) |

### Start everything at once

```bash
chmod +x start.sh
./start.sh
```

This starts all three services in sequence. Press `Ctrl+C` to stop them all.

---

## User guide

1. **Sign up or log in** at [real-sync.app](https://real-sync.app). Sign-up requires a corporate or institutional email — personal addresses (Gmail, Yahoo, etc.) are blocked by policy.

2. **Create a session.** Give it a title and paste the meeting URL (Zoom, Google Meet, or Microsoft Teams). Select the meeting type.

3. **Click "Join".** The Recall.ai bot joins the meeting as a native participant named "RealSync Bot" with a branded camera tile. It takes about 15-30 seconds to connect and begin streaming.

4. **Open the dashboard.** You'll see the real-time trust score, per-layer confidence bars (Visual / Audio / Emotion), a deepfake risk indicator, and the live alert feed. Everything updates automatically over WebSocket.

5. **Respond to alerts.** If an alert fires, it appears in the alert panel with a severity level (low / medium / high / critical) and a description of what triggered it. Desktop notifications and sound alerts are available via the Settings page.

6. **End the session.** Click "Stop" when the meeting is over. The bot leaves the call and the system finalizes the session data.

7. **Review the report.** Go to the Reports screen to see a summary — overall verdict, timeline of alerts, per-layer evidence breakdown — and export as PDF, CSV, or JSON.

---

## API reference

### Backend — `http://localhost:4000`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sessions` | Create a new session |
| `POST` | `/api/sessions/:id/join` | Bot joins the meeting via Recall.ai |
| `POST` | `/api/sessions/:id/stop` | Stop the bot and finalize session |
| `GET` | `/api/sessions/:id/metrics` | Current analysis metrics |
| `GET` | `/api/sessions/:id/alerts` | Alert history for a session |
| `GET` | `/api/health` | Service health check |

WebSocket endpoints:
- `/ws` — Dashboard subscribe (frontend → backend)
- `/ws/ingest` — Bot data stream (bot → backend)
- `/ws/recall` — Recall.ai event stream (Recall.ai → backend)

### AI service — `http://localhost:5100`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analyze/frame` | Analyze a single video frame (base64 PNG/JPEG) |
| `POST` | `/api/analyze/audio` | Analyze an audio chunk (base64 PCM16) |
| `POST` | `/api/analyze/text` | Analyze a transcript segment |
| `POST` | `/api/transcribe` | Transcribe audio via Whisper |
| `GET` | `/api/health` | Service health check |

---

## Testing

```bash
# AI service tests
cd RealSync-AI-Prototype
source .venv/bin/activate
pytest tests/ -v

# Backend tests
cd realsync-backend
npm test
```

34+ test cases across both suites covering inference pipeline, alert fusion, session management, and endpoint validation.

The manual end-to-end test plan is at [`docs/MANUAL_E2E_TEST_PLAN.md`](docs/MANUAL_E2E_TEST_PLAN.md).

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts |
| Backend | Node.js, Express 5, WebSocket (ws), PM2 |
| Meeting bot | Recall.ai API (primary), Puppeteer (legacy, on `puppeteer-backup` branch) |
| AI service | Python 3.10, FastAPI, PyTorch, CLIP ViT-L/14, MediaPipe, WavLM, DeBERTa, Whisper |
| Database | Supabase (PostgreSQL with Row-Level Security) |
| Auth | Supabase Auth (JWT + OAuth + MFA) |
| Deployment | Cloudflare Pages (frontend), Oracle Cloud VPS via Cloudflare Tunnel (backend), RunPod GPU (AI) |

---

## Project structure

```
RealSync/
├── Front-End-v2/                   # React dashboard (TypeScript + Vite)
│   └── src/
│       ├── screens/                # Page components (Dashboard, Reports, Settings, etc.)
│       ├── components/             # Layout, dashboard sub-components, UI primitives
│       ├── contexts/               # React contexts (WebSocket, Notifications, Session)
│       └── lib/                    # API client, utilities
├── realsync-backend/               # Node.js API server + bot management
│   ├── index.js                    # Express + WebSocket entry point
│   ├── bot/
│   │   ├── RecallBotAdapter.js     # Recall.ai meeting bot adapter (~280 lines)
│   │   ├── ZoomBotAdapter.js       # Legacy Puppeteer bot (2,072 lines, backup)
│   │   └── botManager.js           # Bot lifecycle + BOT_ADAPTER switch
│   ├── ws/
│   │   ├── subscribe.js            # Frontend WebSocket (dashboard updates)
│   │   ├── ingest.js               # Bot data ingestion
│   │   └── recallWs.js             # Recall.ai WebSocket receiver
│   ├── services/                   # Frame, audio, transcript handlers
│   └── lib/                        # Auth, persistence, AI client, alert fusion
├── RealSync-AI-Prototype/          # Python AI inference service
│   ├── serve/
│   │   ├── app.py                  # FastAPI entry point
│   │   ├── inference.py            # Multi-modal analysis pipeline
│   │   ├── clip_deepfake_model.py  # CLIP ViT-L/14 deepfake detector
│   │   ├── frequency_analyzer.py   # DCT frequency-domain analysis
│   │   ├── boundary_analyzer.py    # Face boundary texture analysis
│   │   ├── emotion_model.py        # EfficientNet-B2 emotion classifier
│   │   ├── audio_model.py          # WavLM audio deepfake detector
│   │   ├── whisper_model.py        # Whisper transcription
│   │   ├── text_analyzer.py        # DeBERTa NLI social engineering detection
│   │   ├── sprt_detector.py        # Sequential Probability Ratio Test
│   │   ├── temporal_analyzer.py    # EWMA smoothing + anomaly detection
│   │   └── config.py               # All thresholds and hyperparameters
│   └── tests/
├── docs/                           # Technical documentation
├── start.sh                        # Start all three services
└── HANDOFF-RECALL.md               # Recall.ai integration handoff
```

---

## Deployment

### Frontend — Cloudflare Pages
- Domain: real-sync.app
- Build: `npm run build` → `dist/`
- HTTPS and CDN via Cloudflare

### Backend — Oracle Cloud VPS
- Always Free ARM instance (4 OCPU, 24 GB RAM)
- Accessible at api.real-sync.app via Cloudflare Tunnel
- Managed by PM2 with automatic restart on crash

### AI Service — RunPod GPU
- RTX 4000 Ada (20 GB VRAM), $0.20/hr on-demand
- All 6 ML models loaded at startup
- Accessible via RunPod proxy URL or direct SSH

### Meeting Bot — Recall.ai
- API-managed bot, $0.50/hr per session
- Native SDK integration (not browser-based)
- Supports Zoom, Google Meet, Microsoft Teams

---

## Documentation

- [Deployment guide](docs/DEPLOYMENT.md)
- [AI models report](docs/AI_MODELS_REPORT.md)
- [Technical specification](docs/FINAL_RELEASE_TECH_SPEC.md)
- [Manual E2E test plan](docs/MANUAL_E2E_TEST_PLAN.md)
- [Recall.ai integration handoff](HANDOFF-RECALL.md)

---

## License

All rights reserved. This project was developed as an academic capstone and is not licensed for redistribution or commercial use.
