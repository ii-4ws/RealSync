# RealSync — TODO

## AI Pipeline Upgrade — COMPLETED (All 7 Phases)

All code changes done. See `tasks/ai-pipeline-upgrade-plan.md` for full plan.

**New files created:**
- `serve/emotion_model.py`, `serve/deepfake_model.py`, `serve/audio_model.py`, `serve/text_analyzer.py`
- `training/train_efficientnet_sbi.py`

---

## Bug Fix Sprint — 29-03-2026

### COMPLETED (Session 18-19)

- [x] **C5** — Trust score double-counts identity → Fixed `frameHandler.js` + `audioHandler.js`. Uses raw `deepfake.authenticityScore`. 114 tests pass.
- [x] **C6** — Audio confidence always null → Already fixed (type `number | null`, guards with `?? 0`)
- [x] **C7** — CPU-bound ML blocks event loop → Already fixed (`run_in_threadpool`)
- [x] **C8** — MediaPipe not thread-safe → Already fixed (`threading.local()`)
- [x] **C9** — Identity/temporal tracker race conditions → Already fixed (locks on dicts)
- [x] **C10** — Unread notification count wrong → Already fixed (RPC)
- [x] **C11** — unreadCount shadow state drifts → Already fixed (`useMemo`)

### COMPLETED (Session 20 — Critical C2-C4, C12-C15)

- [x] **C2** — `.dockerignore` added to both services
- [x] **C3** — Non-root user in both Dockerfiles (+ H14 HF cache fix)
- [x] **C4** — `torch.load` unsafe fallback removed in `emotion_model.py`
- [x] **C12** — WebSocket reconnect race fixed (detach handlers before close)
- [x] **C13** — Audio training TARGET_LENGTH → 64000 to match inference
- [x] **C14** — Already fixed (path sanitization existed)
- [x] **C15** — HEALTHCHECK added to both Dockerfiles

### COMPLETED (Session 20 — High Priority)

- [x] **H2** — Already fixed in `frameHandler.js` (session.endedAt guard)
- [x] **H3** — Already fixed in `audioHandler.js` (cap 128 chunks)
- [x] **H4** — Already fixed in `routes/bot.js` (Zoom URL validation)
- [x] **H7** — Already fixed (broadcast moved after trust recomputation)
- [x] **H8** — Already fixed (`_behavioralCooldowns = new Map()` in constructor)
- [x] **H10** — `behavior_conf` fixed: neutral 0.5 baseline + emotion scaling
- [x] **H11** — Already fixed (`crop_original` passed to deepfake model)
- [x] **H15** — `toPercent()` fixed: handles both 0-1 and >1 ranges
- [x] **H19** — Exponential backoff + jitter added to WS reconnect
- [x] **H20** — notification_reads scoped to userId
- [x] **H21** — Already fixed (ownership verification exists)

### REMAINING

- [ ] **C1** — Rotate Supabase service_role key (⚠️ MANUAL — Supabase dashboard → Project Settings → API)

---

## Final Review Sprint — 29-03-2026

Full findings: `tasks/final-review-findings.md` (3 reviews: CodeRabbit + Claude + Codex)

### COMPLETED — All 33 Issues Fixed (Session 20)

**Wave 1 — Training (RunPod Blocking):**
- [x] **FC1** — Accuracy threshold 0.5→0.0 in 4 training scripts (8 locations)
- [x] **FC2** — Gradient clipping added to `train_efficientnet_sbi.py`
- [x] **FC3** — SBI blend mask vectorized (numpy, ~100x faster)

**Wave 2 — AI Service (Docker + Python):**
- [x] **FC4** — `.dockerignore` `*.pth` → specific exclusions (models now in Docker)
- [x] **FH1** — `openai-whisper>=20231117` added to requirements.txt
- [x] **FH2** — Whisper model loader thread-safe (lock + sentinel)
- [x] **FH3** — Deepfake calibration documented with TODO for post-tuning
- [x] **FH6** — WavLM pre-downloaded in Dockerfile
- [x] **FH8** — mediapipe updated to >=0.10.28
- [x] **FH9** — `hmac.compare_digest` for API key auth
- [x] **FM3** — Whisper language configurable via `WHISPER_LANGUAGE` env
- [x] **FM8** — Whisper base64 validation + odd-byte check
- [x] **FM14** — Inference thread pool shutdown in lifespan

**Wave 3 — Backend:**
- [x] **FC5** — `session?.sessionId` → `session?.id` in alertFusion
- [x] **FC6** — Fresh AbortController for retry requests
- [x] **FH4** — `_consecutiveLow` cleared in reset()
- [x] **FH5** — scheduledAt validation moved before createSession()
- [x] **FH7** — notification_reads left join preserves unread (`.or()`)
- [x] **FH10** — STT stream nulled on error
- [x] **FH11** — Temporal cooldown keys scoped per session
- [x] **FH12** — deriveMetrics uses explicit field picks (no spread)
- [x] **FM2** — Health endpoint returns 503 when degraded
- [x] **FM5** — Race guard on auto-end session

**Wave 4 — Frontend + Cleanup:**
- [x] **FM1** — Deleted 87 duplicate Finder files
- [x] **FM4** — Removed auto notification permission request
- [x] **FM11** — Session data preserved on bot disconnect
- [x] **FM13** — start.sh uses direct venv Python path
- [x] **FM15** — toPercent uses 1.5 threshold + clamping

**Verification:** 114/114 tests pass, TypeScript clean, 0 duplicate files

### Approach
- Parallel agents for independent fixes
- Verify against 114 existing tests
- Permissions set to auto-allow in `~/.claude/settings.json`
