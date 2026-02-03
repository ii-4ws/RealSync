# RealSync Contracts (v1)

This folder documents the **frozen contracts** between:
- Frontend (Vite/React) ↔ Backend (Node/Express + WebSockets)
- Backend ↔ AI service (FastAPI)

These contracts are intentionally small and stable so multiple teammates can work in parallel.

## Meeting Types

- `official`
- `business`
- `friends`

## REST

### Create session

`POST /api/sessions`

Request:
```json
{ "title": "Q3 Review", "meetingType": "business" }
```

Response:
```json
{
  "sessionId": "uuid",
  "ingestWsUrl": "/ws/ingest?sessionId=uuid",
  "subscribeWsUrl": "/ws?sessionId=uuid"
}
```

## WebSockets

### Subscribe (server → client)

`GET /ws?sessionId=<id>`

Messages:
- Metrics:
```json
{ "type": "metrics", "sessionId": "uuid", "data": { "trustScore": 0.98 } }
```
- Transcript (interim + final):
```json
{ "type": "transcript", "sessionId": "uuid", "text": "hello…", "isFinal": false, "confidence": 0.82, "ts": "ISO8601" }
```
- Suggestion:
```json
{ "type": "suggestion", "sessionId": "uuid", "severity": "high", "title": "Verify before acting", "message": "...", "ts": "ISO8601" }
```

### Ingest (client → server)

`GET /ws/ingest?sessionId=<id>`

Messages:
- Start:
```json
{ "type": "start", "sessionId": "uuid", "meetingType": "business" }
```
- Video frame (optional, v1):
```json
{ "type": "frame", "ts": "ISO8601", "mime": "image/jpeg", "dataB64": "..." }
```
- Audio PCM (16kHz mono, LINEAR16):
```json
{ "type": "audio_pcm", "sampleRate": 16000, "channels": 1, "dataB64": "..." }
```
- Stop:
```json
{ "type": "stop", "sessionId": "uuid" }
```

