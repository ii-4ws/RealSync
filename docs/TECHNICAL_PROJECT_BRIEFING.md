# RealSync — Complete Technical Project Briefing

> This document is designed to give another AI assistant (or developer) full understanding of the RealSync system. It covers architecture, data flow, every component, API contracts, known issues, and how to run it locally.

---

## 1. Project Overview

### What It Does
RealSync is a **real-time multi-modal deepfake detection system for virtual meetings** (currently Zoom). It runs a headless browser bot that joins a Zoom meeting, captures live video frames, audio, and closed captions, then streams that data through an AI analysis pipeline. The results — trust scores, deepfake risk, emotion classification, identity verification, and fraud detection — are displayed on a live dashboard for the meeting host.

### Core Purpose
Protect users from deepfake video/audio attacks, voice cloning, identity spoofing, and social engineering during live video calls.

### The Problem It Solves
As deepfake technology becomes more accessible, attackers can impersonate real people in video calls to commit fraud (CEO impersonation, financial scams, credential theft). RealSync provides real-time detection and alerting so hosts can identify threats during the meeting — not after.

### Academic Context
CSIT321 Capstone Project — University of Wollongong, 2025-2026.

---

## 2. System Architecture

### High-Level Diagram

```
┌──────────────────┐     WebSocket (subscribe)     ┌──────────────────────┐     HTTP POST      ┌─────────────────────┐
│                  │◄──────────────────────────────│                      │───────────────────►│                     │
│   Frontend       │     /ws?sessionId=...         │   Backend            │  /api/analyze/*    │   AI Service        │
│   React + Vite   │                               │   Node.js + Express  │                    │   Python + FastAPI  │
│   Port 5173      │     REST /api/*               │   Port 4000          │◄───────────────────│   Port 5100         │
│                  │───────────────────────────────►│                      │   JSON response    │                     │
└──────────────────┘                               └──────────┬───────────┘                    └──────────┬──────────┘
                                                              │                                           │
                                                   WebSocket (ingest)                            ┌────────▼─────────┐
                                                   /ws/ingest?sessionId=...                      │  ML Models       │
                                                              │                                  │  EfficientNet-B4 │
                                                   ┌──────────▼───────────┐                      │  AASIST (audio)  │
                                                   │  Zoom Bot            │                      │  MobileNetV2     │
                                                   │  Puppeteer/Chromium  │                      │  FaceNet         │
                                                   │  (headless browser)  │                      │  DeBERTa-v3      │
                                                   └──────────┬───────────┘                      └──────────────────┘
                                                              │
                                                   ┌──────────▼───────────┐
                                                   │  Zoom Meeting        │
                                                   │  (web client)        │
                                                   └──────────────────────┘

                                                   ┌──────────────────────┐
                                                   │  Supabase            │
                                                   │  PostgreSQL + Auth   │
                                                   │  (optional in dev)   │
                                                   └──────────────────────┘
```

### Component Interaction Summary

| From | To | Protocol | Purpose |
|------|----|----------|---------|
| Frontend | Backend | HTTP REST | Create sessions, fetch alerts/transcript/reports, manage settings |
| Frontend | Backend | WebSocket `/ws` | Subscribe to live metrics, alerts, transcript, bot status |
| Bot | Backend | WebSocket `/ws/ingest` | Stream captured frames, audio chunks, captions, participant names |
| Backend | AI Service | HTTP POST | Send frames/audio/text for ML analysis |
| Backend | Supabase | HTTP (Supabase JS SDK) | Persist sessions, alerts, transcripts, reports, user profiles |
| Frontend | Supabase | HTTP (Supabase JS SDK) | Authentication (login/signup/OAuth), profile management |
| Bot | Zoom | Puppeteer (headless Chromium) | Join meeting, capture media, scrape captions |

---

## 3. Complete Data Flow (End-to-End)

### Step-by-step: From User Click to Dashboard Update

1. **User creates session** — Frontend `POST /api/sessions` with `{title, meetingType, meetingUrl}`. Backend creates in-memory session object, persists to Supabase, returns `sessionId`.

2. **Bot join triggered** — Frontend `POST /api/sessions/:id/join` with `{meetingUrl, displayName}`. Backend calls `botManager.startBot()`.

3. **Bot joins Zoom** — Puppeteer launches headless Chromium, navigates to `app.zoom.us/wc/{meetingId}/join`, enters display name, clicks Join. Handles waiting room, popups, cookie banners.

4. **Bot captures data** — Once in meeting:
   - **Frames**: Screenshot every 2s (JPEG, quality 70) → sent as `{type:"frame", dataB64}` via ingest WebSocket
   - **Audio**: Hooks into browser AudioContext, downsamples 48kHz→16kHz, sends PCM16 chunks every ~500ms as `{type:"audio_pcm", dataB64}`
   - **Captions**: Polls Zoom's closed caption DOM every 1s, sends as `{type:"caption", text, speaker}`
   - **Participants**: Scrapes participant panel every 10s, sends as `{type:"participants", names}`

5. **Backend processes ingest messages** — `processIngestMessage()` in `index.js`:
   - **Frames**: Validates size (<2MB), forwards to AI service `POST /api/analyze/frame`, receives face analysis (deepfake score, emotion, identity embedding shift). Updates session metrics. Generates alerts via AlertFusionEngine if thresholds crossed.
   - **Audio**: Accumulates PCM16 chunks in buffer (max 128). Every 4s, sends buffer to AI service `POST /api/analyze/audio`. Updates `audioAuthenticityScore`.
   - **Captions**: Appends to transcript. Runs FraudDetector pattern matching. Every 15s, sends last 60s of transcript to AI service `POST /api/analyze/text` for behavioral NLI analysis (DeBERTa). Generates fraud/behavioral alerts.

