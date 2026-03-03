# RealSync Codemap

> Complete codebase map for the RealSync real-time meeting intelligence platform.
> Last updated: 2026-03-02

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              RealSync System                                │
│                                                                             │
│  ┌────────────────┐    ┌──────────────────────┐    ┌────────────────────┐  │
│  │  Zoom Meeting   │───>│  Zoom Bot (Puppeteer) │───>│  Backend (Node.js) │  │
│  │  (Participants) │    │  Headless Chromium     │    │  Express :4000     │  │
│  └────────────────┘    └──────────────────────┘    └───────┬────────────┘  │
│                            Streams:                         │               │
│                            - Video frames (JPEG, 0.5 FPS)   │ WS /ws/ingest│
│                            - Audio (PCM16 mono 16kHz)        │               │
│                            - Closed captions (DOM scrape)    v               │
│                                                     ┌──────────────────┐    │
│                                                     │  Pipeline Router  │    │
│                                                     └──┬───────┬───┬──┘    │
│                                              ┌─────────┘       │   └────┐  │
│                                              v                 v        v  │
│                                    ┌──────────────┐  ┌──────────┐ ┌──────┐│
│                                    │ AI Service    │  │Transcript│ │Fraud ││
│                                    │ FastAPI :5100 │  │ Analyzer │ │Detect││
│                                    │ 6 ML models   │  │ STT+NLP  │ │Module││
│                                    └──────┬───────┘  └────┬─────┘ └──┬───┘│
│                                           └───────┬───────┴──────────┘    │
│                                                   v                       │
│                                          ┌─────────────────┐              │
│                                          │  Alert Fusion    │              │
│                                          │  Engine          │              │
│                                          └────────┬────────┘              │
│                                    ┌──────────────┼──────────────┐        │
│                                    v              v              v        │
│                              ┌──────────┐  ┌───────────┐  ┌──────────┐  │
│                              │ WS /ws   │  │ Supabase  │  │ Frontend │  │
│                              │ Broadcast│  │ Postgres  │  │ React    │  │
│                              └──────────┘  └───────────┘  │ :5173    │  │
│                                                            └──────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Zoom Bot** joins a meeting as a headless Chromium participant via Puppeteer
2. Bot captures video frames (screenshot every 2s), audio (PCM16 chunks every 500ms), and captions (DOM scrape every 1s)
3. Bot streams all data to the backend via WebSocket (`/ws/ingest`) or directly via `onIngestMessage` callback
4. Backend routes data through three pipelines:
   - **AI Service** (Python FastAPI) -- deepfake, emotion, identity, audio, and text analysis
   - **Transcript Analyzer** -- GCP Speech-to-Text + keyword scoring
   - **Fraud Detector** -- pattern matching + DeBERTa NLI behavioral analysis
5. **Alert Fusion Engine** combines all signals, applies per-face cooldowns, and emits alerts
6. Results broadcast to the frontend via WebSocket (`/ws`) and persisted to Supabase

### Inter-Service Communication

| From -> To | Protocol | Path | Format |
|-----------|----------|------|--------|
| Bot -> Backend | WebSocket / callback | `/ws/ingest` | JSON (frame, audio_pcm, caption, source_status) |
| Backend -> AI | HTTP POST | `/api/analyze/{frame,audio,text}` | JSON request/response (5s timeout) |
| Backend -> Frontend | WebSocket | `/ws` | JSON events (metrics, alert, transcript, participants) |
| Backend -> Supabase | TCP | Supabase JS client | SQL via REST (service role, bypasses RLS) |
| Frontend -> Supabase | HTTPS | Supabase JS client | Auth, Storage, Profiles (anon key, RLS enforced) |

---

## Root Directory

```
RealSync/
├── Front-End/                    # React + Vite + TypeScript frontend
├── realsync-backend/             # Node.js + Express + WebSocket backend
├── RealSync-AI-Prototype/        # Python FastAPI AI inference service
├── contracts/                    # Frozen API schemas (JSON Schema)
│   ├── ai-inference.schema.json  # AI frame analysis response contract
│   ├── ingest.schema.json        # Bot -> Backend ingest message contract
│   ├── subscribe.schema.json     # Backend -> Frontend subscribe message contract
│   ├── supabase-migration.sql    # Database schema DDL
│   └── README.md
├── docs/                         # Project documentation
│   ├── FINAL_RELEASE_TECH_SPEC.md
│   ├── AI_MODELS_REPORT.md
│   ├── DEPLOYMENT.md
│   ├── BRAND_IDENTITY.md
│   ├── CODEMAP.md                # This file
│   └── DEVELOPMENT_LOG.md        # Development history and decisions
├── tasks/                        # Task tracking and project management
│   ├── todo.md
│   ├── lessons.md
│   ├── ai-pipeline-upgrade-plan.md
│   ├── code-review-findings.md
│   └── code-review-results.md
├── AI_SERVICE_REPORT.md          # Latest AI model status report
├── README.md
├── start.sh                      # Orchestration: starts all 3 services
├── .gitignore
└── .gitattributes
```

---

## Frontend (`Front-End/`)

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18.3 + TypeScript 5.9 |
| Build | Vite 6.3 + SWC |
| Styling | Tailwind CSS v4 |
| Component Library | shadcn/ui (50+ Radix UI primitives) |
| Auth + Database | Supabase JS v2 |
| Real-time | Native WebSocket (custom context) |
| PDF Export | jsPDF + jspdf-autotable |
| Icons | lucide-react 0.487 |
| Fonts | Space Grotesk + JetBrains Mono |
| Toasts | Sonner 2.0 |
| 2FA QR | qrcode.react 4.2 |

### Directory Structure

