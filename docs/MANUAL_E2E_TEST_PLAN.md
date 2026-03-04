# RealSync Manual E2E Verification Runbook

## Context

This is a **manual verification runbook** to confirm all RealSync components are running locally and functioning correctly before hands-on testing. It covers all 3 services, WebSocket connectivity, Supabase persistence, bot integration, and deepfake/fraud simulation scenarios.

**Architecture:**
- **Frontend** — React/Vite at `http://localhost:5173` (proxies `/api` and `/ws` to backend)
- **Backend** — Node.js/Express at `http://localhost:4000` (REST + WebSocket)
- **AI Service** — Python/FastAPI at `http://localhost:5100` (ML inference)

---

## Prerequisites

### Environment Variables

**AI Service** (`RealSync-AI-Prototype/.env`):
```env
PORT=5100
HOST=0.0.0.0
# AI_API_KEY=  (leave unset for dev — disables auth)
```

**Backend** (`realsync-backend/.env`):
```env
PORT=4000
ALLOWED_ORIGIN=http://localhost:3000,http://localhost:5173
AI_SERVICE_URL=http://localhost:5100
AI_TIMEOUT_MS=5000
# AI_API_KEY=  (must match AI service if set)
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_KEY=your-service-key
# REALSYNC_BOT_MODE=stub  (default; set to "real" for Puppeteer)
```

**Frontend** (`Front-End/.env`):
```env
VITE_API_BASE_URL=http://localhost:4000/api
VITE_WS_BASE_URL=ws://localhost:4000
VITE_PROTOTYPE_MODE=1
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Model Weights (AI Service)

Place in `RealSync-AI-Prototype/src/models/`:
| File | Model | Required? |
|------|-------|-----------|
| `efficientnet_b4_deepfake.pth` | Deepfake detection (EfficientNet-B4) | Optional — falls back to `riskLevel: "unknown"` |
| `emotion_weights.pth` | Emotion detection (MobileNetV2) | Optional — falls back to Neutral |
| `aasist_weights.pth` | Audio deepfake (AASIST) | Optional — falls back to `riskLevel: "unknown"` |
| FaceNet (InceptionResnetV1) | Identity tracking | Auto-downloaded from torchvision |

### Supabase (Optional for Prototype Mode)

If testing persistence, ensure these tables exist: `sessions`, `transcript_lines`, `alerts`, `suggestions`, `metrics_snapshots`, `session_reports`, `notification_reads`, `profiles`

---

## Step 1: Start All Services

### Option A: Orchestrated (Recommended)
```bash
cd /home/kali/RealSync
chmod +x start.sh
./start.sh
```
Starts AI (5100) → Backend (4000) → Frontend (5173) in order. Waits for health checks.

### Option B: Manual (3 terminals)

**Terminal 1 — AI Service:**
```bash
cd /home/kali/RealSync/RealSync-AI-Prototype
source .venv/bin/activate
python -m serve.app
```
Wait for: `Uvicorn running on http://0.0.0.0:5100`

**Terminal 2 — Backend:**
```bash
cd /home/kali/RealSync/realsync-backend
node index.js
```
Wait for: `Server running on port 4000`

**Terminal 3 — Frontend:**
```bash
cd /home/kali/RealSync/Front-End
npm run dev
```
Wait for: `Local: http://localhost:5173/`

### Verification
| Check | Command | Expected |
|-------|---------|----------|
| AI alive | `curl -s http://localhost:5100/api/health \| jq` | `{"ok": true, "models": {...}}` |
| Backend alive | `curl -s http://localhost:4000/api/health \| jq` | `{"ok": true, "checks": {"ai": "ok", ...}}` |
| Frontend alive | Open `http://localhost:5173` in browser | Page loads without errors |

**Pass criteria:** All 3 services respond. Backend health shows `ai: "ok"`.

---

## Step 2: AI Service API Tests