6. **Trust score computed** — Backend fuses signals:
   - With audio: `0.35*video + 0.25*audio + 0.25*identity + 0.15*behavior`
   - Without audio: `0.47*video + 0.33*identity + 0.20*behavior`
   - Camera off: `0.60*audio + 0.40*behavior`

7. **Real-time broadcast** — Backend broadcasts to all subscribe WebSocket clients for that session:
   - `{type:"metrics", data:{emotion, identity, deepfake, trustScore, confidenceLayers}}`
   - `{type:"alert", severity, category, title, message, recommendation}`
   - `{type:"transcript", text, speaker, isFinal}`
   - `{type:"participants", participants}`
   - `{type:"sourceStatus", status, streams}`

8. **Frontend renders** — DashboardScreen receives WebSocket messages, updates:
   - Trust score circular gauge
   - Emotion classification chart
   - Identity consistency bar
   - Deepfake risk indicator
   - Live transcript feed
   - Alert cards with severity colors
   - Participant list

9. **Session ends** — User clicks "End Session". Backend calls `POST /api/sessions/:id/stop`, generates report summary, persists to Supabase. Frontend shows completed state.

10. **Post-meeting** — User views report on ReportsScreen, can export PDF with alert timeline and transcript.

---

## 4. Full Tech Stack

### Languages
- **TypeScript** — Frontend (React components, contexts, API client)
- **JavaScript (CommonJS)** — Backend (Express server, bot, utilities)
- **Python 3.10+** — AI inference service (FastAPI, PyTorch models)
- **SQL** — Database schema (Supabase/PostgreSQL)

### Frameworks & Libraries

**Frontend:**
| Library | Version | Purpose |
|---------|---------|---------|
| React | 18.3.1 | UI framework |
| Vite | 6.3.5 | Build tool & dev server |
| TypeScript | 5.9.3 | Type safety |
| Tailwind CSS + shadcn/ui | - | Styling (30+ Radix UI components) |
| @supabase/supabase-js | 2.47.0 | Auth & database client |
| recharts | 2.15.2 | Charts |
| jsPDF + jspdf-autotable | 4.2.0 / 5.0.7 | PDF export |
| lucide-react | 0.487.0 | Icons |
| sonner | 2.0.3 | Toast notifications |
| react-hook-form | 7.55.0 | Form handling |
| next-themes | 0.4.6 | Dark/light mode |
| qrcode.react | 4.2.0 | QR codes |

**Backend:**
| Library | Version | Purpose |
|---------|---------|---------|
| Express | 5.2.1 | HTTP framework |
| ws | 8.19.0 | WebSocket server (dual: subscribe + ingest) |
| Puppeteer | 24.37.2 | Headless Chromium for Zoom bot |
| @supabase/supabase-js | 2.47.0 | Database persistence |
| helmet | 8.0.0 | Security headers |
| express-rate-limit | 7.5.0 | Rate limiting |
| cors | 2.8.6 | CORS middleware |
| uuid | 11.1.0 | ID generation |
| dotenv | 17.2.3 | Environment variables |
| @google-cloud/speech | 7.0.0 | Optional GCP STT |

**AI Service:**
| Library | Version | Purpose |
|---------|---------|---------|
| FastAPI | 0.115.6 | HTTP framework |
| uvicorn | 0.32.1 | ASGI server |
| PyTorch | 2.4.1 | ML framework |
| torchvision | 0.19.1 | Vision models |
| torchaudio | 2.4.1 | Audio processing |
| facenet-pytorch | 2.6.0 | FaceNet identity embeddings |
| transformers | 4.44.2 | HuggingFace (DeBERTa NLI) |
| opencv-python | 4.10.0.84 | Image processing |
| mediapipe | 0.10.18 | Face detection |
| scikit-learn | 1.5.2 | ML utilities |
| numpy | 1.26.4 | Numerical computing |
| pydantic | 2.10.3 | Request validation |
| slowapi | 0.1.9 | Rate limiting |
| sentencepiece | 0.2.0 | Tokenizer for DeBERTa |

### External Services
| Service | Purpose | Required? |
|---------|---------|-----------|
| Supabase | PostgreSQL database + Auth (JWT) | Optional in prototype mode |
| Zoom | Video meeting platform (web client) | Required for real bot mode |
| Google Cloud Speech-to-Text | Real-time transcription | Optional (stub STT available) |

---

## 5. Repository Structure

