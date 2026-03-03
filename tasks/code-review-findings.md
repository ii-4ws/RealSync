# RealSync Full Project Code Review — 2026-02-28

8 parallel review agents ran across: AI service, backend, frontend, training scripts, deployment/infra, notification system, utility modules, and cross-cutting integration.

---

## CRITICAL Issues (15)

### C1 — Live Supabase service_role key on disk
- **File:** `realsync-backend/.env:7`
- **Area:** Security
- The `.env` file contains a live, non-redacted `SUPABASE_SERVICE_KEY` (service_role JWT). This key bypasses ALL Row Level Security. Anyone with repo access can read the entire database.
- **Fix:** Rotate the key immediately in Supabase dashboard (Project Settings > API). Verify it's not in git history with `git log --all --full-history -- realsync-backend/.env`. Replace value with a placeholder.
- **Status:** Verified — `.env` files are excluded by `.gitignore` and have never been committed to git history.

### C2 — No `.dockerignore` — secrets baked into Docker images
- **Files:** Both `RealSync-AI-Prototype/` and `realsync-backend/` lack `.dockerignore`
- **Area:** Security
- `COPY . .` in both Dockerfiles copies `.env` files with real credentials into the image layers. Anyone who pulls the image can extract them.
- **Fix:** Create `.dockerignore` in both directories excluding `.env`, `.env.*`, `node_modules`, `__pycache__`, `.venv`, `.git`, `*.log`.

### C3 — All containers run as root
- **Files:** Both Dockerfiles
- **Area:** Security
- Neither Dockerfile creates a non-root user. Every process runs as UID 0. If any vulnerability allows command execution, the attacker has full root access.
- **Fix:** Add `RUN useradd --create-home appuser` and `USER appuser` before `CMD` in both Dockerfiles. Use `COPY --chown=appuser:appuser`.

### C4 — `torch.load(weights_only=False)` — arbitrary code execution risk
- **Files:** `serve/deepfake_model.py:80`, `serve/audio_model.py:151`, `serve/emotion_model.py:93`
- **Area:** Security
- PyTorch `weights_only=False` allows arbitrary code execution via deserialization. A compromised `.pth` file executes code as the server process.
- **Fix:** Use `weights_only=True` wherever possible. If checkpoint format requires it, add explicit trust documentation and verify file hashes.

### C5 — Trust score double-counts identity signal
- **Files:** `serve/inference.py:275-278` then `realsync-backend/index.js:674-676`
- **Area:** Integration / ML Correctness
- AI service computes: `trust = 0.47*video + 0.33*identity + 0.20*behavior` (identity baked in).
- Backend then uses this composite as "videoTrust" and adds identity AGAIN: `finalTrust = 0.35*videoTrust + 0.25*audio + 0.25*identitySignal + 0.15*behavior`.
- Identity is double-counted whenever audio is available.
- **Fix:** Either have AI return raw `authenticityScore` separately, or in the audio path use `result.aggregated.deepfake.authenticityScore` (not the composite trust) as the video term.

### C6 — `confidenceLayers.audio` is always `null` — frontend type mismatch
- **Files:** `serve/inference.py:309` then `DashboardScreen.tsx:314`
- **Area:** Integration
- AI service always returns `audio: None` from `/api/analyze/frame` (audio comes from a separate endpoint). Frontend TypeScript type declares `audio: number` (not nullable). Shows misleading `0%`.
- **Fix:** Update `Metrics` type to `audio: number | null`. Guard with `toPercent(displayMetrics.confidenceLayers.audio ?? 0)`. Show "N/A" when null.

### C7 — CPU-bound ML inference blocks async event loop
- **Files:** `serve/app.py:213,233,256`
- **Area:** Performance
- `analyze_frame()` runs JPEG decode + MediaPipe + EfficientNet-B4 + MobileNetV2 + FaceNet synchronously in async FastAPI handlers. Blocks ALL other requests (including health checks) for 100-500ms per frame.
- **Fix:** Use `from fastapi.concurrency import run_in_threadpool` and `result = await run_in_threadpool(analyze_frame, ...)` for all 3 endpoints.

### C8 — MediaPipe FaceDetection not thread-safe
- **File:** `serve/inference.py:118`
- **Area:** Race Condition
- Single global `_mp_face_detection` instance shared across concurrent requests with no lock. Under concurrent load, will crash or corrupt detections.
- **Fix:** Add `_face_detector_call_lock = threading.Lock()` and wrap `detector.process(rgb)` calls.

