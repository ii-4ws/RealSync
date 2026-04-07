# RealSync

Real-time deepfake detection for Zoom meetings.

**Team:** Ahmed Sarhan, Mohammed Atwani, Mohamed Ghazi, Yousef Kanjo, Aws Diab  
**Supervisor:** Dr. May El Barachi  
**Course:** CSIT321 — Graduation Project, University of Wollongong in Dubai

---

## What is RealSync

RealSync monitors live Zoom meetings for synthetic media — face swaps, voice cloning, and AI-generated video. It works by joining a meeting as a silent bot (powered by Puppeteer), capturing frames, audio, and live captions, then routing everything through a multi-modal AI pipeline that runs in real time.

The analysis happens across three independent detection layers. Video is processed by a CLIP ViT-L/14 ensemble that looks for face manipulation artifacts and frame-level inconsistencies. Audio is analyzed by a WavLM-based classifier trained to distinguish natural speech from synthesized or cloned voices. Transcripts are processed by a DeBERTa NLI model that flags language patterns inconsistent with the speaker's established profile.

Results from all three layers feed into a Sequential Probability Ratio Test (SPRT), which accumulates evidence over time before committing to a session-level decision. This reduces false positives that would trigger from a single anomalous frame or audio artifact. The meeting host sees a live trust score, per-layer confidence indicators, and an alert feed in the dashboard — all updating over WebSocket with sub-second latency.

---

## Architecture

```
┌─────────────────────┐     WebSocket      ┌──────────────────────┐     HTTP/REST      ┌──────────────────────┐
│  Frontend           │◄──────────────────►│  Backend             │◄──────────────────►│  AI Service          │
│  React + TypeScript │  subscribe/ingest  │  Node.js + Express   │  /api/analyze/*    │  Python + FastAPI    │
│  :3000              │                    │  :4000               │                    │  :5100               │
│  real-sync.app      │                    │  Railway             │                    │  RunPod GPU          │
└─────────────────────┘                    └──────────┬───────────┘                    └──────────────────────┘
                                                      │
                                           ┌──────────▼───────────┐
                                           │  Supabase            │
                                           │  PostgreSQL + Auth    │
                                           └──────────────────────┘
```

**Data flow:** The Zoom bot captures video frames and audio from the meeting. The backend streams them to the AI service for analysis, fuses the returned scores into a unified trust signal, and broadcasts it to the frontend dashboard in real time.

---

## How to run

### Prerequisites

- Node.js 18+
- Python 3.10+
- A CUDA-capable GPU is recommended for the AI service. CPU inference works but is significantly slower.

### Frontend

```bash
cd Front-End
npm install
cp .env.example .env   # then fill in values below
npm run dev            # http://localhost:3000
```

`Front-End/.env` values:

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
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_SERVICE_KEY=<your-supabase-service-role-key>
BOT_HEADLESS=true
LOG_LEVEL=info
```

Set `BOT_HEADLESS=false` to open a visible browser window when the bot joins a meeting — helpful for debugging bot behavior.

### AI service

```bash
cd RealSync-AI-Prototype
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m serve.app         # http://localhost:5100
```

Models are downloaded automatically on first run:

| Model | Size | Source |
|-------|------|--------|
| CLIP ViT-L/14 | ~80 MB | HuggingFace |
| MediaPipe face detection | ~224 KB | Bundled |
| Emotion classifier weights | 31 MB | Included in repo |
| WavLM audio weights | 361 MB | Included in repo |

### Start everything at once

```bash
chmod +x start.sh
./start.sh
```

This starts all three services in sequence. Press `Ctrl+C` to stop them all.

---

## User guide

1. **Sign up or log in** at [real-sync.app](https://real-sync.app). Sign-up requires a corporate or institutional email — personal addresses (Gmail, Yahoo, etc.) are blocked by policy.

2. **Create a session.** Give it a title and paste the Zoom meeting URL. RealSync will use the URL to join the meeting as a bot.

3. **Click "Join".** The bot joins your Zoom meeting as a silent participant. It takes about 10–15 seconds to connect and begin streaming.

4. **Open the dashboard.** You'll see the real-time trust score, per-layer confidence bars (video / audio / text), an emotion analysis panel, and the live alert feed. Everything updates automatically — no manual refresh.

5. **Respond to alerts.** If an alert fires, it appears in the alert panel with a severity level (low / medium / high / critical) and a plain-language description of what triggered it. You can dismiss or escalate from there.

6. **End the session.** Click "Stop" when the meeting is over. RealSync waits for any in-flight analysis to complete, then generates a session report.

7. **Review the report.** Go to the Reports screen to see a summary of the session — overall verdict, timeline of alerts, per-layer evidence breakdown — and export it as a PDF.

---

## API reference

### Backend — `http://localhost:4000`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sessions` | Create a new session |
| `POST` | `/api/sessions/:id/join` | Bot joins the meeting |
| `POST` | `/api/sessions/:id/stop` | Stop the bot and finalize session |
| `GET` | `/api/sessions/:id/metrics` | Current analysis metrics |
| `GET` | `/api/sessions/:id/alerts` | Alert history for a session |
| `GET` | `/api/health` | Service health check |