```
Front-End/src/
├── main.tsx                         # Entry point; provider tree: StrictMode > ErrorBoundary > ThemeProvider > App
├── App.tsx                          # Auth state machine, screen router, session lifecycle
├── index.css                        # Tailwind v4 compiled output
│
├── contexts/
│   ├── WebSocketContext.tsx          # WS lifecycle, reconnect with backoff, heartbeat, message fan-out
│   ├── NotificationContext.tsx       # Alert aggregation, toast dispatch, desktop notifications, persistence
│   └── ThemeContext.tsx              # Dark/light/system theme; persists to localStorage
│
├── lib/
│   ├── api.ts                       # URL builders (buildApiUrl, buildWsUrl), authFetch with Supabase JWT
│   ├── supabaseClient.ts            # Supabase singleton client (anon key)
│   ├── audioPcm.ts                  # Mic capture > PCM16 > Base64 stream (16kHz downsampling)
│   ├── blockedDomains.ts            # 18 personal email domains blocked for corporate-only signup
│   └── utils.ts                     # cn() Tailwind class merge utility (clsx + tailwind-merge)
│
├── components/
│   ├── ErrorBoundary.tsx            # Class-based error boundary with 3 retries
│   ├── layout/
│   │   ├── Sidebar.tsx              # Left nav (256px fixed); logo; 4 screen links; Help dropdown (FAQ + email)
│   │   ├── TopBar.tsx               # Page header; WS status indicator (green/red dot); user avatar dropdown
│   │   └── NotificationBell.tsx     # Bell icon + unread badge (cap 99+); category filter popover; mark-read
│   ├── dashboard/
│   │   └── ParticipantList.tsx      # Face ID pill grid (max 20); 6 color themes; click-to-filter alerts
│   ├── screens/
│   │   ├── LoginScreen.tsx          # Email/password + OAuth (Google, Microsoft) + MFA TOTP challenge
│   │   ├── SignUpScreen.tsx         # Registration with domain blocklist + email verify + password strength
│   │   ├── CompleteProfileScreen.tsx # Post-signup onboarding (name, job title, avatar upload)
│   │   ├── DashboardScreen.tsx      # Live monitoring: trust gauge, emotions, alerts, identity, confidence bars
│   │   ├── SessionsScreen.tsx       # Session CRUD, scheduling (auto-join setTimeout), URL validation
│   │   ├── ReportsScreen.tsx        # Session report viewer + PDF export (jsPDF multi-page, branded)
│   │   ├── SettingsScreen.tsx       # 5-tab settings: General, Privacy/2FA, Detection, Storage, Notifications
│   │   └── FAQScreen.tsx            # Static searchable FAQ accordion (12 items, 5 categories)
│   └── ui/                          # 50+ shadcn/ui primitives (button, card, dialog, table, switch, etc.)
│
├── styles/
│   ├── globals.css                  # Global styles
│   └── brand-colors.css             # CSS custom properties design token system (severity colors, bg layers)
└── assets/                          # Logo variants (dark, light, eye icon)
```

### Screens & Navigation

The app uses a state machine in `App.tsx` -- no router library. `setCurrentScreen(screen)` drives all navigation.

```
[No session] --> LoginScreen <-> SignUpScreen
[Session, no profile.username] --> CompleteProfileScreen
[Authenticated, botConnecting] --> Fullscreen overlay (3-step progress, 30s timeout)
[Authenticated] --> Sidebar navigation:
    DashboardScreen  <-- SessionsScreen (onStartSession)
    SessionsScreen
    ReportsScreen
    SettingsScreen
    FAQScreen
```

**Prototype mode:** `VITE_PROTOTYPE_MODE=1` or missing Supabase env vars skips all auth, renders the main app directly.

#### Screen Details

| Screen | State | API Calls | WS Events |
|--------|-------|-----------|-----------|
| **LoginScreen** | email, password, MFA state | `supabase.auth.signInWithPassword`, `signInWithOAuth`, `mfa.challenge/verify`, `resetPasswordForEmail` | None |
| **SignUpScreen** | email, password, domain validation | `supabase.auth.signUp`, `auth.resend` | None |
| **CompleteProfileScreen** | name, avatar upload | `supabase.storage.upload`, `from('profiles').upsert` | None |
| **DashboardScreen** | metrics, alertEvents (100 cap), botStatus, participants, selectedFaceId | `POST /sessions/:id/leave`, `POST /sessions/:id/stop`, polling `GET /sessions/:id/metrics` as WS fallback | `metrics`, `alert`, `participants`, `sourceStatus` |
| **SessionsScreen** | scheduled sessions (localStorage), history, pagination (5/page) | `GET/POST /sessions`, `POST /sessions/:id/join` | None |
| **ReportsScreen** | sessions list, report detail, alerts, transcript | `GET /sessions`, `GET /sessions/:id/{report,alerts,transcript}` (parallel) | None |
| **SettingsScreen** | 5 tabs: profile edit, 2FA enrollment, detection toggles, storage (static), notification prefs | `supabase.auth.mfa.*`, `GET/PATCH /settings`, `supabase.storage`, `supabase.from('profiles').update` | None |
| **FAQScreen** | search query, expanded index | None | None |

**DashboardScreen panels (3-column grid):**
1. Live Trust Score -- SVG circular gauge (radius 88, cyan-to-blue gradient)
2. Meeting Summary -- session metadata, bot status indicators, End Session button
3. Live Alerts -- up to 5 items, sourced from WS `alert` events or derived from metric thresholds
4. Facial Emotion Recognition -- dominant label, confidence, top-3 bar chart
5. Identity Consistency -- same-person boolean, embedding shift bar, risk level
6. Visual Manipulation Detection -- authenticity score bar (hidden when `cameraOff: true`)
7. Participants -- `ParticipantList` when `faceCount > 1`
8. Confidence Layer Scores -- full-width audio/video/behavior bars

### React Contexts