### C9 — Identity tracker and temporal analyzer have no locks on mutable dicts
- **Files:** `serve/identity_tracker.py:107-185`, `serve/temporal_analyzer.py:38-107`
- **Area:** Race Condition
- Both classes maintain plain `dict` state read/written from concurrent request handlers with no locking. Can cause `RuntimeError: dictionary changed size during iteration` in `_evict_stale_sessions`.
- **Fix:** Add `threading.Lock()` to both classes, acquire around all reads/writes to internal dicts.

### C10 — Unread notification count always wrong
- **File:** `realsync-backend/lib/persistence.js:338-342`
- **Area:** Bug
- Unread count query uses `.is("notification_reads.read_at", null)` but `notification_reads` is NOT joined in this query. Supabase silently ignores the filter. Returns total count, not unread.
- **Fix:** Use the existing `get_unread_notification_count` RPC as the primary path instead.

### C11 — `unreadCount` shadow state drifts from actual notifications
- **File:** `Front-End/src/contexts/NotificationContext.tsx:131-132`
- **Area:** Bug
- `unreadCount` is a separate `useState` that's incremented on WS alerts and decremented on markAsRead. Races with initial fetch, can go negative.
- **Fix:** Derive from notifications array: `const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications])`.

### C12 — `cleanup()` inside `connect()` triggers duplicate WebSocket reconnects
- **File:** `Front-End/src/contexts/WebSocketContext.tsx:55`
- **Area:** Bug
- `cleanup()` at top of `connect()` calls `ws.close()` which synchronously triggers `onclose` handler, scheduling a reconnect timer. Then `connect()` creates a new socket. Two concurrent connection attempts.
- **Fix:** Detach `onclose` before closing: `wsRef.current.onclose = null; wsRef.current.close();`

### C13 — Train on 1s clips, infer on 4s clips — distribution mismatch
- **Files:** `training/train_audio_sincconv.py:50` (TARGET_LENGTH=16000) vs `serve/audio_model.py:23` (TARGET_LENGTH=64000)
- **Area:** ML Correctness
- Model trained on 1-second audio clips but deployed on 4-second clips. Artifacts appearing after 1s are never seen during training.
- **Fix:** Set `TARGET_LENGTH = 64000` in training to match inference, or use random crops of varying lengths.

### C14 — `tarfile.extract()` path traversal vulnerability
- **File:** `training/convert_sbi_weights.py:97`
- **Area:** Security
- `tf.extract(member, tmpdir)` with untrusted tar from Google Drive. Malicious tar can write files outside tmpdir.
- **Fix:** Sanitize: `member.name = os.path.basename(member.name)` before extracting.

### C15 — No HEALTHCHECK in either Dockerfile
- **Files:** Both Dockerfiles
- **Area:** Reliability
- Containers report "healthy" immediately even while models are loading (15-30s). Orchestrators can't detect degraded service.
- **Fix:** Add `HEALTHCHECK --start-period=60s` with curl to `/api/health`.

---

## HIGH Issues (25)

### H1 — Missing auth on `POST /api/metrics`
- **File:** `realsync-backend/index.js:1110-1148`
- Auth check bypassed when `session.userId` or `req.userId` is null. Any user can overwrite anonymous session metrics.

### H2 — Frames still processed after session stop
- **File:** `realsync-backend/index.js:601`
- No `session.endedAt` guard in `handleFrame`. Stopped sessions still receive frames from bot.
- **Fix:** Add `if (session.endedAt) return;` at top of `handleFrame`.

### H3 — Audio buffer grows unbounded on AI service errors
- **File:** `realsync-backend/index.js:520-537`
- `audioAnalysisBuffer` has no size cap. When AI service is slow/unavailable, chunks pile up.
- **Fix:** Cap at 200 entries (~100s of audio).

### H4 — No URL validation before passing meetingUrl to Puppeteer bot
- **File:** `realsync-backend/index.js:930-964`
- Validate `https://*.zoom.us` in route handler, not just in bot constructor.

### H5 — No bound on `alertIds` array in `POST /api/notifications/read`
- **File:** `realsync-backend/index.js:1076-1101`
- Cap at 100 entries to prevent massive Supabase upserts.

### H6 — ZoomBotAdapter takes full-page screenshot including Zoom UI
- **File:** `realsync-backend/bot/ZoomBotAdapter.js:1399-1411`
- Sends toolbar, participant names, chat panels to AI model. Should clip to participant video element.

### H7 — Metrics broadcast fires before audio-corrected trust score
- **File:** `realsync-backend/index.js:630 vs 666-682`
- `broadcastToSession` happens at line 630, trust recomputation at line 681. Dashboard always shows stale trust.
- **Fix:** Move broadcast to after trust score recomputation.