### AI service — `http://localhost:5100`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analyze/frame` | Analyze a single video frame (base64 JPEG) |
| `POST` | `/api/analyze/audio` | Analyze an audio chunk (base64 WAV) |
| `POST` | `/api/analyze/text` | Analyze a transcript segment |
| `GET` | `/api/health` | Service health check |

Full request/response schemas are in [`contracts/`](contracts/).

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

The manual end-to-end test plan is at [`docs/MANUAL_E2E_TEST_PLAN.md`](docs/MANUAL_E2E_TEST_PLAN.md).

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts |
| Backend | Node.js, Express 5, WebSocket (ws), Puppeteer |
| AI service | Python 3.10, FastAPI, PyTorch, CLIP ViT-L/14, MediaPipe, WavLM, DeBERTa |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (JWT + MFA) |
| Deployment | Cloudflare Pages, Railway, RunPod |

---

## Project structure

```
RealSync/
├── Front-End/                      # React dashboard (TypeScript + Vite)
│   └── src/
│       ├── components/
│       │   ├── screens/            # Page components (Dashboard, Reports, Settings, etc.)
│       │   ├── layout/             # Sidebar, TopBar, NotificationBell
│       │   ├── dashboard/          # Dashboard sub-components
│       │   └── ui/                 # shadcn/ui primitives
│       ├── contexts/               # React contexts (WebSocket, Notifications, Theme)
│       └── lib/                    # API client, utilities
├── realsync-backend/               # Node.js API server + Zoom bot
│   ├── index.js                    # Express + WebSocket entry point
│   ├── bot/
│   │   ├── ZoomBotAdapter.js       # Puppeteer-based Zoom bot
│   │   └── botManager.js           # Bot lifecycle management
│   └── lib/                        # Auth, persistence, AI client, fraud detection
├── RealSync-AI-Prototype/          # Python AI inference service
│   ├── serve/
│   │   ├── app.py                  # FastAPI entry point
│   │   ├── inference.py            # Multi-modal analysis pipeline
│   │   ├── deepfake_model.py       # CLIP ViT-L/14 deepfake detector
│   │   ├── emotion_model.py        # Emotion classifier
│   │   ├── audio_model.py          # WavLM audio deepfake detector
│   │   ├── identity_tracker.py     # Face identity consistency
│   │   ├── temporal_analyzer.py    # SPRT session-level decision
│   │   └── text_analyzer.py        # DeBERTa NLI transcript analysis
│   └── tests/
├── contracts/                      # API schema definitions (JSON Schema)
├── docs/                           # Technical documentation
├── start.sh                        # Start all three services
└── tasks/                          # Sprint planning and task tracking
```

---

## Documentation

- [Deployment guide](docs/DEPLOYMENT.md)
- [AI models report](docs/AI_MODELS_REPORT.md)
- [Technical specification](docs/FINAL_RELEASE_TECH_SPEC.md)
- [Manual E2E test plan](docs/MANUAL_E2E_TEST_PLAN.md)
- [API contracts](contracts/)

---

## License

All rights reserved. This project was developed as an academic capstone and is not licensed for redistribution or commercial use.