**WebSocketContext** manages a single WS connection per active session:
- Exponential backoff reconnect: 1s initial, doubles to 30s max, resets on success
- Client heartbeat: `{ type: "ping" }` every 25s
- Dead-connection detection: 35s since last message triggers close
- Auth handshake: sends `{ type: "auth", token: supabaseJWT }` on open
- Pub/sub: `subscribe(handler)` returns `unsubscribe()`. Errors in one handler don't affect others
- Hooks: `useWebSocket()` returns `{ isConnected, subscribe }`; `useWsMessages(handler)` uses a ref to avoid resubscription

**NotificationContext** aggregates all alert events:
- Loads initial history from `GET /api/notifications?limit=50` on mount
- Subscribes to WS `alert` messages, prepends to array (200 cap)
- Fires `toast.error` for critical/high, `toast.warning` for others via Sonner
- Desktop notifications (native `Notification` API) when tab is hidden, permission granted, and severity is in user's filter
- Persists read state via `POST /api/notifications/read`
- Severity filter stored in `localStorage` (default: `['high', 'critical']`)

**ThemeContext** manages light/dark/system preference:
- Reads system preference via `matchMedia('(prefers-color-scheme: dark)')`
- Applies `document.documentElement.classList.add/remove('dark')`
- Persists to `localStorage` key `realsync-theme`
- Listens to `matchMedia.change` when `theme === 'system'`

### Session Lifecycle (App.tsx)

```
handleStartSession(sessionId, title, meetingType)
  --> Sets activeSessionId (triggers WS reconnect to new session)
  --> Shows botConnecting overlay with 3-step progress (creating > joining > streaming)
  --> Navigates to 'dashboard'

onBotConnected()  [called from DashboardScreen on WS sourceStatus = 'connected']
  --> botProgress = 'streaming' --> 1.2s delay --> overlay dismissed

handleEndSession()
  --> Clears activeSessionId (WS disconnects automatically)
```

### API Surface (Frontend -> Backend)

| Endpoint | Method | Used By |
|----------|--------|---------|
| `/api/sessions` | GET/POST | SessionsScreen, ReportsScreen |
| `/api/sessions/:id/join` | POST | SessionsScreen |
| `/api/sessions/:id/leave` | POST | DashboardScreen |
| `/api/sessions/:id/stop` | POST | DashboardScreen |
| `/api/sessions/:id/metrics` | GET | DashboardScreen (polling fallback when WS disconnected) |
| `/api/sessions/:id/report` | GET | ReportsScreen |
| `/api/sessions/:id/alerts` | GET | ReportsScreen |
| `/api/sessions/:id/transcript` | GET | ReportsScreen |
| `/api/notifications` | GET | NotificationContext (on mount) |
| `/api/notifications/read` | POST | NotificationContext (markAsRead, markAllRead) |
| `/api/settings` | GET/PATCH | SettingsScreen (detection toggles) |
| `/ws?sessionId=<id>` | WebSocket | WebSocketContext |

---

## Backend (`realsync-backend/`)

### Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js (CommonJS) |
| HTTP | Express 5 |
| WebSocket | ws 8.19 |
| Headless Browser | Puppeteer 24 |
| Database | Supabase JS v2 (Postgres) |
| Speech-to-Text | Google Cloud Speech v7 (optional) |
| Security | Helmet, express-rate-limit (100 req/min), CORS |

### Directory Structure

```
realsync-backend/
├── index.js                   # Entry point: Express + 2 WS servers + session state + pipeline (~1500 lines)
├── package.json
├── Dockerfile
├── .env.example
│
├── bot/
│   ├── ZoomBotAdapter.js      # Puppeteer Zoom client (~1585 lines): join flow, 4 capture loops
│   ├── botManager.js          # Bot lifecycle: start/stop/schedule, stub vs. real mode, retry with fallback
│   ├── generateAvatarVideo.js # Offline utility: renders Baymax avatar as Y4M video (640x480, 15fps, 10s)
│   ├── avatar-feed.y4m        # Pre-rendered avatar (used as Chromium fake camera feed)
│   └── baymax-base.png        # Source image for avatar generation
│
└── lib/
    ├── aiClient.js            # HTTP client for AI service; mock fallback on any failure
    ├── alertFusion.js         # AlertFusionEngine: AI scores > thresholds > alerts with per-face cooldowns
    ├── auth.js                # Supabase JWT middleware for HTTP + WebSocket; prototype mode bypass
    ├── constants.js           # Shared constants: EMOTIONS = ["Happy", "Neutral", "Angry", "Fear", "Surprise", "Sad"]
    ├── fraudDetector.js       # 5-category keyword fraud detection + DeBERTa NLI signal evaluation
    ├── gcpStt.js              # GCP Speech-to-Text streaming wrapper; stub mode cycles sample sentences
    ├── logger.js              # Structured JSON logger (stdout/stderr); configurable LOG_LEVEL
    ├── meetingTypeDetector.js  # 3-channel classifier: manual > opening statement > auto keyword scoring
    ├── persistence.js         # Supabase CRUD for 8 tables; all ops degrade to no-ops without Supabase
    ├── recommendations.js     # Pure lookup: (category, severity) > actionable recommendation text
    ├── suggestions.js         # Rule-based meeting suggestions with cooldowns
    └── supabaseClient.js      # Supabase singleton client factory (service role key)
```

### Server & Routing (`index.js`)

**Startup:** Before Express boots, kills orphaned Chromium processes from previous crash-exits via `pgrep`/`SIGTERM`.

**Two WebSocket servers sharing one HTTP server:**

| Server | Path | Max Payload | Purpose |
|--------|------|-------------|---------|
| `wssSubscribe` | `/ws` | 256 KB | Frontend subscribes for real-time events |
| `wssIngest` | `/ws/ingest` | 2 MB | Bot pushes raw frames, audio, captions |

**Middleware chain:** Helmet -> CORS (multi-origin via comma-separated env var) -> rate limit (100 req/min on `/api/*`) -> JSON body (2 MB) -> Supabase JWT auth