### 2.1 Health Endpoint
```bash
curl -s http://localhost:5100/api/health | jq
```
| Field | Expected |
|-------|----------|
| `ok` | `true` |
| `models.deepfake` | `"loaded"` or `"not_loaded"` |
| `models.emotion` | `"loaded"` or `"not_loaded"` |
| `models.audio_deepfake` | `"loaded"` or `"not_loaded"` |
| `models.face_recognition` | `"loaded"` or `"not_loaded"` |
| `models.text_analyzer` | `"loaded"` or `"not_loaded"` |

**Pass:** Response is 200 with all fields present.

### 2.2 Frame Analysis
```bash
# Generate a test JPEG (32x32 black image)
python3 -c "
import base64, numpy as np, cv2
img = np.zeros((256,256,3), dtype=np.uint8)
_, buf = cv2.imencode('.jpg', img)
print(base64.b64encode(buf).decode())
" > /tmp/test_frame.b64

# Send frame
curl -s -X POST http://localhost:5100/api/analyze/frame \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"manual-test-01\", \"frameB64\": \"$(cat /tmp/test_frame.b64)\"}" | jq
```
| Field | Expected |
|-------|----------|
| `sessionId` | `"manual-test-01"` |
| `faces` | `[]` (black image = no face) |
| `aggregated.noFaceDetected` | `true` |
| `aggregated.trustScore` | `0.0`–`1.0` |

**Pass:** 200, valid JSON, no crash.

### 2.3 Frame — Invalid Input
```bash
# Empty frameB64
curl -s -X POST http://localhost:5100/api/analyze/frame \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test", "frameB64": ""}' -w "\nHTTP %{http_code}\n"
```
**Pass:** HTTP 400.

```bash
# Empty sessionId
curl -s -X POST http://localhost:5100/api/analyze/frame \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "", "frameB64": "dGVzdA=="}' -w "\nHTTP %{http_code}\n"
```
**Pass:** HTTP 400.

### 2.4 Audio Analysis
```bash
# Generate 4 seconds of silence (64000 PCM16 samples)
python3 -c "
import base64, struct
pcm = struct.pack('<64000h', *([0]*64000))
print(base64.b64encode(pcm).decode())
" > /tmp/test_audio.b64

curl -s -X POST http://localhost:5100/api/analyze/audio \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"manual-test-01\", \"audioB64\": \"$(cat /tmp/test_audio.b64)\"}" | jq
```
| Field | Expected |
|-------|----------|
| `sessionId` | `"manual-test-01"` |
| `audio.authenticityScore` | `0.0`–`1.0` or `null` |
| `audio.riskLevel` | `"low"`, `"medium"`, `"high"`, or `"unknown"` |

**Pass:** 200, valid response structure.

### 2.5 Audio — Empty Input
```bash
curl -s -X POST http://localhost:5100/api/analyze/audio \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test", "audioB64": ""}' -w "\nHTTP %{http_code}\n"
```
**Pass:** HTTP 400.

### 2.6 Text Analysis — Suspicious
```bash
curl -s -X POST http://localhost:5100/api/analyze/text \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "manual-test-01", "text": "Send me your verification code immediately, this is urgent and confidential."}' | jq
```
| Field | Expected |
|-------|----------|
| `behavioral.signals` | Non-empty array with scores |
| `behavioral.highestScore` | `> 0.0` |
| Signal categories | `"credential_theft"`, `"social_engineering"`, etc. |

**Pass:** 200, at least one signal detected.

### 2.7 Text Analysis — Benign
```bash
curl -s -X POST http://localhost:5100/api/analyze/text \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "manual-test-01", "text": "Let us discuss the project timeline for next quarter."}' | jq
```
**Pass:** 200, signals empty or all scores low (< 0.65).