```
RealSync/
├── Front-End/                          # React frontend application
│   ├── src/
│   │   ├── components/
│   │   │   ├── screens/                # 8 page components
│   │   │   │   ├── DashboardScreen.tsx # Live metrics dashboard
│   │   │   │   ├── SessionsScreen.tsx  # Session management + creation
│   │   │   │   ├── ReportsScreen.tsx   # Post-meeting reports + PDF export
│   │   │   │   ├── SettingsScreen.tsx  # User preferences + detection tuning
│   │   │   │   ├── LoginScreen.tsx     # Email/password + OAuth login
│   │   │   │   ├── SignUpScreen.tsx    # User registration
│   │   │   │   ├── CompleteProfileScreen.tsx # Post-signup onboarding
│   │   │   │   └── FAQScreen.tsx       # Help documentation
│   │   │   ├── layout/                 # Shared layout components
│   │   │   │   ├── Sidebar.tsx         # Navigation sidebar
│   │   │   │   ├── TopBar.tsx          # Top bar with session controls
│   │   │   │   └── NotificationBell.tsx # Alert notification dropdown
│   │   │   ├── dashboard/              # Dashboard sub-components
│   │   │   └── ui/                     # shadcn/ui primitives (button, dialog, etc.)
│   │   ├── contexts/
│   │   │   ├── WebSocketContext.tsx     # WS connection + auto-reconnect
│   │   │   ├── NotificationContext.tsx  # Alert history + desktop notifications
│   │   │   └── ThemeContext.tsx         # Dark/light mode
│   │   ├── lib/
│   │   │   ├── api.ts                  # authFetch(), buildApiUrl(), buildWsUrl()
│   │   │   ├── supabaseClient.ts       # Supabase client initialization
│   │   │   └── utils.ts               # Utility functions
│   │   ├── App.tsx                     # Main app component (routing, auth, state)
│   │   └── main.tsx                    # Entry point (React root)
│   ├── vite.config.ts                  # Vite config (proxy, aliases)
│   ├── package.json
│   └── .env                            # Environment variables
│
├── realsync-backend/                   # Node.js backend server
│   ├── index.js                        # Main entry (~1700 lines): Express server,
│   │                                   #   REST routes, dual WebSocket servers,
│   │                                   #   session management, metrics broadcast,
│   │                                   #   frame/audio/text processing pipeline
│   ├── bot/
│   │   ├── ZoomBotAdapter.js           # Puppeteer Zoom bot (~1585 lines):
│   │   │                               #   join flow, frame capture, audio hooks,
│   │   │                               #   caption scraping, participant scraping
│   │   └── botManager.js              # Bot lifecycle (start/stop/schedule)
│   ├── lib/
│   │   ├── auth.js                    # JWT auth middleware (Supabase verification)
│   │   ├── aiClient.js                # HTTP client to AI service (:5100)
│   │   ├── persistence.js             # Supabase CRUD operations
│   │   ├── alertFusion.js             # Alert fusion engine (thresholds, cooldowns)
│   │   ├── fraudDetector.js           # Pattern-based fraud detection
│   │   ├── suggestions.js             # Context-aware suggestion generator
│   │   ├── meetingTypeDetector.js     # Auto-detect meeting type from transcript
│   │   ├── recommendations.js         # Action recommendations for alerts
│   │   ├── gcpStt.js                  # Google Cloud Speech-to-Text wrapper
│   │   ├── supabaseClient.js          # Supabase client init
│   │   ├── logger.js                  # Structured logging
│   │   └── constants.js               # App-wide constants
│   ├── package.json
│   ├── Dockerfile
│   └── .env                           # Environment variables
│
├── RealSync-AI-Prototype/             # Python AI inference service
│   ├── serve/
│   │   ├── app.py                     # FastAPI entry point (endpoints, middleware)
│   │   ├── config.py                  # All model configs, thresholds, weights
│   │   ├── inference.py               # Frame analysis pipeline orchestrator
│   │   ├── deepfake_model.py          # EfficientNet-B4 + SBI deepfake detector
│   │   ├── emotion_model.py           # MobileNetV2 7→6 class emotion classifier
│   │   ├── audio_model.py             # AASIST sinc-conv audio deepfake detector
│   │   ├── identity_tracker.py        # FaceNet identity verification + EMA baseline
│   │   ├── temporal_analyzer.py       # EWMA smoothing, trend detection, anomalies
│   │   └── text_analyzer.py           # DeBERTa-v3 zero-shot NLI behavioral analysis
│   ├── training/
│   │   ├── train_emotion.py           # MobileNetV2 emotion training (FER2013+AffectNet)
│   │   ├── train_audio.py             # AASIST training (ASVspoof 2019 LA)
│   │   ├── convert_sbi_weights.py     # SBI checkpoint → EfficientNet-B4 conversion
│   │   ├── finetune_deepfake_head.py  # Fine-tune deepfake classifier head
│   │   └── train_mesonet.py           # MesoNet training (legacy)
│   ├── tests/                         # pytest test suite (9 test files)
│   ├── src/models/                    # Model weight files (not in git)
│   │   ├── efficientnet_b4_deepfake.pth  # ~80 MB
│   │   ├── emotion_weights.pth           # ~13 MB
│   │   └── aasist_weights.pth            # ~5 MB
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── pytest.ini
│   ├── Dockerfile
│   └── .env
│
├── contracts/                         # Frozen API schema definitions
│   ├── ai-inference.schema.json       # AI service request/response schema
│   ├── ingest.schema.json             # Bot→Backend ingest messages
│   ├── subscribe.schema.json          # Backend→Frontend broadcast events
│   ├── supabase-migration.sql         # Full DB schema (DDL + RLS)
│   └── README.md
│
├── docs/                              # Project documentation
│   ├── CODEMAP.md                     # Codebase map
│   ├── FINAL_RELEASE_TECH_SPEC.md     # Technical specification
│   ├── AI_MODELS_REPORT.md            # Model architectures & accuracy
│   ├── DEPLOYMENT.md                  # Deployment guide
│   ├── DEVELOPMENT_LOG.md             # Development history
│   ├── BRAND_IDENTITY.md              # Brand guidelines
│   ├── MANUAL_E2E_TEST_PLAN.md        # Manual testing runbook
│   └── TECHNICAL_PROJECT_BRIEFING.md  # This document
│
├── tasks/                             # Project management files
│   ├── todo.md
│   ├── lessons.md
│   └── code-review-findings.md
│
├── start.sh                           # Orchestration script (starts all 3 services)
├── README.md                          # Project overview
└── .gitignore
```

---

## 6. How Each Component Works

### Frontend (React + Vite + TypeScript)

**Responsibilities:**
- User authentication (Supabase Auth: email/password, Google OAuth, Azure OAuth, MFA/TOTP)
- Session creation with Zoom URL input and optional scheduling
- Real-time dashboard display (trust score, emotion, identity, deepfake, alerts, transcript)
- WebSocket connection management with auto-reconnect (exponential backoff 1s→30s)
- Post-meeting report viewing and PDF export
- Detection settings management
- Desktop notification support for critical alerts

**State Management:**
- React Context API (no Redux/Zustand):
  - `WebSocketContext` — connection state, message subscription
  - `NotificationContext` — alert history, unread count, desktop notifications
  - `ThemeContext` — dark/light mode
- Component-level state via `useState`/`useRef`
- `localStorage` for scheduled sessions and preferences