### H8 — `_behavioralCooldowns` not initialized in constructor
- **File:** `realsync-backend/lib/fraudDetector.js:294-303`
- Lazily initialized inside the loop. `reset()` will throw if called before first `evaluateBehavioral`.
- **Fix:** Initialize `this._behavioralCooldowns = new Map()` in constructor.

### H9 — Config naming `DEEPFAKE_AUTH_LOW=0.85` / `HIGH=0.70` — inverted names
- **File:** `serve/config.py:48-49`
- `_LOW` is the higher value, `_HIGH` is the lower value. Logic trap for future developers.
- **Fix:** Rename to `DEEPFAKE_AUTH_THRESHOLD_LOW_RISK = 0.85` / `DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK = 0.70`.

### H10 — `behavior_conf` formula permanently biased high (min 0.55)
- **File:** `serve/inference.py:270`
- `behavior_conf = 0.55 + emotion_conf * 0.4`. Never below 0.55 regardless of actual risk. Creates a trust score floor.
- **Fix:** Default to neutral 0.5 when behavioral text analysis unavailable.

### H11 — Face crop double-resampled 224->380 degrades deepfake detection
- **File:** `serve/inference.py:147-153` then `serve/deepfake_model.py:118-119`
- Crop stored at 224x224, then upsampled to 380x380 for EfficientNet-B4. Loses texture detail.
- **Fix:** Pass `face_info["crop_original"]` to `analyze_deepfake()`.

### H12 — DeBERTa 5-hypothesis NLI runs synchronously (~1s CPU) with no timeout
- **File:** `serve/text_analyzer.py:103`, `serve/app.py:255-256`
- 5 NLI forward passes block event loop. Combined with C7.
- **Fix:** Use `run_in_threadpool` + `asyncio.wait_for(timeout=5.0)`.

### H13 — `sessionId` unvalidated — unbounded dict growth
- **Files:** `serve/inference.py:231`, `serve/identity_tracker.py:137`, `serve/temporal_analyzer.py:70`
- Any client can submit arbitrary sessionId strings. Eviction at >50 sessions can't outpace creation.
- **Fix:** Validate UUID pattern in Pydantic models: `Field(min_length=1, max_length=64, pattern=r'^[a-zA-Z0-9_\\-]+$')`.

### H14 — DeBERTa cache inaccessible after adding non-root user
- **File:** `RealSync-AI-Prototype/Dockerfile:18`
- Model cached to `/root/.cache/huggingface/`. Non-root user can't read it.
- **Fix:** Set `ENV TRANSFORMERS_CACHE=/app/.cache/huggingface` before download step.

### H15 — `toPercent()` returns wrong value for values >1
- **File:** `Front-End/src/components/screens/DashboardScreen.tsx:108`
- `toPercent(1.2)` returns `1` not `120`. High drift scores show as ~1%.
- **Fix:** `Math.min(100, value > 1 ? Math.round(value) : Math.round(value * 100))`.

### H16 — `fallbackMetrics.timestamp` stale at module load
- **File:** `Front-End/src/components/screens/DashboardScreen.tsx:75`
- Module-level constant. Shows startup time forever if no backend connection.

### H17 — Email change in Settings never persisted to Supabase auth
- **File:** `Front-End/src/components/screens/SettingsScreen.tsx:129-166`
- Only writes `username` and `avatar_url`. Needs `supabase.auth.updateUser({ email })`.

### H18 — `useWsMessages` resubscribes every render
- **File:** `Front-End/src/contexts/WebSocketContext.tsx:140-146`
- `onBotConnected` in App.tsx is a new arrow function every render. Causes `handleWsMessage` to get new ref.
- **Fix:** Stabilize with `useCallback(() => setBotConnecting(false), [])` in App.tsx.

### H19 — No exponential backoff on WebSocket reconnect
- **File:** `Front-End/src/contexts/WebSocketContext.tsx:96,108`
- Hardcoded 3s retry. Thundering herd if backend is down.
- **Fix:** Exponential backoff with jitter, cap at 30s, reset on successful open.

### H20 — `notification_reads` join not scoped to userId — read state leaks
- **File:** `realsync-backend/lib/persistence.js:312`
- `notification_reads(read_at)` returns ALL users' read records. User A's read state appears for User B.

### H21 — `markNotificationsRead` doesn't verify alert ownership
- **File:** `realsync-backend/lib/persistence.js:357-373`
- Any authenticated user can mark any alert as read by passing arbitrary UUIDs.
- **Fix:** Subquery to verify alertIds belong to user's sessions before upserting.