### 2.8 Text — Empty / Oversized
```bash
# Empty text → 400
curl -s -X POST http://localhost:5100/api/analyze/text \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test", "text": ""}' -w "\nHTTP %{http_code}\n"

# Oversized text (>50KB) → 413
python3 -c "print('A'*60000)" | xargs -I{} curl -s -X POST http://localhost:5100/api/analyze/text \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"test\", \"text\": \"{}\"}" -w "\nHTTP %{http_code}\n"
```
**Pass:** 400 for empty, 413 for oversized.

### 2.9 Clear Identity
```bash
# Valid clear
curl -s -X POST http://localhost:5100/api/sessions/manual-test-01/clear-identity | jq

# Path traversal → 400
curl -s -X POST "http://localhost:5100/api/sessions/..%2F..%2Fetc/clear-identity" -w "\nHTTP %{http_code}\n"
```
**Pass:** 200 `{"ok": true}` for valid; 400 for path traversal.

---

## Step 3: Backend API Tests

### 3.1 Health
```bash
curl -s http://localhost:4000/api/health | jq
```
**Pass:** `{"ok": true, "checks": {"ai": "ok"|"unavailable", "supabase": "ok"|"unavailable"}}`

### 3.2 Create Session
```bash
curl -s -X POST http://localhost:4000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "Manual Test Session", "meetingType": "business"}' | jq
```
| Field | Expected |
|-------|----------|
| `sessionId` | UUID string |
| `title` | `"Manual Test Session"` |
| `meetingType` | `"business"` |

**Save the sessionId** for subsequent tests:
```bash
export SID="<paste-session-id-here>"
```

### 3.3 Create Session — Validation
```bash
# Missing title → 400
curl -s -X POST http://localhost:4000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"meetingType": "business"}' -w "\nHTTP %{http_code}\n"

# Invalid meetingType → 400
curl -s -X POST http://localhost:4000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "meetingType": "invalid_type"}' -w "\nHTTP %{http_code}\n"
```
**Pass:** Both return 400.

### 3.4 List Sessions
```bash
curl -s http://localhost:4000/api/sessions | jq
```
**Pass:** Array containing the session created in 3.2.

### 3.5 Get Session Metrics
```bash
curl -s http://localhost:4000/api/sessions/$SID/metrics | jq
```
**Pass:** 200, metrics object with `trustScore`, `deepfake`, `identity`, `emotion` fields.

### 3.6 Get Alerts
```bash
curl -s http://localhost:4000/api/sessions/$SID/alerts | jq
```
**Pass:** 200, array (may be empty initially).

### 3.7 Get Transcript
```bash
curl -s http://localhost:4000/api/sessions/$SID/transcript | jq
```
**Pass:** 200, array (may be empty initially).

### 3.8 Bot — Start (Stub Mode)
```bash
curl -s -X POST http://localhost:4000/api/sessions/$SID/join \
  -H "Content-Type: application/json" \
  -d '{"meetingUrl": "https://us05web.zoom.us/j/12345678901"}' | jq
```
| Field | Expected |
|-------|----------|
| `status` | `"joining"` |
| `botId` | UUID string |

**Pass:** 200, bot starts in stub mode (simulated frames/captions).

### 3.9 Bot — Invalid URL
```bash
# Non-Zoom URL → 400
curl -s -X POST http://localhost:4000/api/sessions/$SID/join \
  -H "Content-Type: application/json" \
  -d '{"meetingUrl": "https://evil.com/meeting"}' -w "\nHTTP %{http_code}\n"

# HTTP (not HTTPS) → 400
curl -s -X POST http://localhost:4000/api/sessions/$SID/join \
  -H "Content-Type: application/json" \
  -d '{"meetingUrl": "http://zoom.us/j/123"}' -w "\nHTTP %{http_code}\n"
```
**Pass:** Both return 400.

### 3.10 Bot — Status
```bash
curl -s http://localhost:4000/api/sessions/$SID/bot-status | jq
```
**Pass:** Shows `status: "connected"` or `"joining"` with streams info.