**REST Routes (20 endpoints):**

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | None | Health ping |
| GET | `/api/health` | None | AI service + Supabase reachability |
| GET | `/api/models` | Optional | Current model status (external vs simulated) |
| POST | `/api/sessions` | Optional | Create session |
| GET | `/api/sessions` | Optional | List sessions (in-memory + Supabase merged) |
| GET | `/api/sessions/:id/metrics` | Owner | Current live metrics |
| POST | `/api/sessions/:id/metrics` | Owner | Push metrics from external source |
| POST | `/api/sessions/:id/stop` | Owner | End session, generate report |
| POST | `/api/sessions/:id/join` | Owner | Launch bot to join Zoom meeting |
| POST | `/api/sessions/:id/leave` | Owner | Stop bot, broadcast disconnected |
| GET | `/api/sessions/:id/alerts` | Owner | Alert history (Supabase-first, in-memory fallback) |
| GET | `/api/sessions/:id/transcript` | Owner | Transcript lines |
| GET | `/api/sessions/:id/report` | Owner | Severity breakdown report |
| GET | `/api/notifications` | Required | User notification feed (paginated) |
| GET | `/api/notifications/unread-count` | Required | Badge count |
| POST | `/api/notifications/read` | Required | Mark alerts as read |
| GET | `/api/settings` | Required | User detection settings (JSONB) |
| PATCH | `/api/settings` | Required | Update detection settings |
| GET | `/api/metrics` | Optional | Latest metrics for user's most recent session |
| POST | `/api/metrics` | Required | Push metrics (backwards-compat) |

**In-memory session object:**
```
{
  id, userId, title, meetingUrl, source ("simulated"|"external"),
  metrics,                    // Live AI result
  subscribers: Set<WebSocket>,
  transcriptState: { interim, lines[] },   // Capped at 2000 lines
  stt,                        // GCP STT stream or stub
  audioAnalysisBuffer,        // Base64 chunk accumulator (max 128)
  audioAuthenticityScore,     // Last AASIST result (null until first analysis)
  alertFusion,                // AlertFusionEngine instance (per-session cooldowns)
  fraudDetector,              // FraudDetector instance (per-session rolling window)
  botStatus, botStreams,
  alerts: [],                 // Capped at 500
  participants: Map<faceId, { name, firstSeen }>,
}
```

**Background loops:**
- Broadcast (2s): generates simulated metrics for sessions not receiving external data
- WS keepalive (30s): ping/pong, terminates dead connections
- Session GC (5min): removes ended sessions older than 1 hour from memory

**Session rehydration:** Sessions evicted from memory are lazily rebuilt from Supabase on the next API/WS request. A `_rehydrating` Map serializes concurrent rehydration calls.

### Zoom Bot System (`bot/`)

**ZoomBotAdapter** handles the complete Zoom web-client join flow:

1. Launch Chromium with `--use-fake-ui-for-media-stream` (auto-grants mic/camera) and `--use-file-for-fake-video-capture=avatar-feed.y4m`
2. Pre-inject `AudioContext.prototype.createMediaStreamSource` override to capture early audio streams
3. Navigate to `https://app.zoom.us/wc/{meetingId}/join?pwd=...` (extracted via regex, bypasses unreliable landing page)
4. Dismiss cookie banners (OneTrust selectors then text-matching fallback)
5. Enter display name using React-compatible native value setter + synthetic events
6. Click Join button (polls 20x for enable, uses `mouse.click` then pointer event fallback)
7. Wait for meeting DOM selectors; handle waiting room (2-min timeout)
8. Enable closed captions, dismiss popup overlays
9. Start four capture loops:

| Loop | Interval | Method | Output Message |
|------|----------|--------|---------------|
| Frame capture | 2000ms (recursive setTimeout) | `page.screenshot({ jpeg, quality: 70 })` | `{ type: "frame", dataB64, width: 1280, height: 720, capturedAt }` |
| Caption scraping | 1000ms | DOM query (6 selector variants) | `{ type: "caption", text, speaker, ts }` |
| Participant scraping | 10000ms | Panel DOM or video tile name labels | `{ type: "participants", names[], ts }` |
| Audio capture | 500ms chunks | In-browser ScriptProcessor (48kHz -> 16kHz downsample -> PCM16 -> base64) | `{ type: "audio_pcm", sampleRate: 16000, dataB64 }` |

Every 15 frames (~30s), runs inline popup dismissal to clear Zoom overlays.

**botManager** wraps the adapter with lifecycle management:
- `startBot()` -- creates adapter, retries up to 2x with exponential backoff, falls back to stub on all failures
- `stopBot()` -- graceful cleanup (adapter.leave + browser.close)
- `scheduleBot()` -- setTimeout for future auto-join (max 7 days ahead)
- `cleanupAll()` -- called on graceful shutdown, stops all bots and timers
- **Stub mode** (`REALSYNC_BOT_MODE !== "real"`): generates 1x1 black JPEG frames every 2s and cycles through 8 sample caption lines

### Alert Fusion Pipeline

```
Video frames ────> AI Service (EfficientNet-B4, FaceNet, MobileNetV2)
                     │
                     ├── evaluateVisual() [per face, up to 6]
                     │     deepfake auth <= 0.70 --> critical    <= 0.85 --> high
                     │     identity shift >= 0.40 --> high       >= 0.20 --> medium
                     │     anger conf > 0.70 --> medium          fear + official --> low
                     │
                     ├── evaluateTemporal() [from AI temporal analyzer]
                     │     sudden_trust_drop --> high
                     │     identity_switch --> critical
                     │     emotion_instability --> low
                     │
Audio chunks ───> AI Service (AASIST) --> session.audioAuthenticityScore
                     │  (affects 4-signal trust computation on next frame)
                     │
Transcripts ────> FraudDetector.evaluate() [5-category keyword patterns, 60s rolling window]
                  FraudDetector.evaluateBehavioral() [DeBERTa NLI signals]
                     │
                     └── fuseWithTranscript()
                           if deepfake risk elevated --> escalate fraud alerts one severity level

All alerts --> getRecommendation() --> broadcast to /ws --> persist to Supabase
```