### H22 — `getSessionTranscript`/`getSessionAlerts` — no pagination
- **File:** `realsync-backend/lib/persistence.js:98-115, 144-159`
- Silently truncated at Supabase's 1000-row default limit.

### H23 — No random seeds in training scripts
- **Files:** `training/train_audio_sincconv.py`, `training/train_efficientnet_sbi.py`
- Non-reproducible results. Unseeded shuffle before train/val split.

### H24 — `BCELoss` after sigmoid — numerically unstable
- **Files:** `training/train_audio_sincconv.py:346`, `training/train_efficientnet_sbi.py:253`
- Should use `BCEWithLogitsLoss` and remove sigmoid from forward().

### H25 — `DEPLOYMENT.md` uses `localhost:5100` for AI URL — broken in multi-container Docker
- **File:** `DEPLOYMENT.md:68`
- `localhost` inside backend container points to itself. Needs Docker Compose service name or host IP.

---

## MEDIUM Issues (30)

1. `SincConv` normalization differs from SincNet reference — `serve/audio_model.py:49`
2. EWMA docstring says "recency-weighted" but weights oldest frames most — `serve/temporal_analyzer.py:122`
3. `_no_face_counters` dict never cleaned on session end — `serve/inference.py:44`
4. `requirements.txt` — `transformers` unpinned, can break on redeploy
5. No size limit on `frameB64`/`audioB64` inputs — DoS vector — `serve/inference.py:87`
6. `processedAt` timestamps hardcode `.000` milliseconds — multiple files
7. `Dropout(inplace=True)` deprecated — `serve/deepfake_model.py:43`
8. `start.sh` uses `kill -9` on restart — no graceful shutdown — `start.sh:8`
9. `start.sh` — no AI service readiness wait before starting backend — `start.sh:12-21`
10. `generateReport` makes redundant duplicate DB round trip — `persistence.js:225-250`
11. `logger.js` — `Error` objects serialize as `{}` — `logger.js:22`
12. `ZoomBotAdapter` — pwd not URL-encoded — `ZoomBotAdapter.js:588`
13. Redundant URL re-parse in `wssIngest` handler — `index.js:447-466`
14. `recentLines` in `FraudDetector` not trimmed during idle — `fraudDetector.js`
15. Audio downsampling uses nearest-neighbor — aliasing artifacts — `ZoomBotAdapter.js`
16. Three different trust score formulae across mock/simulated/real paths — `aiClient.js:71-79`
17. `session.transcriptState.lines` grows unbounded — `index.js:391-404`
18. `session.alerts` in-memory array grows unbounded — `index.js:234`
19. Backend Dockerfile missing system libraries for Puppeteer WebAudio — `realsync-backend/Dockerfile:5-7`
20. `recommendations.js` — no case normalization on inputs — `recommendations.js:53-57`
21. `persistence.js` uses `console.warn` instead of structured logger — all error paths
22. `ErrorBoundary` — no recovery path, error object discarded — `ErrorBoundary.tsx:17-18`
23. `NotificationBell` — relative timestamps never refresh while open — `NotificationBell.tsx:20`
24. `SettingsScreen` — hidden file input missing `accept` attribute — `SettingsScreen.tsx:300`
25. SVG `<defs>` placed after referencing elements — `DashboardScreen.tsx:394-397`
26. `handleSignOut` sets screen before auth state resolves — `App.tsx:178`
27. Clearing user name doesn't update local App state — `SettingsScreen.tsx:160-165`
28. `prototypeModeEnabled` recomputed every render, used as effect dep — `App.tsx:48-51`
29. Accuracy-based early stopping — noisy on imbalanced data — both train scripts
30. No gradient clipping for SincConv — `train_audio_sincconv.py:373-377`

---

## Priority Fix Order

1. **Rotate Supabase service_role key** (C1) — immediate, security
2. **Add `.dockerignore` files** (C2) — prevents secrets in images
3. **Fix trust score double-counting identity** (C5) — #1 accuracy bug
4. **Add `run_in_threadpool`** to async ML endpoints (C7) — blocks entire service
5. **Fix unread notification count** (C10) — use RPC as primary path
6. **Add threading locks** to MediaPipe/identity/temporal (C8, C9) — race conditions under load
7. **Fix `confidenceLayers.audio` type** (C6) — frontend type mismatch
8. **Move metrics broadcast after trust recomputation** (H7) — stale data sent to frontend
9. **Fix face crop double-resampling** (H11) — degrades deepfake detection quality
10. **Fix notification read-state leaking across users** (H20, H21) — security