### 3.11 Bot — Leave
```bash
curl -s -X POST http://localhost:4000/api/sessions/$SID/leave | jq
```
**Pass:** `{"ok": true}`, bot stops.

### 3.12 Settings
```bash
# Get defaults
curl -s http://localhost:4000/api/settings | jq

# Update a setting
curl -s -X PATCH http://localhost:4000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"facialAnalysis": false}' | jq

# Verify update
curl -s http://localhost:4000/api/settings | jq

# Reset
curl -s -X PATCH http://localhost:4000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"facialAnalysis": true}' | jq

# Invalid key → 400
curl -s -X PATCH http://localhost:4000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"unknownSetting": true}' -w "\nHTTP %{http_code}\n"
```
**Pass:** Defaults are `{facialAnalysis: true, voicePattern: true, emotionDetection: true}`. PATCH updates persist. Unknown key returns 400.

### 3.13 Stop Session
```bash
curl -s -X POST http://localhost:4000/api/sessions/$SID/stop | jq
```
**Pass:** `{"ok": true, "endedAt": "ISO timestamp"}`.

### 3.14 Session Report
```bash
curl -s http://localhost:4000/api/sessions/$SID/report | jq
```
**Pass:** Report object with severity breakdown, alert counts, and transcript summary.

### 3.15 Rate Limiting
```bash
# Send 101 rapid requests to health
for i in $(seq 1 105); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/health)
  if [ "$code" = "429" ]; then echo "Rate limited at request $i"; break; fi
done
```
**Pass:** Rate limited around request 101 (100/minute global limit).

---

## Step 4: WebSocket Tests

### 4.1 Subscribe WebSocket
Create a new session first:
```bash
SID2=$(curl -s -X POST http://localhost:4000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "WS Test", "meetingType": "business"}' | jq -r '.sessionId')
echo "Session: $SID2"
```

Connect with wscat (install: `npm i -g wscat`):
```bash
wscat -c "ws://localhost:4000/ws?sessionId=$SID2"
```

| Test | Action | Expected |
|------|--------|----------|
| Initial metrics | Connect | Receive `{"type":"metrics",...}` |
| Ping/pong | Send `{"type":"ping"}` | Receive `{"type":"pong"}` |
| Invalid JSON | Send `not json` | No crash, connection stays open |

**Pass:** Initial metrics received, ping/pong works.

### 4.2 Ingest WebSocket + Live Updates
Open **two terminals**:

**Terminal A — Subscribe:**
```bash
wscat -c "ws://localhost:4000/ws?sessionId=$SID2"
```

**Terminal B — Ingest (simulate bot):**
```bash
wscat -c "ws://localhost:4000/ws/ingest?sessionId=$SID2"
```

Then in Terminal B, send a caption:
```json
{"type":"caption","text":"Hello, this is a test caption","speaker":"Alice","isFinal":true}
```

| Check | Expected |
|-------|----------|
| Terminal A | Receives `{"type":"transcript",...}` with the caption |
| Backend log | Shows caption processing |

Send a frame (use the base64 from Step 2.2):
```json
{"type":"frame","dataB64":"<paste-base64-here>"}
```

| Check | Expected |
|-------|----------|
| Terminal A | Receives `{"type":"metrics",...}` update |

**Pass:** Subscribe socket receives real-time updates from ingest socket.

### 4.3 Bot-Driven WebSocket (Stub Mode)
```bash
# Start bot on the WS test session
curl -s -X POST http://localhost:4000/api/sessions/$SID2/join \
  -H "Content-Type: application/json" \
  -d '{"meetingUrl": "https://us05web.zoom.us/j/12345678901"}' | jq
```

In Terminal A (still connected to subscribe WS), observe:
| Expected messages | Timing |
|-------------------|--------|
| `source_status` (joining → connected) | ~2s |
| `metrics` updates | Every ~2s (stub frames) |
| `transcript` updates | Every ~5s (stub captions) |
| `participants` update | After connection |