**Fraud rule categories:** FINANCIAL_FRAUD ("wire transfer" 0.8, "gift card" 0.9), CREDENTIAL_THEFT ("otp" 0.8, "share your code" 0.9), IMPERSONATION ("this is the ceo" 0.8), SOCIAL_ENGINEERING ("don't tell anyone" 0.8), ALTERCATION ("kill you" 1.0, "you're dead" 1.0).

**Visual risk amplification:** When deepfake risk is "high", fraud/scam keyword scores are multiplied by 1.5; when "medium", by 1.25. Identity risk adds 0.3 (high) or 0.15 (medium).

**Trust Score Formula:**
```
With audio:    0.35 x video + 0.25 x audio + 0.25 x identity + 0.15 x behavior
Without audio: 0.47 x video + 0.33 x identity + 0.20 x behavior
Camera off:    0.60 x audio + 0.40 x behavior
```

**Cooldown system:** Per-face cooldown keys (e.g., `deepfake_high_face0`) prevent the same alert type from firing within 30-60s per face. Cooldown entries auto-evict after 5 minutes when the map exceeds 200 keys.

### Service Libraries

| File | Purpose | Key Detail |
|------|---------|------------|
| `aiClient.js` | HTTP client for AI service (5s timeout, `X-API-Key` header). Falls back to deterministic mock response on any failure -- pipeline never blocks. | Mock formula mirrors real: `0.47*auth + 0.33*identity + 0.20*behavior` |
| `alertFusion.js` | Converts AI scores into alerts with per-face cooldowns (30-60s). Evaluates visual, temporal, and transcript signals. | Also handles severity escalation when deepfake + fraud signals coincide |
| `persistence.js` | Supabase CRUD for 8 tables. All operations degrade to no-ops when Supabase is unavailable. | `generateReport()` builds severity breakdown from parallel alert + transcript queries |
| `fraudDetector.js` | Weighted keyword matching on 60s rolling transcript window. Processes both raw keywords and DeBERTa NLI behavioral signals. | Separate cooldown maps for keyword vs behavioral alerts |
| `auth.js` | Supabase JWT verification for HTTP (middleware) and WebSocket (token message). Prototype mode bypasses all auth. | `requireSessionOwner` middleware factory checks session ownership |
| `recommendations.js` | Pure lookup: 6 categories x 4 severities -> human-readable action text. | e.g., deepfake/critical: "Leave the meeting immediately..." |
| `gcpStt.js` | GCP Speech-to-Text streaming wrapper (`LINEAR16`, 16kHz, `en-US`). Stub mode cycles sample sentences every 6s. | `REALSYNC_USE_GCP_STT=1` to enable real GCP |
| `meetingTypeDetector.js` | 3-channel meeting type detection: manual (always wins) > opening statement (first 60s, 0.85 confidence) > auto keyword scoring. | 6 topic tag categories boost meeting type scores |
| `suggestions.js` | Rule-based suggestions with cooldowns: visual risk + money keywords, identity drift + official meeting, credential keywords + friends meeting. | Mutations fired Map in-place for cooldown tracking |
| `constants.js` | EMOTIONS list used by 3+ files for mock generation and validation. | `["Happy", "Neutral", "Angry", "Fear", "Surprise", "Sad"]` |

---

## AI Service (`RealSync-AI-Prototype/`)

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | FastAPI 0.115 + Uvicorn |
| Language | Python 3.12 (local dev), 3.11 (Docker) |
| ML Framework | PyTorch 2.4 + torchvision |
| Face Detection | MediaPipe 0.10 |
| Identity | FaceNet (facenet-pytorch 2.6, VGGFace2 pretrained) |
| Text NLI | HuggingFace Transformers 4.44 (DeBERTa-v3-base) |
| Deployment | Docker (python:3.11-slim) |

### Directory Structure

```
RealSync-AI-Prototype/
├── serve/                           # Runtime inference package
│   ├── __init__.py
│   ├── app.py                       # FastAPI app, lifespan (eager model load), CORS, API key auth
│   ├── config.py                    # All constants, thresholds, model paths, device settings
│   ├── inference.py                 # Main per-frame pipeline: decode > detect > classify > respond
│   ├── deepfake_model.py            # EfficientNet-B4 binary deepfake classifier (sigmoid output)
│   ├── emotion_model.py             # MobileNetV2 7-class > 6-class emotion (disgust merged to angry)
│   ├── audio_model.py               # SincConv + 4 ConvBlocks + attention pooling audio deepfake detector
│   ├── identity_tracker.py          # FaceNet per-session identity tracking with EMA baseline drift
│   ├── text_analyzer.py             # DeBERTa-v3 zero-shot NLI with 5 behavioral hypotheses
│   └── temporal_analyzer.py         # EWMA smoothing (decay 0.85) + 3 anomaly detectors
│
├── training/                        # Offline training scripts
│   ├── finetune_deepfake_labeled.py # BEST: Full fine-tune on labeled real/fake data (92.33% val acc)
│   ├── train_audio_sincconv.py      # AASIST on ASVspoof 2019 LA (in progress)
│   └── finetune_deepfake_head.py    # ABANDONED: SBI head-only (max 61% accuracy)
│
├── scripts/
│   ├── download_models.sh           # Pre-cache DeBERTa + verify .pth weight files
│   └── monitor_training.sh          # Live TUI dashboard for training jobs (parses log files)
│
├── src/models/                      # Trained weight files
│   ├── efficientnet_b4_deepfake.pth           # Best checkpoint: 92.33% val acc, epoch 14
│   ├── efficientnet_b4_deepfake_epoch2_84.6acc.pth  # Earlier snapshot
│   ├── emotion_weights.pth                    # MobileNetV2 emotion weights
│   ├── aasist_weights.pth                     # AASIST audio weights (training in progress)
│   └── mesonet4_weights.h5                    # Legacy MesoNet-4 (replaced)
│
├── Dockerfile
└── requirements.txt
```