**Auth Flow:**
- Supabase `auth.signInWithPassword()` or `auth.signInWithOAuth()`
- JWT token automatically attached to API calls via `authFetch()` wrapper
- Blocked personal email domains (gmail, yahoo, hotmail, etc. — 23 domains)
- Prototype mode: skips auth entirely when `VITE_PROTOTYPE_MODE=1`

**API Client (`lib/api.ts`):**
- `buildApiUrl(path)` — prepends `VITE_API_BASE_URL` to path
- `buildWsUrl(path)` — builds WebSocket URL from `VITE_WS_BASE_URL`
- `authFetch(path, init)` — fetch wrapper that attaches Bearer JWT token
- `getAuthToken()` — retrieves current Supabase session token

**Key Screens:**
| Screen | Purpose |
|--------|---------|
| DashboardScreen | Live trust score gauge, emotion chart, identity bar, deepfake indicator, alerts, transcript, participants |
| SessionsScreen | Create sessions (immediate or scheduled), session history table with pagination |
| ReportsScreen | View completed session reports, alert timeline, transcript viewer, PDF export |
| SettingsScreen | Profile management, detection sensitivity, notification preferences |
| LoginScreen | Email/password login, OAuth, MFA/2FA |

---

### Backend (Node.js + Express 5)

**Responsibilities:**
- REST API for session CRUD, alerts, transcripts, reports, settings, notifications
- Dual WebSocket server (subscribe for clients, ingest for bots)
- Bot lifecycle management (start/stop/schedule)
- AI service client (forwards frames/audio/text for analysis)
- Trust score computation (fuses video + audio + identity + behavior signals)
- Alert generation via AlertFusionEngine + FraudDetector
- Suggestion generation based on context
- Meeting type auto-detection from transcript
- Persistence to Supabase (with graceful fallback when unavailable)
- Rate limiting (global 100/min, custom per-route)
- Session garbage collection (1 hour after end)
- Simulated metrics broadcast for dev/demo (when no bot connected)

**Session Store (In-Memory):**
Each session is a JavaScript object containing:
```javascript
{
  id, userId, title, createdAt, endedAt,
  meetingTypeSelected, meetingTypeAuto,
  meetingUrl, scheduledAt,
  metrics: { emotion, identity, deepfake, trustScore, confidenceLayers },
  subscribers: Set<WebSocket>,
  transcriptState: { interim, lines: [] },
  alertFusion: AlertFusionEngine,
  fraudDetector: FraudDetector,
  botStatus, botStreams, _ingestSocket,
  audioAnalysisBuffer: [], audioAuthenticityScore,
  alerts: [], participants: Map,
  frameSnapshotCounter, suggestionState
}
```

**Bot Modes:**
- `stub` (default): Simulated data — fake frames every 2s, fake captions every 5s, no browser launch
- `real` (`REALSYNC_BOT_MODE=real`): Puppeteer joins actual Zoom meeting via web client

**Alert Fusion Engine:**
- Evaluates visual signals per frame: deepfake (authenticity < 0.70 → CRITICAL), identity shift (> 0.40 → HIGH), anger detection
- Evaluates temporal anomalies: sudden trust drops, identity switches, emotion instability
- Evaluates fraud text patterns: financial fraud, credential theft, impersonation, social engineering
- Evaluates behavioral NLI signals from DeBERTa: social engineering, credential theft, impersonation, emotional manipulation, isolation tactics
- Multi-signal escalation: fraud alerts escalated to CRITICAL when deepfake risk is also elevated
- 30-second cooldown per alert type to prevent spam

---

### AI Service (Python + FastAPI)

**Responsibilities:**
- Receive video frames, audio, and text from backend via HTTP POST
- Run ML inference (deepfake detection, emotion classification, identity verification, audio analysis, text analysis)
- Compute per-face trust scores with temporal smoothing
- Track identity baselines per session with EMA updates
- Detect temporal anomalies (sudden trust drops, identity switches, emotion instability)
- Return structured JSON results

**ML Models:**

| Model | Architecture | Input | Output | Weights File |
|-------|-------------|-------|--------|-------------|
| **Deepfake** | EfficientNet-B4 + SBI | 380×380 RGB face | P(fake) → authenticity score 0-1 | `efficientnet_b4_deepfake.pth` (~80MB) |
| **Emotion** | MobileNetV2 | 128×128 RGB face | 6-class probabilities (Happy, Neutral, Angry, Fear, Surprise, Sad) | `emotion_weights.pth` (~13MB) |
| **Audio Deepfake** | AASIST (SincConv + CNN + attention) | 4s PCM16 16kHz mono | P(spoof) → authenticity score 0-1 | `aasist_weights.pth` (~5MB) |
| **Identity** | FaceNet InceptionResnetV1 | 160×160 RGB face | 512-dim embedding → cosine distance vs baseline | Auto-downloaded (VGGFace2) |
| **Text/Behavioral** | DeBERTa-v3-base-zeroshot | Transcript text (max 2000 chars) | 5 behavioral signal scores | Auto-downloaded (HuggingFace) |
| **Face Detection** | MediaPipe FaceDetection | Full frame | Bounding boxes + confidence | Built-in MediaPipe |

**Frame Analysis Pipeline (`inference.py`):**
1. Decode base64 JPEG → OpenCV BGR array
2. MediaPipe face detection (confidence threshold 0.4)
3. Per face: crop with 30% padding → parallel analysis:
   - EfficientNet-B4 deepfake score
   - MobileNetV2 emotion classification
   - FaceNet embedding → cosine distance vs session baseline
4. Temporal analysis (15-frame window): EWMA smoothing, trend detection, anomaly flagging
5. Trust score computation: `0.47*video + 0.33*identity + 0.20*behavior`
6. No-face tracking: after 5 consecutive frames without faces → `cameraOff: true`