**Pass:** Dashboard would show live-updating metrics, transcript lines, and participant list.

```bash
# Stop bot
curl -s -X POST http://localhost:4000/api/sessions/$SID2/leave | jq
```

---

## Step 5: Frontend Tests (Browser)

### 5.1 Page Load
Open `http://localhost:5173` in browser.

| Check | Expected |
|-------|----------|
| Page renders | No white screen, no console errors |
| Prototype mode | Dashboard accessible without login (if `VITE_PROTOTYPE_MODE=1`) |
| Navigation | Sessions, Dashboard, Reports tabs visible in sidebar/top bar |

### 5.2 Create Session (UI)
1. Click **"New Session"** button
2. Fill in: Title = `"Browser Test"`, Meeting Type = `"business"`, Zoom URL = `https://us05web.zoom.us/j/12345678901`
3. Click **Create** / **Start**

| Check | Expected |
|-------|----------|
| Session created | Redirects to Dashboard |
| Session appears in list | Sessions page shows "Browser Test" |
| Bot starts | Status indicator shows "Joining" → "Connected" |

### 5.3 Real-Time Dashboard
With session active and bot running (stub mode):

| Check | Expected | Timing |
|-------|----------|--------|
| Trust Score | Gauge/number displays 0.0–1.0 | Updates every ~2s |
| Deepfake Risk | Risk badge (low/medium/high/unknown) | Updates with frames |
| Emotion | Current emotion label displayed | Updates with frames |
| Identity | Embedding shift / same person indicator | Updates with frames |
| Transcript | Live captions appearing | Every ~5s |
| Participants | Participant cards/names | After bot connects |
| Alerts | Alert cards appear if thresholds crossed | When triggered |

### 5.4 Alert Display
If alerts are generated (from deepfake detection, identity shifts, or fraud text), verify:
- Alert card shows severity color (green/yellow/orange/red)
- Alert title and message are readable
- Toast notification appears
- Desktop notification appears (if permitted and tab is hidden)

### 5.5 WebSocket Reconnection
1. Kill the backend process (Ctrl+C in Terminal 2)
2. Observe frontend: should show "Disconnected" or similar indicator
3. Restart backend: `cd realsync-backend && node index.js`
4. Frontend should auto-reconnect within 1–30 seconds (exponential backoff)

**Pass:** Frontend recovers without page refresh.

### 5.6 End Session
1. Click **"End Session"** button on Dashboard
2. Navigate to **Reports** page

| Check | Expected |
|-------|----------|
| Session ends | Dashboard shows ended state |
| Report available | Reports page lists the session |
| Report content | Severity breakdown, alert counts, transcript excerpt |

### 5.7 PDF Export
1. On Reports page, select a completed session
2. Click **"Download PDF"** or **"Export"** button

**Pass:** PDF downloads with header, severity table, and transcript excerpt.

### 5.8 Settings Page
1. Navigate to **Settings**
2. Toggle facial analysis OFF
3. Verify toggle persists on page reload
4. Toggle back ON

**Pass:** Settings persist across reloads.

---

## Step 6: Deepfake / Fraud Simulation

### 6.1 Simulated Deepfake Alert
Create a session and inject metrics via WS ingest that simulate a deepfake:

```bash
# Create session
SID3=$(curl -s -X POST http://localhost:4000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "Deepfake Sim", "meetingType": "official"}' | jq -r '.sessionId')

# Open subscribe WS in another terminal to watch
# wscat -c "ws://localhost:4000/ws?sessionId=$SID3"

# Connect ingest and send a frame with face (use a real face image for detection)
# With stub bot, the system generates synthetic data automatically
curl -s -X POST http://localhost:4000/api/sessions/$SID3/join \
  -H "Content-Type: application/json" \
  -d '{"meetingUrl": "https://us05web.zoom.us/j/99999999999"}' | jq
```