### FastAPI Application (`serve/app.py`)

**Startup (lifespan):** Eagerly loads all 5 models in sequence, then runs a warmup pass (256x256 zero image through MediaPipe, 160x160 zero face through FaceNet). Any warmup failure is non-fatal.

**Middleware:** CORS (reads `CORS_ALLOWED_ORIGIN` env, falls back to localhost origins) + API key auth (skips `/api/health`; disabled when `AI_API_KEY` is empty).

**Endpoints:**

| Method | Path | Validation | Response |
|--------|------|-----------|----------|
| GET | `/api/health` | None (auth bypassed) | `{ ok, models: { deepfake, emotion, face_detection, identity, audio, text } }` |
| POST | `/api/analyze/frame` | frameB64 required, 4MB limit | `{ faces[], aggregated{ emotion, identity, deepfake, trustScore, confidenceLayers, temporal } }` |
| POST | `/api/analyze/audio` | audioB64 required, 4MB limit | `{ audio: { authenticityScore, riskLevel, model } }` |
| POST | `/api/analyze/text` | text required, 50KB limit | `{ behavioral: { signals[], highestScore, model } }` |
| POST | `/api/sessions/{id}/clear-identity` | session_id regex, max 64 chars | Clears identity baselines + temporal buffers |

All analysis endpoints use `run_in_threadpool()` so CPU-bound inference does not block the async event loop.

### Model Modules

#### `deepfake_model.py` -- EfficientNet-B4

| Property | Value |
|----------|-------|
| Architecture | EfficientNet-B4 backbone (ImageNet pretrained) + custom head: `Dropout(0.4) > Linear(1792, 1)` |
| Parameters | ~18.8M total (1,793 in custom head) |
| Input | BGR face crop -> RGB -> `Resize(380, 380)` -> ImageNet normalize -> `(1, 3, 380, 380)` |
| Output | `torch.sigmoid(logits)` -> P(fake); authenticity = `1 - P(fake)` |
| Risk thresholds | `> 0.85` low, `0.70-0.85` medium, `< 0.70` high |
| Thread safety | Double-checked locking singleton with `threading.Lock` |
| Fallback | Returns `None` if weights file missing (model disabled, not crash) |

#### `emotion_model.py` -- MobileNetV2

| Property | Value |
|----------|-------|
| Architecture | MobileNetV2 features -> `AdaptiveAvgPool2d(1,1)` -> `Flatten > Dropout(0.4) > Linear(1280, 256) > ReLU > Dropout(0.2) > Linear(256, 7)` |
| Parameters | ~2.8M (backbone 2.2M + head 328K) |
| Input | BGR face crop -> RGB -> `Resize(128, 128)` -> ImageNet normalize -> `(1, 3, 128, 128)` |
| Output | 7-class logits -> softmax -> merge disgust into angry -> re-normalize to 6 classes |
| Emotion classes | Happy, Neutral, Angry, Fear, Surprise, Sad |
| Fallback | Returns `label: "Neutral"`, all scores 0.0 |

#### `audio_model.py` -- AudioDeepfakeNet (AASIST-inspired)

| Property | Value |
|----------|-------|
| Architecture | `SincConv(70, k=251)` -> BN+LeakyReLU+MaxPool -> 4 ConvBlocks (70>128>128>256>256) -> Attention pooling (256-dim) -> `Linear(256, 128) > ReLU > Dropout(0.3) > Linear(128, 1)` -> sigmoid |
| SincConv | 70 learnable Mel-spaced bandpass filters, each 251 samples wide |
| Input | Base64 PCM16 -> int16 -> float32 / 32768 -> pad/truncate to 64,000 samples (4s @ 16kHz) -> `(1, 1, 64000)` |
| Output | P(spoof); authenticity = `1 - P(spoof)` |

#### `identity_tracker.py` -- FaceNet

| Property | Value |
|----------|-------|
| Architecture | InceptionResnetV1 (VGGFace2 pretrained, 99.65% LFW) |
| Input | RGB face crop -> resize to 160x160 -> `(x - 0.5) / 0.5` normalize -> `(1, 3, 160, 160)` |
| Output | 512-dim L2-normalized embedding |
| Tracking | Per-session, per-face baselines stored in memory. Cosine distance computed on each frame. Baseline updated via EMA (`alpha=0.1`). |
| Risk thresholds | shift `< 0.20` low, `0.20-0.40` medium, `> 0.40` high; `samePerson` when shift `< 0.25` |
| Eviction | Sessions idle > 1 hour evicted when session count > 50 |

#### `text_analyzer.py` -- DeBERTa-v3

| Property | Value |
|----------|-------|
| Model | `MoritzLaurer/deberta-v3-base-zeroshot-v2.0` (~700MB, auto-downloaded from HuggingFace) |
| Input | Transcript text (max 2000 chars) |
| Hypotheses | 5 behavioral patterns: urgency pressure, credential requests, authority impersonation, emotional manipulation, isolation tactics |
| Output | Per-hypothesis entailment scores. `>= 0.65` included in signals, `>= 0.80` severity "high" |
| Execution | `ThreadPoolExecutor(max_workers=2)` with 5s timeout per inference |

#### `temporal_analyzer.py` -- EWMA + Anomaly Detection