**Identity Tracking:**
- Per-session, per-face baseline embeddings
- EMA update: `baseline = 0.9*baseline + 0.1*current`
- Risk thresholds: shift < 0.20 = low, 0.20-0.40 = medium, > 0.40 = high
- Session TTL: 3600 seconds, auto-eviction when >50 sessions stored

---

### Zoom Bot (Puppeteer + Chromium)

**Responsibilities:**
- Launch headless Chromium with camera/mic permissions
- Navigate to Zoom web client (`app.zoom.us/wc/{meetingId}/join`)
- Handle pre-join dialog (enter name, click join)
- Handle waiting room (2-minute timeout)
- Dismiss Zoom popups and cookie banners
- Capture video frames (screenshot every 2s, JPEG quality 70)
- Capture audio (hook AudioContext, downsample 48kHz→16kHz, PCM16)
- Scrape closed captions (poll DOM every 1s)
- Scrape participant names (poll every 10s)
- Stream all captured data to backend via ingest WebSocket
- Clean up on leave (close browser, send disconnect status)

**Join Flow:**
1. Parse Zoom URL → extract meeting ID and password
2. Navigate to `https://app.zoom.us/wc/{meetingId}/join?pwd={password}`
3. Dismiss cookie banners (OneTrust)
4. Enter display name via React-compatible input event synthesis
5. Click "Join" button
6. Wait for meeting view indicators (gallery-video-container, meeting-app)
7. Handle waiting room if present
8. Enable closed captions
9. Start capture loops (frames, audio, captions, participants)

**URL Validation:**
- Must be HTTPS
- Must be `*.zoom.us` or `*.zoom.com` domain
- Path must contain `/j/` followed by meeting ID

---

## 7. Important Files

### Entry Points
| File | Purpose |
|------|---------|
| `Front-End/src/main.tsx` | React app entry point |
| `Front-End/src/App.tsx` | Main component (routing, auth, session state) |
| `realsync-backend/index.js` | Express server, WebSocket handlers, all REST routes (~1700 lines) |
| `RealSync-AI-Prototype/serve/app.py` | FastAPI server, all AI endpoints |
| `start.sh` | Orchestration script that starts all 3 services |

### Core Backend Files
| File | Purpose |
|------|---------|
| `realsync-backend/bot/ZoomBotAdapter.js` | Puppeteer Zoom bot implementation (~1585 lines) |
| `realsync-backend/bot/botManager.js` | Bot lifecycle management (start/stop/schedule) |
| `realsync-backend/lib/aiClient.js` | HTTP client to AI service (frame/audio/text analysis) |
| `realsync-backend/lib/alertFusion.js` | Alert generation with thresholds, cooldowns, multi-signal fusion |
| `realsync-backend/lib/fraudDetector.js` | Pattern-based fraud detection on transcript text |
| `realsync-backend/lib/persistence.js` | All Supabase CRUD operations |
| `realsync-backend/lib/auth.js` | JWT authentication middleware |
| `realsync-backend/lib/suggestions.js` | Context-aware suggestion generation |

### Core AI Files
| File | Purpose |
|------|---------|
| `RealSync-AI-Prototype/serve/inference.py` | Frame analysis pipeline orchestrator |
| `RealSync-AI-Prototype/serve/deepfake_model.py` | EfficientNet-B4 deepfake model |
| `RealSync-AI-Prototype/serve/emotion_model.py` | MobileNetV2 emotion classifier |
| `RealSync-AI-Prototype/serve/audio_model.py` | AASIST audio deepfake detector |
| `RealSync-AI-Prototype/serve/identity_tracker.py` | FaceNet identity verification |
| `RealSync-AI-Prototype/serve/temporal_analyzer.py` | Temporal pattern analysis |
| `RealSync-AI-Prototype/serve/text_analyzer.py` | DeBERTa behavioral NLI analysis |
| `RealSync-AI-Prototype/serve/config.py` | All model configs and thresholds |

### Core Frontend Files
| File | Purpose |
|------|---------|
| `Front-End/src/lib/api.ts` | API client (authFetch, URL building) |
| `Front-End/src/contexts/WebSocketContext.tsx` | WebSocket connection + auto-reconnect |
| `Front-End/src/contexts/NotificationContext.tsx` | Alert notifications + desktop alerts |
| `Front-End/src/components/screens/DashboardScreen.tsx` | Live metrics dashboard |
| `Front-End/src/components/screens/SessionsScreen.tsx` | Session creation + management |

### Schema & Contracts
| File | Purpose |
|------|---------|
| `contracts/supabase-migration.sql` | Complete database schema (8 tables + RLS) |
| `contracts/ai-inference.schema.json` | AI service API contract |
| `contracts/ingest.schema.json` | Bot→Backend message contract |
| `contracts/subscribe.schema.json` | Backend→Frontend event contract |

---

## 8. How the System Runs Locally

### Prerequisites
- Node.js 18+
- Python 3.10+ with venv
- Model weight files in `RealSync-AI-Prototype/src/models/` (optional — graceful fallback)
- Chromium (auto-installed by Puppeteer, or system Chromium)

### Environment Files

**`Front-End/.env`:**
```env
VITE_API_BASE_URL=http://localhost:4000
VITE_WS_BASE_URL=ws://localhost:4000
VITE_PROTOTYPE_MODE=1
# VITE_SUPABASE_URL=https://your-project.supabase.co     (optional)
# VITE_SUPABASE_ANON_KEY=your-anon-key                   (optional)
```

**`realsync-backend/.env`:**
```env
PORT=4000
ALLOWED_ORIGIN=http://localhost:3000,http://localhost:5173
AI_SERVICE_URL=http://localhost:5100
AI_TIMEOUT_MS=15000
REALSYNC_BOT_MODE=real
# SUPABASE_URL=https://your-project.supabase.co           (optional)
# SUPABASE_SERVICE_KEY=your-service-key                    (optional)
# AI_API_KEY=shared-secret                                 (optional)
# REALSYNC_USE_GCP_STT=1                                   (optional)
```