Monitor the subscribe WebSocket for alerts with:
- `category: "deepfake"` — if authenticityScore < 0.70
- `severity: "high"` or `"critical"`

**Note:** Stub bot uses random/synthetic data. To trigger specific thresholds, you may need to send custom frames via the ingest WebSocket or directly call the AI service.

### 6.2 Fraud Text Injection
Via ingest WebSocket, send captions containing fraud keywords:

```json
{"type":"caption","text":"I need you to wire transfer the money to this account immediately","speaker":"Suspicious Person","isFinal":true}
```

Wait 2-3 seconds, then send more:
```json
{"type":"caption","text":"Share your verification code with me right now, this is the CEO speaking","speaker":"Suspicious Person","isFinal":true}
```

| Check | Expected |
|-------|----------|
| Subscribe WS | Receives `type: "alert"` with `category: "fraud"` or `"scam"` |
| Alert severity | `"high"` or `"critical"` |
| Dashboard (if open) | Alert card appears |

### 6.3 Multi-Signal Escalation
If both deepfake risk is elevated AND fraud text is detected, the backend's alert fusion should escalate severity. Watch for:
- Transcript fraud alert escalated to `"critical"` when `deepfakeRisk` is also `"medium"` or higher
- Alert message mentions combined signals

### 6.4 Identity Shift Simulation
Send frames from different "people" to the same session to trigger identity shift alerts:
- First set of frames establishes baseline
- Subsequent frames with very different facial features trigger `embeddingShift > 0.40`
- Alert with `category: "identity"` should appear

---

## Step 7: Supabase Persistence (if configured)

Skip this section if running in prototype mode without Supabase.

### 7.1 Session Persistence
After creating a session via API:
```sql
-- In Supabase SQL editor or psql
SELECT id, title, meeting_type, created_at FROM sessions ORDER BY created_at DESC LIMIT 5;
```
**Pass:** Session row exists with correct title and type.

### 7.2 Alert Persistence
After alerts are generated:
```sql
SELECT id, session_id, severity, category, title, created_at FROM alerts WHERE session_id = '<SID>' ORDER BY created_at DESC;
```
**Pass:** Alert rows exist matching what was shown on dashboard.

### 7.3 Transcript Persistence
After captions flow through:
```sql
SELECT id, session_id, speaker, text, is_final FROM transcript_lines WHERE session_id = '<SID>' ORDER BY created_at DESC LIMIT 10;
```
**Pass:** Transcript lines exist with correct speaker and text.

### 7.4 Report Persistence
After ending a session:
```sql
SELECT session_id, summary FROM session_reports WHERE session_id = '<SID>';
```
**Pass:** Report summary JSON saved.

### 7.5 Rehydration Test
1. Create and use a session
2. Restart the backend (`Ctrl+C` then `node index.js`)
3. Access the session via API: `curl http://localhost:4000/api/sessions/<SID>/metrics`

**Pass:** Session is rehydrated from Supabase — metrics accessible after restart.

---

## Step 8: Real Zoom Meeting E2E (Optional)

Requires `REALSYNC_BOT_MODE=real` in backend `.env` and Chromium installed.

### 8.1 Join Real Meeting
1. Create a Zoom meeting (or use a test meeting link)
2. Create a session and join:
```bash
curl -s -X POST http://localhost:4000/api/sessions/$SID/join \
  -H "Content-Type: application/json" \
  -d '{"meetingUrl": "https://us05web.zoom.us/j/<your-meeting-id>"}' | jq
```

### 8.2 Verify Bot in Meeting
| Check | Expected |
|-------|----------|
| Bot status | `"connected"` with `video: true, audio: true, captions: true` |
| Dashboard | Live metrics updating from real video frames |
| Transcript | Real captions from meeting audio |
| Participants | Real participant names |

