# RealSync Final Release — Technical Specification

> Generated: 2026-02-06
> Base branch: `prototype_final`
> Owner: Ahmed Sarhan

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Service Boundaries](#2-service-boundaries)
3. [Contracts & Schemas](#3-contracts--schemas)
4. [Zoom Bot Adapter (Participant Media Ingestion)](#4-zoom-bot-adapter-participant-media-ingestion)
5. [AI Inference Service](#5-ai-inference-service)
6. [Backend Pipeline Changes](#6-backend-pipeline-changes)
7. [Fraud / Scam Detection Module](#7-fraud--scam-detection-module)
8. [Real-Time Alert System](#8-real-time-alert-system)
9. [Meeting Type Detection (Enhanced)](#9-meeting-type-detection-enhanced)
10. [Supabase Persistence Layer](#10-supabase-persistence-layer)
11. [Frontend Changes](#11-frontend-changes)
12. [Default Risk Thresholds](#12-default-risk-thresholds)
13. [Implementation Phases](#13-implementation-phases)
14. [Test Plan](#14-test-plan)
15. [Deployment Plan](#15-deployment-plan)

---

## 1. System Overview

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              RealSync System                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────┐     ┌────────────────────┐     ┌─────────────────────┐  │
│  │  Zoom Meeting   │────▶│  Zoom Bot Adapter   │────▶│  Backend (Node.js)  │  │
│  │  (Participants) │     │  (Puppeteer/headless)│     │  :4000              │  │
│  └────────────────┘     └────────────────────┘     └──────┬──────────────┘  │
│                              Streams:                       │                 │
│                              - Audio (PCM16)                │ WS /ws/ingest   │
│                              - Video frames (JPEG)          │                 │
│                              - Transcript (captions)        │                 │
│                                                             ▼                 │
│                                                    ┌────────────────────┐    │
│                                                    │   Pipeline Router   │    │
│                                                    └──┬──────┬──────┬──┘    │
│                                                       │      │      │        │
│                                        ┌──────────────┘      │      └───┐    │
│                                        ▼                     ▼          ▼    │
│                              ┌──────────────┐  ┌──────────────┐ ┌────────┐  │
│                              │ AI Inference  │  │  Transcript   │ │ Fraud  │  │
│                              │ Service (Py)  │  │  Analyzer     │ │ Detect │  │
│                              │ :5100         │  │  (STT + NLP)  │ │ Module │  │
│                              └──────┬───────┘  └──────┬───────┘ └───┬────┘  │
│                                     │                  │             │        │
│                                     └──────┬───────────┴─────────────┘        │
│                                            ▼                                  │
│                                    ┌────────────────┐                        │
│                                    │  Alert Fusion   │                        │
│                                    │  Engine         │                        │
│                                    └───────┬────────┘                        │
│                                            │                                  │
│                              ┌─────────────┼─────────────┐                   │
│                              ▼             ▼             ▼                   │
│                        ┌──────────┐ ┌───────────┐ ┌──────────────┐          │
│                        │ WS /ws   │ │ Supabase  │ │ Frontend     │          │
│                        │ Broadcast│ │ Postgres  │ │ Dashboard    │          │
│                        └──────────┘ └───────────┘ │ :3000        │          │
│                                                    └──────────────┘          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

1. **Zoom Bot Adapter** joins meeting as a headless participant via Puppeteer.
2. Bot captures participant **audio** (system audio, not operator mic), **video frames** (screen capture of meeting gallery), and **captions** (Zoom's built-in CC).
3. Bot streams data to backend ingest WebSocket (`/ws/ingest`).
4. Backend fans out to three pipelines:
   - **AI Inference Service** (Python :5100) — emotion, identity, deepfake analysis on frames.
   - **Transcript Analyzer** — STT + keyword/fraud scoring on audio & captions.
   - **Fraud Detection Module** — NLP-based suspicious phrase/context detection.
5. **Alert Fusion Engine** combines signals and emits unified events.
6. Events broadcast to frontend over `/ws` and persisted to Supabase.

---

## 2. Service Boundaries

| Service | Language | Port | Responsibility |
|---------|----------|------|----------------|
| **Frontend** | React/TS | 3000 | UI, alerts, transcript, reports |
| **Backend** | Node.js | 4000 | Session management, WS routing, alert fusion, persistence |
| **AI Inference** | Python | 5100 | Frame analysis (emotion, identity, deepfake) |
| **Zoom Bot Adapter** | Node.js | — | Joins meeting, captures & streams participant media |
| **Supabase** | Postgres | — | Persistent storage for sessions, transcripts, alerts, reports |

### Inter-Service Communication

| From | To | Protocol | Format |
|------|----|----------|--------|
| Zoom Bot → Backend | WS `/ws/ingest` | WebSocket | JSON messages (see §3) |
| Backend → AI Inference | HTTP POST | REST | JSON request/response (see §3) |
| Backend → Frontend | WS `/ws` | WebSocket | JSON events (see §3) |
| Backend → Supabase | TCP | Supabase JS client | SQL via REST/Realtime |

---

## 3. Contracts & Schemas

All contracts live in `contracts/` at the repo root for team reference.

### 3.1 Ingest Messages (Bot → Backend, via WS `/ws/ingest`)

```jsonc
// Start session ingestion
{ "type": "start", "sessionId": "<uuid>", "meetingType": "official|business|friends" }

// Stop session ingestion
{ "type": "stop" }

// Audio chunk (PCM16, 16kHz, mono, base64)
{
  "type": "audio_pcm",
  "sampleRate": 16000,
  "channels": 1,
  "dataB64": "<base64-encoded PCM16 bytes>",
  "sourceParticipant": "participant-name|unknown"
}

// Video frame (JPEG, base64)
{
  "type": "frame",
  "dataB64": "<base64-encoded JPEG bytes>",
  "width": 1280,
  "height": 720,
  "capturedAt": "<ISO-8601>"
}

// Captions from Zoom CC
{
  "type": "caption",
  "text": "string",
  "speaker": "participant-name|unknown",
  "ts": "<ISO-8601>"
}

// Source health heartbeat
{
  "type": "source_status",
  "status": "connected|degraded|disconnected",
  "streams": { "audio": true, "video": true, "captions": true },
  "ts": "<ISO-8601>"
}
```

### 3.2 AI Inference Service API

#### POST `/api/analyze/frame`

**Request:**
```json
{
  "sessionId": "<uuid>",
  "frameB64": "<base64-encoded JPEG>",
  "capturedAt": "<ISO-8601>"
}
```

**Response:**
```json
{
  "sessionId": "<uuid>",
  "capturedAt": "<ISO-8601>",
  "processedAt": "<ISO-8601>",
  "faces": [
    {
      "faceId": 0,
      "bbox": { "x": 100, "y": 50, "w": 200, "h": 200 },
      "confidence": 0.92,
      "emotion": {
        "label": "Happy",
        "confidence": 0.85,
        "scores": {
          "Happy": 0.85, "Neutral": 0.08, "Angry": 0.02,
          "Fear": 0.01, "Surprise": 0.03, "Sad": 0.01
        }
      },
      "identity": {
        "embeddingVector": [0.12, -0.34, ...],
        "embeddingShift": 0.08,
        "samePerson": true,
        "riskLevel": "low"
      },
      "deepfake": {
        "authenticityScore": 0.94,
        "riskLevel": "low",
        "model": "MesoNet-4"
      }
    }
  ],
  "aggregated": {
    "emotion": { "label": "Happy", "confidence": 0.85, "scores": { ... } },
    "identity": { "samePerson": true, "embeddingShift": 0.08, "riskLevel": "low" },
    "deepfake": { "authenticityScore": 0.94, "riskLevel": "low", "model": "MesoNet-4" },
    "trustScore": 0.91,
    "confidenceLayers": { "audio": 0.0, "video": 0.94, "behavior": 0.85 }
  }
}
```

#### GET `/api/health`

```json
{ "ok": true, "models": { "emotion": "loaded", "deepfake": "loaded", "identity": "loaded" } }
```

### 3.3 Subscribe Events (Backend → Frontend, via WS `/ws`)

```jsonc
// Metrics update
{
  "sessionId": "<uuid>",
  "type": "metrics",
  "data": {
    "timestamp": "<ISO-8601>",
    "source": "external",
    "emotion": { "label": "Happy", "confidence": 0.85, "scores": { ... } },
    "identity": { "samePerson": true, "embeddingShift": 0.08, "riskLevel": "low" },
    "deepfake": { "authenticityScore": 0.94, "model": "MesoNet-4", "riskLevel": "low" },
    "trustScore": 0.91,
    "confidenceLayers": { "audio": 0.90, "video": 0.94, "behavior": 0.85 }
  }
}

// Transcript event
{
  "sessionId": "<uuid>",
  "type": "transcript",
  "text": "string",
  "speaker": "participant-name|unknown",
  "isFinal": true,
  "confidence": 0.95,
  "ts": "<ISO-8601>"
}

// Alert (critical notification — new event type)
{
  "sessionId": "<uuid>",
  "type": "alert",
  "alertId": "<uuid>",
  "severity": "low|medium|high|critical",
  "category": "deepfake|identity|emotion|fraud|scam|altercation",
  "title": "string",
  "message": "string",
  "source": { "model": "string", "confidence": 0.0 },
  "ts": "<ISO-8601>"
}

// Suggestion (non-critical guidance — existing)
{
  "sessionId": "<uuid>",
  "type": "suggestion",
  "severity": "low|medium|high",
  "title": "string",
  "message": "string",
  "ts": "<ISO-8601>"
}

// Source status (bot health — new event type)
{
  "sessionId": "<uuid>",
  "type": "sourceStatus",
  "status": "connected|degraded|disconnected",
  "streams": { "audio": true, "video": true, "captions": true },
  "ts": "<ISO-8601>"
}
```

### 3.4 REST API Changes (Backend)

**New endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sessions/:id/join` | Trigger bot to join a Zoom meeting |
| POST | `/api/sessions/:id/leave` | Trigger bot to leave meeting |
| GET | `/api/sessions/:id/alerts` | Get all alerts for a session |
| GET | `/api/sessions/:id/transcript` | Get full transcript for a session |
| GET | `/api/sessions/:id/report` | Get session report (aggregate) |

**POST `/api/sessions/:id/join`**
```json
// Request
{
  "meetingUrl": "https://zoom.us/j/123456789?pwd=abc",
  "displayName": "RealSync Bot"
}

// Response
{ "status": "joining", "botId": "<uuid>", "sessionId": "<uuid>" }
```

---

## 4. Zoom Bot Adapter (Participant Media Ingestion)

### Approach: Headless Browser Bot

The bot joins Zoom meetings as a participant using Puppeteer to control a headless Chromium browser. It captures participant audio/video via the Zoom Web Client.

### Directory

```
realsync-backend/
  bot/
    ZoomBotAdapter.js       # Main adapter class
    captureAudio.js         # System audio capture via Pulseaudio/virtual sink
    captureFrames.js        # Screenshot-based frame extraction
    captureCaptions.js      # DOM scraping for Zoom CC text
    botManager.js           # Lifecycle management (spawn, health, teardown)
```

### Capture Strategy

| Stream | Method | Rate | Format |
|--------|--------|------|--------|
| **Audio** | Virtual audio sink (PulseAudio/BlackHole) capturing system output | Continuous, 16kHz mono | PCM16 base64 chunks |
| **Video** | Puppeteer `page.screenshot()` of gallery view | 1-2 FPS | JPEG base64 |
| **Captions** | DOM observer on Zoom web client CC overlay | As available | Text + speaker name |

### Bot Lifecycle

```
1. POST /api/sessions/:id/join  { meetingUrl, displayName }
2. botManager spawns Puppeteer instance
3. Browser navigates to meetingUrl (Zoom Web Client)
4. Bot accepts prompts, joins meeting
5. captureAudio starts virtual audio sink → sends audio_pcm to /ws/ingest
6. captureFrames starts screenshot loop → sends frame to /ws/ingest
7. captureCaptions attaches MutationObserver → sends caption to /ws/ingest
8. source_status heartbeats every 5s
9. POST /api/sessions/:id/leave → bot leaves meeting, cleans up
```

### Limitations & Mitigations

| Limitation | Mitigation |
|------------|------------|
| Zoom may detect bot/automation | Use realistic viewport, user-agent, join delays |
| Audio capture needs system-level audio routing | Use PulseAudio (Linux) or BlackHole (macOS) |
| Screenshot FPS is limited | 1-2 FPS is sufficient for face analysis |
| Zoom Web Client may change DOM structure | Use resilient selectors, test on updates |

---

## 5. AI Inference Service

### Overview

A Python FastAPI service that receives video frames and returns per-face analysis results. Wraps the existing AI prototype models.

### Directory

```
RealSync-AI-Prototype/
  serve/
    app.py                  # FastAPI server (port 5100)
    inference.py            # Frame → analysis pipeline
    identity_tracker.py     # Per-session face embedding tracker
    config.py               # Thresholds, model paths
  src/
    video_model.py          # MesoNet-4 (existing)
    emotion_model.py        # FER (existing)
    face_detection.py       # MediaPipe (existing)
```

### Frame Analysis Pipeline

```
1. Receive frame (JPEG base64) via POST /api/analyze/frame
2. Decode JPEG → numpy array
3. face_detection.detect_faces_in_frame(frame) → list of face crops
4. For each face:
   a. video_model.predict(face) → deepfake score
   b. emotion_model.predict(face) → emotion dict
   c. identity_tracker.compute_embedding(face) → embedding vector
   d. identity_tracker.compare_to_baseline(session_id, face_id, embedding) → drift
5. Aggregate per-face results into session-level metrics
6. Return response (see §3.2)
```

### Identity Tracker

Maintains per-session baseline face embeddings to detect identity drift:

```python
class IdentityTracker:
    # session_id → { face_id → baseline_embedding }
    baselines: dict[str, dict[int, np.ndarray]]

    def compute_embedding(self, face: np.ndarray) -> np.ndarray:
        """Extract 128-d face embedding using FaceNet/ArcFace."""

    def compare_to_baseline(self, session_id, face_id, embedding) -> dict:
        """Compare current embedding to stored baseline.
        Returns { embeddingShift, samePerson, riskLevel }."""

    def update_baseline(self, session_id, face_id, embedding):
        """Set/update baseline for a face in a session."""
```

### Performance Target

- Frame analysis latency: < 500ms per frame (including all models)
- Throughput: 2 frames/second sustained

---

## 6. Backend Pipeline Changes

### Current State

- Backend receives `audio_pcm` from local mic → pipes to GCP STT.
- `frame` message type is a no-op.
- Metrics are simulated or pushed via REST.

### Target State

- Backend receives `audio_pcm`, `frame`, and `caption` from **Zoom Bot Adapter**.
- `frame` messages are forwarded to AI Inference Service for analysis.
- `caption` messages are treated as high-confidence transcript events.
- AI Inference responses update session metrics and trigger alert evaluation.
- All events are persisted to Supabase.

### New Backend Modules

```
realsync-backend/
  lib/
    gcpStt.js              # (existing) Speech-to-Text
    suggestions.js          # (existing) Rule-based suggestions
    aiClient.js             # NEW: HTTP client for AI Inference Service
    alertFusion.js          # NEW: Combines signals → alerts
    fraudDetector.js        # NEW: NLP-based fraud/scam detection
    persistence.js          # NEW: Supabase read/write layer
    meetingTypeDetector.js  # NEW: Enhanced 3-channel meeting type
```

### Frame Processing Flow (new)

```javascript
// In ingest WS handler, when message.type === "frame":
async function handleFrame(session, message) {
  const { dataB64, width, height, capturedAt } = message;

  // 1. Send to AI Inference Service
  const result = await aiClient.analyzeFrame({
    sessionId: session.id,
    frameB64: dataB64,
    capturedAt,
  });

  // 2. Update session metrics
  session.metrics = {
    ...result.aggregated,
    timestamp: result.processedAt,
    source: "external",
  };

  // 3. Broadcast metrics to subscribers
  broadcastToSession(session.id, { type: "metrics", data: session.metrics });

  // 4. Evaluate alerts
  const alerts = alertFusion.evaluate(session, result);
  alerts.forEach(alert => {
    broadcastToSession(session.id, { type: "alert", ...alert });
    persistence.insertAlert(session.id, alert);
  });

  // 5. Persist metrics snapshot
  persistence.insertMetricsSnapshot(session.id, session.metrics);
}
```

---

## 7. Fraud / Scam Detection Module

### Overview

Extends the existing keyword-based `suggestions.js` with a more robust fraud/scam detection layer.

### Architecture

```
fraudDetector.js
├── Rule categories:
│   ├── FINANCIAL_FRAUD    — wire transfers, gift cards, urgent payments
│   ├── CREDENTIAL_THEFT   — OTPs, passwords, verification codes
│   ├── IMPERSONATION      — "I'm from IT", "this is the CEO"
│   ├── SOCIAL_ENGINEERING — urgency pressure, secrecy demands
│   └── ALTERCATION        — threats, aggression, hostile language
│
├── Scoring:
│   ├── Per-phrase weight (0.1–1.0)
│   ├── Context multiplier (meeting type, speaker count)
│   ├── Accumulation window (rolling 60-second buffer)
│   └── Visual signal fusion (deepfake + identity drift boost)
│
└── Output: { severity, category, title, message, confidence }
```

### Keyword / Pattern Rules

```javascript
const FRAUD_RULES = {
  FINANCIAL_FRAUD: {
    patterns: [
      { phrase: "wire transfer", weight: 0.8 },
      { phrase: "gift card", weight: 0.9 },
      { phrase: "send money", weight: 0.7 },
      { phrase: "urgent payment", weight: 0.85 },
      { phrase: "bank account", weight: 0.6 },
      { phrase: "invoice overdue", weight: 0.7 },
      { phrase: "transfer funds", weight: 0.8 },
      { phrase: "western union", weight: 0.9 },
      { phrase: "cryptocurrency", weight: 0.5 },
      { phrase: "bitcoin", weight: 0.5 },
    ],
    baseSeverity: "high",
  },
  CREDENTIAL_THEFT: {
    patterns: [
      { phrase: "otp", weight: 0.8 },
      { phrase: "verification code", weight: 0.85 },
      { phrase: "password", weight: 0.7 },
      { phrase: "two factor", weight: 0.6 },
      { phrase: "2fa code", weight: 0.8 },
      { phrase: "pin number", weight: 0.75 },
      { phrase: "security code", weight: 0.7 },
      { phrase: "login credentials", weight: 0.8 },
    ],
    baseSeverity: "high",
  },
  IMPERSONATION: {
    patterns: [
      { phrase: "i'm from IT", weight: 0.7 },
      { phrase: "this is the CEO", weight: 0.8 },
      { phrase: "i'm your manager", weight: 0.6 },
      { phrase: "tech support", weight: 0.5 },
      { phrase: "from the bank", weight: 0.8 },
      { phrase: "government agency", weight: 0.7 },
    ],
    baseSeverity: "medium",
  },
  SOCIAL_ENGINEERING: {
    patterns: [
      { phrase: "don't tell anyone", weight: 0.8 },
      { phrase: "keep this between us", weight: 0.75 },
      { phrase: "do it now", weight: 0.5 },
      { phrase: "immediately", weight: 0.4 },
      { phrase: "act fast", weight: 0.6 },
      { phrase: "limited time", weight: 0.5 },
      { phrase: "you'll be in trouble", weight: 0.7 },
      { phrase: "consequences", weight: 0.4 },
    ],
    baseSeverity: "medium",
  },
  ALTERCATION: {
    patterns: [
      { phrase: "threat", weight: 0.7 },
      { phrase: "kill you", weight: 1.0 },
      { phrase: "hurt you", weight: 0.9 },
      { phrase: "shut up", weight: 0.5 },
      { phrase: "i'll sue", weight: 0.6 },
      { phrase: "you're fired", weight: 0.5 },
    ],
    baseSeverity: "high",
  },
};
```

### Signal Fusion

```javascript
function evaluateFraudRisk(session, transcriptText) {
  const textScore = scoreTranscriptPatterns(transcriptText, FRAUD_RULES);
  const visualBoost = getVisualRiskBoost(session.metrics);

  // Visual risk amplifies transcript signals
  const fusedScore = textScore.score * (1 + visualBoost);

  // Deepfake + money keywords = critical
  if (session.metrics.deepfake.riskLevel !== "low" && textScore.category === "FINANCIAL_FRAUD") {
    return { severity: "critical", ...textScore, fusedScore };
  }

  return deriveSeverity(fusedScore, textScore);
}
```

---

## 8. Real-Time Alert System

### Alert Severity Levels

| Level | Color | Sound | Behavior |
|-------|-------|-------|----------|
| `low` | Blue | None | Appears in suggestion panel |
| `medium` | Orange | Soft chime | Toast notification + panel |
| `high` | Red | Alert tone | Modal overlay + toast + panel |
| `critical` | Red pulsing | Urgent alarm | Full-screen overlay + toast + panel + sound |

### Alert Fusion Engine

```javascript
// alertFusion.js

class AlertFusionEngine {
  constructor() {
    this.cooldowns = new Map(); // alertKey → lastEmittedAt
  }

  evaluate(session, analysisResult) {
    const alerts = [];

    // 1. Deepfake detection alerts
    if (analysisResult.aggregated.deepfake.riskLevel !== "low") {
      alerts.push(this.buildAlert({
        category: "deepfake",
        severity: analysisResult.aggregated.deepfake.riskLevel === "high" ? "critical" : "high",
        title: "Visual Manipulation Detected",
        message: `Deepfake risk: authenticity score ${analysisResult.aggregated.deepfake.authenticityScore}`,
        confidence: 1 - analysisResult.aggregated.deepfake.authenticityScore,
      }));
    }

    // 2. Identity drift alerts
    if (analysisResult.aggregated.identity.riskLevel !== "low") {
      alerts.push(this.buildAlert({
        category: "identity",
        severity: analysisResult.aggregated.identity.riskLevel,
        title: "Identity Inconsistency",
        message: `Embedding shift: ${analysisResult.aggregated.identity.embeddingShift}`,
        confidence: analysisResult.aggregated.identity.embeddingShift,
      }));
    }

    // 3. Emotion-based aggression alerts
    const emotion = analysisResult.aggregated.emotion;
    if (emotion.label === "Angry" && emotion.confidence > 0.7) {
      alerts.push(this.buildAlert({
        category: "altercation",
        severity: "medium",
        title: "Aggression Indicator",
        message: "High anger detected in participant expression.",
        confidence: emotion.confidence,
      }));
    }

    // Apply cooldowns and dedup
    return this.filterCooldowns(alerts);
  }
}
```

---

## 9. Meeting Type Detection (Enhanced)

### Three Detection Channels

| Priority | Channel | Source | Mechanism |
|----------|---------|--------|-----------|
| 1 (highest) | Manual | Session creation UI | User selects type |
| 2 | Opening statement | First 60s of transcript | Pattern matching for meeting declarations |
| 3 | Auto-detection | Rolling transcript | Enhanced keyword + topic scoring |

### Enhanced Auto-Detection

```javascript
// meetingTypeDetector.js

const TOPIC_TAGS = {
  budget:    { type: "business", keywords: ["budget", "revenue", "cost", "profit", "expense", "ROI"] },
  security:  { type: "official", keywords: ["security", "breach", "vulnerability", "audit", "compliance"] },
  hr:        { type: "official", keywords: ["hiring", "onboarding", "termination", "performance review"] },
  sales:     { type: "business", keywords: ["client", "deal", "pipeline", "proposal", "contract"] },
  casual:    { type: "friends", keywords: ["weekend", "dinner", "movie", "vacation", "birthday", "party"] },
  technical: { type: "business", keywords: ["deploy", "sprint", "ticket", "PR", "merge", "bug", "feature"] },
};

function detectMeetingType(session) {
  // Priority 1: Manual selection always wins
  if (session.meetingTypeManual) return { label: session.meetingTypeManual, source: "manual", confidence: 1.0 };

  // Priority 2: Opening statement (first 60s)
  const openingResult = detectFromOpening(session.transcriptState.lines);
  if (openingResult.confidence >= 0.8) return { ...openingResult, source: "opening" };

  // Priority 3: Auto-detection from full transcript
  return { ...detectFromTranscript(session.transcriptState.lines), source: "auto" };
}
```

---

## 10. Supabase Persistence Layer

### Schema Design

```sql
-- Sessions table
CREATE TABLE sessions (
  id            UUID PRIMARY KEY,
  title         TEXT NOT NULL,
  meeting_type  TEXT NOT NULL CHECK (meeting_type IN ('official', 'business', 'friends')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  user_id       UUID REFERENCES auth.users(id),
  bot_status    TEXT DEFAULT 'idle' CHECK (bot_status IN ('idle', 'joining', 'connected', 'disconnected')),
  meeting_url   TEXT,
  metadata      JSONB DEFAULT '{}'
);

-- Transcript lines
CREATE TABLE transcript_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  speaker       TEXT,
  is_final      BOOLEAN NOT NULL DEFAULT true,
  confidence    REAL,
  ts            TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transcript_session ON transcript_lines(session_id, ts);

-- Alerts
CREATE TABLE alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  severity      TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  category      TEXT NOT NULL,
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  confidence    REAL,
  source_model  TEXT,
  ts            TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_session ON alerts(session_id, ts);

-- Suggestions
CREATE TABLE suggestions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  severity      TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  ts            TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_suggestions_session ON suggestions(session_id, ts);

-- Metrics snapshots (sampled, not every broadcast)
CREATE TABLE metrics_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  data          JSONB NOT NULL,
  ts            TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_metrics_session ON metrics_snapshots(session_id, ts);

-- Session reports (generated at session end)
CREATE TABLE session_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  summary       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Persistence Layer (Node.js)

```javascript
// lib/persistence.js
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = {
  async createSession(session) { ... },
  async endSession(sessionId) { ... },
  async insertTranscriptLine(sessionId, line) { ... },
  async insertAlert(sessionId, alert) { ... },
  async insertSuggestion(sessionId, suggestion) { ... },
  async insertMetricsSnapshot(sessionId, metrics) { ... },
  async generateReport(sessionId) { ... },
  async getSessionAlerts(sessionId) { ... },
  async getSessionTranscript(sessionId) { ... },
  async getSessionReport(sessionId) { ... },
};
```

---

## 11. Frontend Changes

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `AlertOverlay` | `components/alerts/AlertOverlay.tsx` | Full-screen overlay for critical/high alerts |
| `AlertToast` | `components/alerts/AlertToast.tsx` | Toast notification for medium alerts |
| `AlertPanel` | `components/alerts/AlertPanel.tsx` | Scrollable alert history in dashboard |
| `BotStatusBadge` | `components/session/BotStatusBadge.tsx` | Bot connection status indicator |
| `JoinMeetingDialog` | `components/session/JoinMeetingDialog.tsx` | Input Zoom URL + trigger bot join |
| `SessionReport` | `components/screens/SessionReportScreen.tsx` | Post-meeting report view |

### Dashboard Changes

1. **Alert Panel** replaces basic alert list — shows severity-colored cards with timestamps.
2. **Bot Status Badge** in meeting summary panel — shows connected/degraded/disconnected.
3. **Transcript Panel** gains `speaker` labels per line.
4. **Trust Score** updates from real AI inference (not simulated).
5. **Sound notifications** for high/critical alerts.

### New WS Message Handling

```typescript
// Handle new 'alert' event type
if (message?.type === 'alert') {
  const alert: AlertEvent = { ...message };
  setAlerts(prev => [alert, ...prev].slice(0, 100));

  if (alert.severity === 'critical' || alert.severity === 'high') {
    setOverlayAlert(alert); // Show full-screen overlay
    playAlertSound(alert.severity);
  }
}

// Handle new 'sourceStatus' event type
if (message?.type === 'sourceStatus') {
  setBotStatus(message.status);
  setBotStreams(message.streams);
}
```

### Session Creation Flow Update

```
1. User enters meeting title + type (existing)
2. User enters Zoom meeting URL (NEW)
3. POST /api/sessions → creates session
4. POST /api/sessions/:id/join → bot starts joining
5. Dashboard shows bot status: "Joining..."
6. Bot connects → sourceStatus: "connected"
7. Dashboard receives live metrics, transcript, alerts
```

---

## 12. Default Risk Thresholds

These are proposed defaults; Ahmed will review and adjust.

### Deepfake Detection

| Authenticity Score | Risk Level | Alert Severity |
|--------------------|------------|----------------|
| > 0.85 | low | No alert |
| 0.70 – 0.85 | medium | `high` alert |
| < 0.70 | high | `critical` alert |

### Identity Drift

| Embedding Shift | Risk Level | Alert Severity |
|-----------------|------------|----------------|
| < 0.20 | low | No alert |
| 0.20 – 0.40 | medium | `medium` alert |
| > 0.40 | high | `high` alert |

### Emotion (Aggression)

| Anger Confidence | Risk Level | Alert Severity |
|-----------------|------------|----------------|
| < 0.50 | low | No alert |
| 0.50 – 0.70 | medium | `low` suggestion |
| > 0.70 | high | `medium` alert |

### Fraud / Scam

| Fused Score | Risk Level | Alert Severity |
|-------------|------------|----------------|
| < 0.30 | low | No alert |
| 0.30 – 0.60 | medium | `medium` alert |
| 0.60 – 0.80 | high | `high` alert |
| > 0.80 | critical | `critical` alert |

### Trust Score

| Score | Interpretation |
|-------|----------------|
| > 0.85 | Trustworthy (green) |
| 0.70 – 0.85 | Moderate (yellow) |
| 0.50 – 0.70 | Suspicious (orange) |
| < 0.50 | Untrustworthy (red) |

---

## 13. Implementation Phases

### Phase 1: Contract Freeze + Ingest Adapter Skeleton (Week 1)

**Deliverables:**
1. Create `contracts/` directory with all schemas from §3.
2. Scaffold Zoom Bot Adapter directory structure with stub implementations.
3. Add `frame` and `caption` handling to backend ingest WS (currently no-op).
4. Scaffold `aiClient.js` with mock responses matching §3.2 contract.
5. Scaffold `alertFusion.js`, `fraudDetector.js`, `persistence.js`, `meetingTypeDetector.js`.
6. Add `alert` and `sourceStatus` event broadcasting from backend.
7. End-to-end stub flow: simulated bot → ingest WS → mock AI → mock alert → frontend.
8. Supabase schema migration file.

**Validation:** Frontend receives `alert` and `sourceStatus` events from stub pipeline.

### Phase 2: Zoom Bot + AI Service Integration (Weeks 2-3)

**Deliverables:**
1. Implement Puppeteer-based Zoom Bot (join, capture audio/video/captions).
2. Implement FastAPI AI Inference Service wrapping existing models.
3. Implement identity tracker with per-session embedding baselines.
4. Wire real bot → real ingest → real AI inference → real metrics.
5. Implement real GCP STT for bot audio (or Zoom CC as primary transcript).

**Validation:** Bot joins a real Zoom meeting, captures media, AI produces real scores.

### Phase 3: Fraud Detection + Alert Fusion (Week 3-4)

**Deliverables:**
1. Implement full fraud/scam keyword detection with weighted scoring.
2. Implement alert fusion: visual + transcript + fraud signals combined.
3. Implement enhanced meeting type detection (3 channels).
4. Wire alerts into Supabase persistence.

**Validation:** Fraud keywords + deepfake risk together trigger critical alerts.

### Phase 4: Frontend Alerts + Transcript + Reports (Week 4-5)

**Deliverables:**
1. Alert overlay, toast, panel components.
2. Bot status indicator.
3. Speaker labels in transcript.
4. Sound notifications for high/critical.
5. Session report screen (post-meeting summary from Supabase).
6. Join-meeting dialog (enter Zoom URL).

**Validation:** End-to-end demo: join Zoom → see live transcript + alerts → view report.

### Phase 5: Persistence + Hardening (Week 5-6)

**Deliverables:**
1. Full Supabase persistence for transcripts, alerts, suggestions, metrics.
2. Session report generation at session end.
3. Error recovery for bot disconnections.
4. Latency optimization and load testing.

**Validation:** All acceptance criteria from scope document met.

---

## 14. Test Plan

### Unit Tests

| Module | Tests |
|--------|-------|
| `suggestions.js` | Keyword matching, scoring, cooldown dedup |
| `fraudDetector.js` | Pattern matching, severity derivation, fusion scoring |
| `alertFusion.js` | Threshold triggering, cooldown, severity escalation |
| `meetingTypeDetector.js` | Manual override, opening statement detection, auto-scoring |
| `persistence.js` | Insert/query for all tables, error handling |
| `aiClient.js` | Request formatting, response parsing, timeout handling |

### Integration Tests

| Scenario | What it validates |
|----------|-------------------|
| Stub bot → ingest WS → mock AI → alert broadcast | End-to-end message flow |
| Real frame → AI service → metrics response | AI service contract compliance |
| Transcript + deepfake risk → fraud alert | Signal fusion correctness |
| Session create → join → data flow → stop → report | Full session lifecycle |

### End-to-End Tests

| Scenario | Steps |
|----------|-------|
| Live Zoom meeting | 1. Create session 2. Enter Zoom URL 3. Bot joins 4. Verify transcript appears 5. Verify metrics update 6. Verify alerts fire on trigger conditions 7. End session 8. Verify report |
| Deepfake trigger | Inject manipulated video → verify critical alert within 2s |
| Fraud trigger | Speak fraud keywords → verify high alert within 1-3s |
| Identity drift | Switch camera/face → verify identity alert |

### Latency Benchmarks

| Metric | Target | Measurement |
|--------|--------|-------------|
| Transcript latency | 1-3s | Timestamp of speech vs. transcript event |
| Alert latency | 1-2s after trigger | Timestamp of trigger condition vs. alert event |
| Frame analysis | < 500ms | AI service request-response time |
| Metrics broadcast | < 100ms | Backend processing to WS send |

---

## 15. Deployment Plan

### Development Environment

```
Terminal 1: cd Front-End && npm run dev          # :3000
Terminal 2: cd realsync-backend && node index.js  # :4000
Terminal 3: cd RealSync-AI-Prototype && python serve/app.py  # :5100
```

### Environment Variables

```bash
# Backend (.env)
PORT=4000
REALSYNC_USE_GCP_STT=1
REALSYNC_STT_LANGUAGE=en-US
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
AI_SERVICE_URL=http://localhost:5100

# Frontend (.env)
VITE_API_BASE_URL=http://localhost:4000
VITE_WS_BASE_URL=ws://localhost:4000
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# AI Service (.env)
PORT=5100
MODEL_DIR=./src/models
```

### Production Considerations

- AI Inference Service should run on a GPU-enabled machine for acceptable latency.
- Zoom Bot Adapter requires a machine with display server (Xvfb on Linux) for Puppeteer.
- PulseAudio or BlackHole required for system audio capture.
- Supabase connection pooling for concurrent sessions.
- Rate-limit frame analysis to 2 FPS max per session to manage GPU load.

---

## Appendix: Team Task Mapping

| Team Member | Spec Sections | Phase Work |
|-------------|---------------|------------|
| **AI-1** (Emotion) | §5, §12 | Emotion model retraining, FER calibration, benchmarks |
| **AI-2** (Identity) | §5, §12 | Identity tracker, embedding drift thresholds, ArcFace integration |
| **AI-3** (Deepfake) | §5, §12 | MesoNet-4 optimization, model ensemble, latency tuning |
| **FS-1** (Backend) | §4, §6, §7, §8, §10 | Bot adapter, ingest pipeline, fraud detection, persistence |
| **FS-2** (Frontend) | §11 | Alert UI, transcript speaker labels, report screen, bot status |
