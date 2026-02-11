# RealSync Contracts (v1 — FROZEN)

This folder documents the **frozen contracts** between:
- Frontend (Vite/React) ↔ Backend (Node/Express + WebSockets)
- Backend ↔ AI Inference Service (FastAPI)
- Zoom Bot Adapter ↔ Backend

These contracts are intentionally small and stable so multiple teammates can work in parallel.
**Do not change schemas without team agreement.**

## Files

| File | Describes |
|------|-----------|
| `ingest.schema.json` | All messages from Bot/Client → Backend on WS `/ws/ingest` |
| `subscribe.schema.json` | All events from Backend → Frontend on WS `/ws` |
| `ai-inference.schema.json` | HTTP request/response for Backend → AI Service |
| `supabase-migration.sql` | Database schema for Supabase Postgres |

## Meeting Types

- `official`
- `business`
- `friends`

## Quick Reference

### REST Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sessions` | Create session (`{ title, meetingType }`) |
| GET | `/api/sessions` | List all sessions |
| POST | `/api/sessions/:id/join` | Trigger bot to join Zoom meeting |
| POST | `/api/sessions/:id/leave` | Trigger bot to leave meeting |
| POST | `/api/sessions/:id/stop` | End session |
| GET | `/api/sessions/:id/metrics` | Get session metrics |
| POST | `/api/sessions/:id/metrics` | Push external metrics |
| GET | `/api/sessions/:id/alerts` | Get session alerts |
| GET | `/api/sessions/:id/transcript` | Get session transcript |
| GET | `/api/sessions/:id/report` | Get session report |

### WebSocket Channels

| Path | Direction | Purpose |
|------|-----------|---------|
| `/ws?sessionId=<id>` | Server → Client | Subscribe to live events |
| `/ws/ingest?sessionId=<id>` | Client → Server | Send audio/video/captions |

### Subscribe Event Types

- `metrics` — live trust/emotion/identity/deepfake scores
- `transcript` — speech-to-text (interim + final)
- `alert` — critical notifications (deepfake, fraud, identity, altercation)
- `suggestion` — non-critical guidance
- `sourceStatus` — bot connection health

### Ingest Message Types

- `start` — begin ingestion
- `stop` — end ingestion
- `audio_pcm` — PCM16 audio chunk (16kHz, mono, base64)
- `frame` — JPEG video frame (base64)
- `caption` — Zoom CC text with speaker name
- `source_status` — bot health heartbeat