**`RealSync-AI-Prototype/.env`:**
```env
PORT=5100
HOST=0.0.0.0
# AI_API_KEY=shared-secret                                 (optional, matches backend)
```

### Starting Services

**Option A: All at once (recommended)**
```bash
cd /home/kali/RealSync
bash start.sh
```
This kills old processes on ports 5173/4000/5100, then starts:
1. AI Service (port 5100) — waits for health check (up to 60s)
2. Backend (port 4000) — starts after AI is ready
3. Frontend (port 5173)

**Option B: Manual (3 terminals)**
```bash
# Terminal 1: AI Service
cd RealSync-AI-Prototype && source .venv/bin/activate && python -m serve.app

# Terminal 2: Backend
cd realsync-backend && node index.js

# Terminal 3: Frontend
cd Front-End && npx vite --port 5173
```

### Health Checks
```bash
curl http://localhost:5100/api/health   # AI: {"ok":true, "models":{...}}
curl http://localhost:4000/api/health   # Backend: {"ok":true, "checks":{"ai":"ok",...}}
# Frontend: open http://localhost:5173 in browser
```

---

## 9. Session Flow (Detailed)

### Creating a Session
1. User clicks "New Session" on SessionsScreen
2. Fills in: Title, Meeting Type (official/business/friends), Zoom URL (required)
3. Optionally sets a scheduled time for later
4. Clicks "Start Session"
5. Frontend `POST /api/sessions` → Backend creates session in memory + Supabase
6. Frontend `POST /api/sessions/:id/join` with meetingUrl → Backend starts bot

### Bot Joining
1. Backend calls `botManager.startBot({sessionId, meetingUrl, displayName, onIngestMessage})`
2. In `real` mode: ZoomBotAdapter launches Chromium, navigates to Zoom web client
3. Bot enters name, clicks Join, waits for meeting view
4. Bot sends `{type:"source_status", status:"connected"}` via ingest WebSocket
5. Backend broadcasts `{type:"sourceStatus", status:"connected"}` to subscribers
6. Dashboard shows "Connected" indicator

### Data Capture & Processing
1. Bot captures frame → sends `{type:"frame", dataB64}` via ingest WS
2. Backend `processIngestMessage()`:
   - Validates frame size (<2MB)
   - Calls AI service `POST /api/analyze/frame`
   - AI returns face analysis (deepfake, emotion, identity per face)
   - Backend updates session metrics
   - AlertFusionEngine evaluates thresholds → generates alerts
   - Broadcasts `{type:"metrics"}` and any `{type:"alert"}` to subscribers
3. Bot captures audio → sends `{type:"audio_pcm", dataB64}` via ingest WS
4. Backend accumulates audio buffer → every 4s calls AI `POST /api/analyze/audio`
5. Bot scrapes caption → sends `{type:"caption", text, speaker}` via ingest WS
6. Backend appends to transcript → runs FraudDetector → every 15s calls AI `POST /api/analyze/text`

### Results on Frontend
- DashboardScreen receives WS messages
- Trust score gauge updates (0-1 scale)
- Emotion chart shows top emotions with confidence
- Identity bar shows embedding shift (same person / different person)
- Deepfake risk badge (low/medium/high/unknown)
- Alert cards appear when thresholds crossed
- Transcript lines scroll in real-time

### Ending a Session
1. User clicks "End Session"
2. Frontend `POST /api/sessions/:id/leave` → Backend stops bot
3. Frontend `POST /api/sessions/:id/stop` → Backend ends session, generates report
4. Report persisted to Supabase `session_reports` table
5. User can view report on ReportsScreen, export as PDF

---

## 10. Communication Between Components

### REST API Endpoints (Backend)

| Method | Path | Purpose | Auth Required | Rate Limit |
|--------|------|---------|---------------|------------|
| GET | `/api/health` | Health check (AI + Supabase status) | No | None |
| POST | `/api/sessions` | Create session | No | 20/min |
| GET | `/api/sessions` | List user sessions | Yes | 100/min |
| GET | `/api/sessions/:id/metrics` | Get current metrics | Owner | 100/min |
| POST | `/api/sessions/:id/stop` | End session + generate report | Owner | 100/min |
| POST | `/api/sessions/:id/join` | Bot join meeting | Owner | 100/min |
| POST | `/api/sessions/:id/leave` | Bot leave meeting | Owner | 100/min |
| GET | `/api/sessions/:id/alerts` | Get all alerts | Owner | 100/min |
| GET | `/api/sessions/:id/transcript` | Get transcript lines | Owner | 100/min |
| GET | `/api/sessions/:id/report` | Get session report | Owner | 100/min |
| GET | `/api/settings` | Get detection settings | Yes | 100/min |
| PATCH | `/api/settings` | Update detection settings | Yes | 10/min |
| GET | `/api/notifications` | Get notification history | Yes | 100/min |
| POST | `/api/notifications/read` | Mark notifications read | Yes | 30/min |
| GET | `/api/models` | Get AI model status | No | 100/min |

### WebSocket Channels

**Subscribe Channel (`/ws?sessionId=...`):**
Client → Server:
- `{type:"ping"}` → receives `{type:"pong"}`
- `{type:"auth", token:"JWT"}` → authenticates connection

Server → Client:
- `{type:"metrics", sessionId, data:{emotion, identity, deepfake, trustScore, confidenceLayers, cameraOff, faceCount}}`
- `{type:"alert", alertId, severity, category, title, message, recommendation, source, ts}`
- `{type:"transcript", text, speaker, isFinal, confidence, ts}`
- `{type:"suggestion", severity, title, message, ts}`
- `{type:"sourceStatus", status, streams:{audio, video, captions}, ts}`
- `{type:"participants", participants:[{faceId, name, firstSeen}], ts}`