| Property | Value |
|----------|-------|
| Window | 15-frame sliding deque per session |
| EWMA | `decay=0.85`: `ewma_t = 0.85 * ewma_(t-1) + 0.15 * score_t` (activates after 3+ frames) |
| Trend | Requires 10+ frames; compares mean of first 5 vs last 5; delta > 0.05 = directional |
| Volatility | Standard deviation of trust scores in window |
| Anomalies | `sudden_trust_drop` (mean - current > 0.20, high), `identity_switch` (avg shift < 0.15 but current > 0.35, high), `emotion_instability` (5+ emotion changes in window, medium) |

### Inference Pipeline (`serve/inference.py`)

```
1. Validate sessionId (regex ^[a-zA-Z0-9_-]+$, max 64 chars)
2. Decode base64 JPEG --> BGR ndarray (reject >4MB, dimensions 10-4096px)
3. MediaPipe face detection (model_selection=0, confidence >= 0.4, 30% bbox padding)
     No face --> increment counter --> 5+ consecutive --> camera-off response
4. Per detected face:
     a. EfficientNet-B4 deepfake on original-resolution crop --> 380x380 --> authenticityScore
     b. MobileNetV2 emotion on 224x224 crop --> 128x128 --> label, confidence, scores
     c. FaceNet identity on 224x224 crop --> 160x160 --> embedding vs EMA baseline --> shift, samePerson
5. Trust score: 0.47 x video + 0.33 x (1 - shift) + 0.20 x (0.5 x (1 + emotion_conf))
6. Temporal smoothing: EWMA of last 15 frames replaces raw trust score after 3+ frames
     Anomaly detection: trust drop, identity switch, emotion instability
7. JSON response: { faces[], aggregated{ emotion, identity, deepfake, trustScore, confidenceLayers, temporal } }
```

**Thread safety:** MediaPipe detector is `threading.local` (one per OS thread). Identity tracker and temporal analyzer each have their own `threading.Lock`. Model singletons use double-checked locking.

### Training Scripts

| Script | Dataset | Architecture | Key Hyperparameters | Status | Best Result |
|--------|---------|-------------|---------------------|--------|-------------|
| `finetune_deepfake_labeled.py` | `Hemg/deepfake-and-real-images` (5K+5K) | EfficientNet-B4 full fine-tune | Backbone LR 3e-5, head LR 1e-3, freeze blocks 0-3, cosine annealing, early stop patience 8 | Complete | 92.33% val acc (epoch 14) |
| `train_audio_sincconv.py` | `Bisher/ASVspoof_2019_LA` | AudioDeepfakeNet from scratch | lr 1e-4, AdamW, 3-epoch warmup, cosine decay, TARGET_LENGTH=16000, NUM_WORKERS=0 | In progress | 54.8% val acc |
| `finetune_deepfake_head.py` | SBI self-blend on real faces | EfficientNet-B4 head-only | lr 3e-4, 20 epochs | Abandoned | 61% val acc |

### Configuration (`serve/config.py`)

Single source of truth for all thresholds, model paths, and input sizes:

| Category | Parameter | Value |
|----------|-----------|-------|
| **Input Sizes** | EfficientNet | 380px |
| | MobileNetV2 emotion | 128px |
| | FaceNet | 160px |
| | Face crop | 224px |
| **Detection** | Face confidence threshold | 0.4 |
| | Face padding | 30% |
| | Deepfake low/high risk | 0.85 / 0.70 |
| | Identity shift low/high | 0.20 / 0.40 |
| | Same person threshold | 0.25 |
| **Temporal** | Window size | 15 frames |
| | EWMA decay | 0.85 |
| | Trust drop threshold | 0.20 |
| | Smoothing min frames | 3 |
| **Audio** | Sample rate | 16 kHz |
| | Target length | 64,000 samples (4s) |
| **Text** | Alert threshold | 0.65 |
| | High severity | 0.80 |
| | Max text length | 2000 chars |
| | Inference timeout | 5s |
| **Trust Weights** | Video | 0.47 |
| | Identity | 0.33 |
| | Behavior | 0.20 |

---

## Database (Supabase PostgreSQL)

### Schema

```
profiles         --- 1:N --- sessions
  id (PK, FK auth.users)         id (UUID PK)
  username                       title
  full_name                      meeting_type (official|business|friends)
  job_title                      user_id (FK profiles)
  avatar_url                     meeting_url
  detection_settings (JSONB)     bot_status
  created_at                     created_at / ended_at
  updated_at                     metadata (JSONB)
                                    |
                     +--------------+------------------+--------------+
                     v              v                   v              v
              transcript_lines    alerts           suggestions   metrics_snapshots
                session_id (FK)    session_id (FK)   session_id    session_id
                text, speaker      severity, category               data (JSONB)
                is_final, ts       title, message, ts               ts
                confidence         confidence
                                   source_model
                                   recommendation
                                                           session_reports
                                                             session_id (FK)
                                                             summary (JSONB)

notification_reads
  user_id (FK), alert_id (FK, unique pair)
  read_at
```

All tables have Row Level Security (RLS) enabled. Users access only their own data. The backend uses a service role key that bypasses RLS.

**Auto-created profile:** A Postgres trigger (`on_auth_user_created`) inserts a `profiles` row when a user signs up.

---

## Cross-Service Communication

### WebSocket Ingest Protocol (Bot -> Backend)

| Message Type | Payload | Rate |
|-------------|---------|------|
| `frame` | `{ dataB64, capturedAt, width, height }` | Every 2s |
| `audio_pcm` | `{ dataB64, sampleRate: 16000, channels: 1 }` | Every 500ms |
| `caption` | `{ text, speaker, ts }` | Every 1s |
| `source_status` | `{ status, streams: { audio, video, captions } }` | On change |
| `start` | `{ meetingType }` | Once |
| `stop` | -- | Once |

### WebSocket Subscribe Protocol (Backend -> Frontend)

Connection flow: client connects -> server looks up session -> waits 10s for `{ type: "auth", token }` -> on success sends current metrics + bot status + participants.