### 8.3 Leave Meeting
```bash
curl -s -X POST http://localhost:4000/api/sessions/$SID/leave | jq
```
**Pass:** Bot leaves Zoom, browser closes, status → `"disconnected"`.

---

## Step 9: Failure Recovery Tests

### 9.1 AI Service Down
1. Stop AI service
2. Create session and start bot
3. Backend should use mock/fallback responses
4. Dashboard shows metrics (possibly with `riskLevel: "unknown"`)

**Pass:** No crashes, graceful degradation.

### 9.2 Supabase Down (if configured)
1. Set invalid `SUPABASE_URL`, restart backend
2. All operations should work in-memory
3. Persistence calls return `{ok: true, stub: true}`

**Pass:** App functions without Supabase.

### 9.3 Frontend WS Reconnection
1. With dashboard open, kill backend
2. Wait 5s, restart backend
3. Frontend reconnects automatically

**Pass:** Metrics resume without page refresh.

---

## Summary — Pass/Fail Checklist

| # | Test Area | Key Checks | Pass? |
|---|-----------|------------|-------|
| 1 | **Service Startup** | All 3 services start, health checks pass | |
| 2 | **AI — Frame** | Valid frame → faces/metrics; Invalid → 400 | |
| 3 | **AI — Audio** | Valid PCM16 → score; Empty → 400; Oversized → 413 | |
| 4 | **AI — Text** | Suspicious → signals; Benign → low; Empty → 400 | |
| 5 | **AI — Clear Identity** | Valid → ok; Path traversal → 400 | |
| 6 | **Backend — Sessions** | Create/list/stop/report; Validation rejects bad input | |
| 7 | **Backend — Bot** | Start (stub)/status/leave; Invalid URL → 400 | |
| 8 | **Backend — Settings** | Get/patch/validate; Unknown key → 400 | |
| 9 | **Backend — Rate Limits** | 100/min global enforced | |
| 10 | **WebSocket — Subscribe** | Initial metrics, ping/pong, live updates | |
| 11 | **WebSocket — Ingest** | Captions + frames propagate to subscribers | |
| 12 | **Frontend — Page Load** | No errors, prototype mode works | |
| 13 | **Frontend — Session Flow** | Create → Dashboard → End → Report | |
| 14 | **Frontend — Real-Time** | Trust score, emotion, transcript update live | |
| 15 | **Frontend — WS Reconnect** | Auto-recovers after backend restart | |
| 16 | **Frontend — PDF Export** | PDF downloads with content | |
| 17 | **Deepfake Simulation** | Alerts generated for low authenticity | |
| 18 | **Fraud Text** | Fraud keywords trigger alerts via WS | |
| 19 | **Supabase Persistence** | Sessions/alerts/transcript in DB (if configured) | |
| 20 | **Failure Recovery** | AI down → fallback; WS reconnect → auto | |

---

## Quick Reference — Key curl Commands

```bash
# Health checks
curl -s http://localhost:5100/api/health | jq
curl -s http://localhost:4000/api/health | jq

# Create session
curl -s -X POST http://localhost:4000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","meetingType":"business"}' | jq

# Start bot
curl -s -X POST http://localhost:4000/api/sessions/$SID/join \
  -H "Content-Type: application/json" \
  -d '{"meetingUrl":"https://us05web.zoom.us/j/12345678901"}' | jq

# Get metrics / alerts / transcript
curl -s http://localhost:4000/api/sessions/$SID/metrics | jq
curl -s http://localhost:4000/api/sessions/$SID/alerts | jq
curl -s http://localhost:4000/api/sessions/$SID/transcript | jq

# Stop session + report
curl -s -X POST http://localhost:4000/api/sessions/$SID/stop | jq
curl -s http://localhost:4000/api/sessions/$SID/report | jq

# WebSocket (install wscat: npm i -g wscat)
wscat -c "ws://localhost:4000/ws?sessionId=$SID"
wscat -c "ws://localhost:4000/ws/ingest?sessionId=$SID"
```