**Ingest Channel (`/ws/ingest?sessionId=...`):**
Bot/Client → Server:
- `{type:"frame", dataB64, width, height, capturedAt}` — JPEG frame (max 2MB)
- `{type:"audio_pcm", sampleRate:16000, channels:1, dataB64, durationMs}` — PCM16 audio
- `{type:"caption", text, speaker, ts}` — Closed caption text
- `{type:"participants", names:[], ts}` — Participant names
- `{type:"source_status", status, streams}` — Bot connection state
- `{type:"start", meetingType}` — Start signal
- `{type:"stop"}` — Stop signal

### AI Service Endpoints

| Method | Path | Purpose | Rate Limit |
|--------|------|---------|------------|
| GET | `/api/health` | Model status | 120/min |
| POST | `/api/analyze/frame` | Frame analysis (deepfake + emotion + identity) | 60/min |
| POST | `/api/analyze/audio` | Audio deepfake detection | 30/min |
| POST | `/api/analyze/text` | Behavioral NLI analysis | 60/min |
| POST | `/api/sessions/:id/clear-identity` | Reset identity baselines | 60/min |

### Authentication

**Production Mode:**
- Frontend authenticates via Supabase Auth (JWT)
- Every API call includes `Authorization: Bearer <JWT>` header
- Backend middleware verifies token with Supabase `auth.getUser(token)`
- Session ownership enforced (users can only access their own sessions)
- WebSocket auth: first message must be `{type:"auth", token:"JWT"}` within 10s

**Prototype Mode (`VITE_PROTOTYPE_MODE=1`):**
- No Supabase required
- `authFetch()` sends no Authorization header
- Backend `authenticate()` middleware sets `req.userId = null`
- `requireSessionOwner()` skips ownership check when userId is null
- All sessions accessible to all users (anonymous)

---

## 11. Database Schema

**Database: Supabase (PostgreSQL)**

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `sessions` | Meeting sessions | id (UUID PK), title, meeting_type, user_id (FK auth.users), bot_status, meeting_url, created_at, ended_at |
| `transcript_lines` | Speech-to-text history | session_id (FK), text, speaker, is_final, confidence, ts |
| `alerts` | Security alerts | session_id (FK), severity, category, title, message, confidence, source_model, recommendation, ts |
| `suggestions` | Non-critical guidance | session_id (FK), severity, title, message, ts |
| `metrics_snapshots` | Sampled metrics (every 10s) | session_id (FK), data (JSONB), ts |
| `session_reports` | Post-meeting summaries | session_id (FK), summary (JSONB) |
| `profiles` | User profiles | id (FK auth.users), username, full_name, job_title, avatar_url, detection_settings (JSONB) |
| `notification_reads` | Read status tracking | user_id (FK), alert_id (FK), read_at |

**Row Level Security (RLS):** Enabled on all tables. Users can only access their own data. Backend uses service key which bypasses RLS.

**Schema file:** `contracts/supabase-migration.sql`

---

## 12. Current Known Issues & Fragile Parts

### Critical Issues

1. **3 AI models have no weight files** — Deepfake detection (`efficientnet_b4_deepfake.pth`), audio deepfake (`aasist_weights.pth`), and face detection (MediaPipe API changed in v0.10.32 — `mediapipe.solutions` no longer available). The system falls back gracefully (returns `riskLevel: "unknown"` / null scores), but these are core features.

2. **MediaPipe face detection broken** — MediaPipe 0.10.32 (required for Python 3.13 compatibility) removed the `mediapipe.solutions` attribute. Face detection returns empty results. This means no per-face analysis occurs on frames.

3. **AI timeout override** — Backend `.env` has `AI_TIMEOUT_MS=5000` which overrides the code default of 15000ms. Frame analysis on CPU can take >5s, causing timeouts. Should be increased to 15000 or removed.

### High-Priority Issues

4. **In-memory session store** — All sessions are stored in memory. Backend restart loses all active session data. Supabase persistence exists but rehydration is lazy (only on explicit access), meaning active WebSocket subscribers are lost on restart.

5. **Single ingest socket per session** — Only one ingest WebSocket connection allowed per session (enforced with code 4009). If the bot reconnects, the old socket must be closed first.

6. **Participant name-to-face mapping is arbitrary** — Bot scrapes participant names from Zoom DOM and face IDs are assigned sequentially in frames. There's no reliable way to map a specific name to a specific face.

7. **Stub bot data overwrites real data** — The 2-second broadcast loop regenerates simulated metrics for sessions without a connected bot. If the bot disconnects briefly, simulated data overwrites the last real metrics. (Partially fixed — loop now checks `botStatus`.)

### Medium-Priority Issues

8. **Audio capture reliability** — The AudioContext hooking in ZoomBotAdapter is fragile. It patches `createMediaStreamSource` and `HTMLMediaElement.play` before Zoom's JS loads. If Zoom changes its audio pipeline, capture breaks silently.

9. **Caption scraping brittleness** — Uses CSS selectors like `.closed-caption-content` and `[class*="caption"]`. Zoom UI updates can break these selectors without warning.

10. **Puppeteer version dependency** — Uses Puppeteer 24.x which bundles Chromium. Major Puppeteer updates can break Zoom interaction (button selectors, navigation flow).

11. **Frame analysis throughput** — Only 1 frame analysis in-flight per session (throttling). At 0.5 FPS capture rate and potentially >5s inference time, frames may be dropped during heavy load.

12. **No horizontal scaling** — Backend is a single Node.js process. Sessions, WebSocket subscribers, and bot instances are all in-process. Cannot scale to multiple backend instances without architectural changes.

13. **GCP STT not tested** — `REALSYNC_USE_GCP_STT=1` enables Google Cloud Speech-to-Text, but this path hasn't been verified in the current codebase. Default stub STT is used.