| Message Type | Payload | Trigger |
|-------------|---------|---------|
| `metrics` | `{ sessionId, data: MetricsObject }` | Every 2s or after each frame analysis |
| `alert` | `{ alertId, severity, category, title, message, recommendation, ... }` | When fusion engine fires |
| `transcript` | `{ text, speaker, isFinal, confidence, ts }` | On transcript event |
| `participants` | `{ participants: [{ faceId, name, firstSeen }] }` | On participant update |
| `sourceStatus` | `{ status, streams }` | On bot status change |
| `suggestion` | `{ severity, title, message }` | When suggestion rules fire |
| `pong` | -- | Response to client `ping` |

### HTTP REST (Backend -> AI Service)

| Endpoint | Request | Response | Timeout |
|----------|---------|----------|---------|
| `POST /api/analyze/frame` | `{ sessionId, frameB64, capturedAt }` | `{ faces[], aggregated{} }` | 5s |
| `POST /api/analyze/audio` | `{ sessionId, audioB64, durationMs }` | `{ audio{ authenticityScore, riskLevel } }` | 5s |
| `POST /api/analyze/text` | `{ sessionId, text }` | `{ behavioral{ signals[], highestScore } }` | 5s |
| `GET /api/health` | -- | `{ models{ deepfake, emotion, identity, audio, text, face_detection } }` | 3s |

Backend sends `X-API-Key` header when `AI_API_KEY` is configured. On any failure, falls back to deterministic mock response.

---

## Environment Variables

### Frontend (`.env`)
| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous public key |
| `VITE_API_BASE_URL` | Backend HTTP base URL |
| `VITE_WS_BASE_URL` | Backend WebSocket base URL |
| `VITE_PROTOTYPE_MODE` | `"1"` bypasses auth entirely |

### Backend (`.env`)
| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (default 4000) |
| `ALLOWED_ORIGIN` | CORS whitelist (comma-separated) |
| `AI_SERVICE_URL` | AI service base URL (default `http://localhost:5100`) |
| `AI_API_KEY` | API key for AI service auth |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `REALSYNC_BOT_MODE` | `"real"` for Puppeteer, else stub |
| `REALSYNC_USE_GCP_STT` | `"1"` enables GCP Speech-to-Text |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` |

### AI Service (`.env`)
| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (default 5100) |
| `HOST` | Bind host (default `0.0.0.0`) |
| `AI_API_KEY` | API key for authentication (empty = auth disabled) |
| `CORS_ALLOWED_ORIGIN` | Allowed origins (comma-separated) |

---

## DevOps

### Docker

- **Frontend:** Not containerized (deployed to Cloudflare Pages via static build)
- **Backend:** Node.js with Puppeteer + Chromium (`Dockerfile` in `realsync-backend/`)
- **AI Service:** `python:3.11-slim` with OpenCV system deps, pre-downloads DeBERTa during build, runs as non-root user (`Dockerfile` in `RealSync-AI-Prototype/`)

### Orchestration (`start.sh`)

Starts all three services in parallel with signal handling:
1. AI service: `cd RealSync-AI-Prototype && python -m serve.app`
2. Backend: `cd realsync-backend && node index.js`
3. Frontend: `cd Front-End && npm run dev`

Trap on `SIGINT`/`SIGTERM` sends graceful shutdown to all processes.

---

## End-to-End Data Flow: Zoom Frame -> Frontend Alert

```
ZoomBotAdapter._startFrameCapture()
  page.screenshot({ jpeg, quality: 70, base64 }) every 2s
  --> onIngestMessage({ type: "frame", dataB64, width, height, capturedAt })

index.js: processIngestMessage() --> handleFrame(session, message)
  1. Guard: session ended? skip. Frame in-flight? skip.
  2. analyzeFrame() --> POST http://localhost:5100/api/analyze/frame
  3. Camera-off check --> special audio-only trust path
  4. session.metrics = result.aggregated
  5. evaluateVisual() per face (up to 6) --> alerts[]
  6. evaluateTemporal() --> anomaly alerts[]
  7. Trust recomputation (3-signal or 4-signal with audio)
  8. broadcastToSession({ type: "metrics", data }) to all subscribers
  9. For each alert: attach recommendation, persist, broadcast

Frontend WebSocketContext --> NotificationContext
  { type: "alert" } --> prepend to notifications[], toast, desktop notification
  { type: "metrics" } --> DashboardScreen re-renders all metric panels
```

**Parallel audio path:**
```
Bot audio capture (500ms chunks) --> processIngestMessage({ type: "audio_pcm" })
  --> session.stt.write(buffer) --> GCP STT --> fraud detection
  --> audioAnalysisBuffer.push() --> every 8 chunks (4s):
       analyzeAudio() --> POST /api/analyze/audio --> AASIST
       --> session.audioAuthenticityScore updated
       (next frame analysis uses this for 4-signal trust computation)
```

**Parallel transcript path:**
```
Bot caption scraping (1s) --> processIngestMessage({ type: "caption" })
  --> handleTranscript() --> persist, broadcast
  --> detectMeetingType() --> generateSuggestions()
  --> fraudDetector.evaluate() --> keyword alerts
  --> every 15s: analyzeText() --> DeBERTa NLI --> behavioral alerts
```

---

## Related Documentation

| Document | Coverage |
|----------|----------|
| `docs/FINAL_RELEASE_TECH_SPEC.md` | Architecture, API contracts, schema, deployment phases |
| `docs/AI_MODELS_REPORT.md` | Detailed model inventory and accuracy analysis |
| `AI_SERVICE_REPORT.md` | Latest AI model status with trust score formulas |
| `docs/DEPLOYMENT.md` | Step-by-step deployment for all 3 services |
| `docs/BRAND_IDENTITY.md` | Brand guide, colors, typography |
| `docs/DEVELOPMENT_LOG.md` | Development history and decisions |
| `contracts/` | Frozen JSON Schema definitions for all inter-service messages |
