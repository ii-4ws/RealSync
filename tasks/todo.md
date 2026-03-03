# RealSync — TODO

## AI Pipeline Upgrade — COMPLETED (All 7 Phases)

All code changes done. See `tasks/ai-pipeline-upgrade-plan.md` for full plan.

**New files created:**
- `serve/emotion_model.py`, `serve/deepfake_model.py`, `serve/audio_model.py`, `serve/text_analyzer.py`
- `training/train_efficientnet_sbi.py`

**Modified:** `serve/inference.py`, `serve/app.py`, `serve/config.py`, `requirements.txt`, `Dockerfile`,
`lib/aiClient.js`, `lib/alertFusion.js`, `lib/fraudDetector.js`, `index.js`, `DashboardScreen.tsx`, `ai-inference.schema.json`

**Still needed (not code):**
- [x] Train/download `efficientnet_b4_deepfake.pth` weights (done — SBI conversion)
- [x] Download `aasist_weights.pth` (done — trained on ASVspoof 2019 LA, 54.8% acc)
- [x] DeBERTa text model download script (`scripts/download_models.sh`) + cached
- [x] All 6 models confirmed loaded via health check (2026-03-01)
- [x] SBI label convention verified (label=0 real, label=1 fake, inversion correct)
- [x] AI_SERVICE_REPORT.md written with full accuracy figures
- [x] Fine-tune deepfake classifier — **92.33% val accuracy** at epoch 14 via `training/finetune_deepfake_labeled.py`
- [ ] Re-train audio model — hyperparams updated (lr=1e-4, batch=32, epochs=50, warmup+cosine), run `training/train_audio_sincconv.py`
- [ ] End-to-end testing with live Zoom session
- [ ] Run Supabase migration: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS detection_settings JSONB DEFAULT '{"facialAnalysis": true, "voicePattern": true, "emotionDetection": true}'::jsonb;`
- [ ] Create Supabase Storage bucket for avatars (SQL in plan doc)

## Bugs — ALL RESOLVED

- [x] **Sessions lost on backend restart** (#5)
  Lazy rehydration from Supabase when WS client requests a session not in memory.
  GET /api/sessions now merges in-memory + Supabase historical sessions.
  - Files: `persistence.js` (getActiveSessions, getUserSessions, getSessionById), `index.js` (rehydrateSession, async GET /api/sessions)

- [x] **"Connecting to Meeting" overlay broken** (#6)
  Added `botProgress` state ('creating' → 'joining' → 'streaming') with per-step conditional styling.
  Auto-dismisses 1.2s after streaming confirmed. Hard timeout extended to 30s.
  - Files: `App.tsx` (botProgress state, overlay JSX)

- [x] **Orphaned bot stays in Zoom after kill** (#10)
  Graceful shutdown already calls `botManager.cleanupAll()`. Added stale Chromium cleanup on startup
  via `pgrep`/`process.kill`. `start.sh` sends SIGTERM first (M8).
  - Files: `index.js` (startup cleanup with execFileSync)

- [x] **FER emotion model fails to load** (#12)
  Replaced with MobileNetV2 — no FER dependency remains.

## Known Limitations — RESOLVED

- [x] **MesoNet-4 false positives on Zoom video** (#13)
  Replaced with EfficientNet-B4+SBI.

## Documentation — COMPLETED

- [x] `docs/CODEMAP.md` — Complete codebase map (architecture, file-level detail, all 3 services)
- [x] `docs/DEVELOPMENT_LOG.md` — Development history, timeline, decisions, lessons
- [ ] Remove `Co-Authored-By: Claude` from commit `17bcade` (git rebase)

## Planned Features — ALL IMPLEMENTED

- [x] **Multi-participant detection** (#15)
  Backend iterates `result.faces[]` with per-face alertFusion calls (capped at 6 faces).
  `evaluateVisual()` accepts `{ faceId, participantName }` opts with per-face cooldown keys.
  Dashboard shows face count in Meeting Summary card.
  - Files: `alertFusion.js`, `index.js` (handleFrame), `DashboardScreen.tsx`

- [x] **Full participant tracking with names** (#16)
  ZoomBotAdapter scrapes participant names from Zoom DOM (panel + tile fallback) every 10s.
  Backend maintains `session.participants` Map (faceId → { name, firstSeen }).
  Alerts enriched with participant names. Frontend ParticipantList component with clickable
  chips for per-participant alert filtering.
  - Files: `ZoomBotAdapter.js`, `index.js`, `alertFusion.js`, `DashboardScreen.tsx`,
    new `components/dashboard/ParticipantList.tsx`