14. **Frontend doesn't handle all alert categories** — DashboardScreen has hardcoded category handling. New categories added to AlertFusionEngine may not display correctly.

15. **Rate limiting is per-IP only** — No per-user rate limiting. In production with a reverse proxy, all requests may appear from the same IP.

---

## 13. What the System Does End-to-End (Simple Terms)

1. **A meeting host** opens RealSync in their browser and creates a new session by entering their Zoom meeting URL.

2. **A bot** (headless Chrome browser) automatically joins the Zoom meeting as a participant called "RealSync Bot".

3. **The bot captures** everything happening in the meeting:
   - Screenshots of the video feed every 2 seconds
   - Audio from all participants
   - Closed captions (what people are saying)
   - Names of participants

4. **All captured data streams** in real-time to the backend server via WebSocket.

5. **The backend sends** the data to an AI analysis service that runs multiple ML models:
   - **Deepfake detection** — Is this a synthetic/manipulated face?
   - **Audio deepfake detection** — Is this a cloned/synthetic voice?
   - **Emotion analysis** — What emotions are being expressed?
   - **Identity verification** — Is this the same person throughout the call?
   - **Behavioral analysis** — Is anyone using social engineering tactics?

6. **Results are fused** into a single "trust score" (0-100%) and broadcast back to the host's browser dashboard in real-time.

7. **Alerts fire** when threats are detected:
   - "Potential deepfake detected — authenticity score dropped below 70%"
   - "Identity shift — the person on camera may have changed"
   - "Credential theft attempt — someone is requesting sensitive information"
   - "Social engineering detected — urgency and pressure tactics identified"

8. **After the meeting**, the host can view a detailed report with:
   - Overall risk assessment
   - Timeline of all alerts
   - Full transcript
   - Severity breakdown
   - Exportable as PDF

The system essentially acts as a **real-time AI security guard** for video calls, watching for deepfakes, impersonation, and social engineering that humans might miss.

---

## 14. Environment Variables Reference

### Frontend (`Front-End/.env`)
| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_BASE_URL` | `''` (empty) | Backend API base URL |
| `VITE_WS_BASE_URL` | `''` (empty) | Backend WebSocket base URL |
| `VITE_PROTOTYPE_MODE` | `undefined` | Set to `1` to skip auth |
| `VITE_SUPABASE_URL` | - | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | - | Supabase anonymous key |

### Backend (`realsync-backend/.env`)
| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `4000` | HTTP/WS server port |
| `ALLOWED_ORIGIN` | `http://localhost:3000` | CORS origins (comma-separated) |
| `AI_SERVICE_URL` | `http://localhost:5100` | AI inference service URL |
| `AI_TIMEOUT_MS` | `15000` | AI request timeout |
| `AI_API_KEY` | `''` | Shared secret for AI service |
| `SUPABASE_URL` | - | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | - | Supabase service role key |
| `REALSYNC_BOT_MODE` | `stub` | `real` for Puppeteer, `stub` for simulated |
| `REALSYNC_USE_GCP_STT` | `0` | `1` to enable Google Cloud STT |
| `AUDIO_DEEPFAKE_ENABLED` | `true` | Enable audio deepfake analysis |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

### AI Service (`RealSync-AI-Prototype/.env`)
| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `5100` | FastAPI server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `AI_API_KEY` | `''` | API key (required in production) |
| `ENV` | - | Set to `production` to enforce API key |
| `CORS_ALLOWED_ORIGIN` | `localhost:*` | Allowed CORS origins |

---

## 15. Key Configuration Values (AI Thresholds)

These values in `RealSync-AI-Prototype/serve/config.py` control alert sensitivity:

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `DEEPFAKE_AUTH_THRESHOLD_LOW_RISK` | 0.85 | Authenticity > 0.85 = safe |
| `DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK` | 0.70 | Authenticity < 0.70 = dangerous |
| `IDENTITY_SHIFT_LOW` | 0.20 | Shift < 0.20 = same person |
| `IDENTITY_SHIFT_HIGH` | 0.40 | Shift > 0.40 = different person |
| `IDENTITY_SAME_PERSON_THRESHOLD` | 0.25 | Binary same/different cutoff |
| `IDENTITY_EMA_ALPHA` | 0.1 | Baseline update rate |
| `TEXT_ALERT_THRESHOLD` | 0.65 | NLI score to trigger signal |
| `TEXT_HIGH_SEVERITY_THRESHOLD` | 0.80 | NLI score for high severity |
| `TRUST_WEIGHT_VIDEO` | 0.47 | Video weight in trust score |
| `TRUST_WEIGHT_IDENTITY` | 0.33 | Identity weight in trust score |
| `TRUST_WEIGHT_BEHAVIOR` | 0.20 | Behavior weight in trust score |
| `TEMPORAL_WINDOW` | 15 | Frames in temporal buffer |
| `EWMA_DECAY` | 0.85 | Smoothing factor |
| `NO_FACE_CAMERA_OFF_THRESHOLD` | 5 | Consecutive no-face frames before cameraOff |

Backend alert thresholds (in `realsync-backend/lib/alertFusion.js`):

| Parameter | Value | Alert Generated |
|-----------|-------|----------------|
| Deepfake authenticity ≤ 0.70 | CRITICAL | "Potential Deepfake Detected" |
| Deepfake authenticity ≤ 0.85 | HIGH | "Elevated Deepfake Risk" |
| Identity shift ≥ 0.40 | HIGH | "Identity Inconsistency" |
| Identity shift ≥ 0.20 | MEDIUM | "Minor Identity Drift" |
| Anger confidence ≥ 0.70 | MEDIUM | "Aggressive Behavior Detected" |
| Alert cooldown | 30 seconds | Per alert type |

---

*Document generated: 2026-03-05*
*Repository: /home/kali/RealSync (branch: main)*
