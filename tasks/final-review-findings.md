# RealSync Final Review — Consolidated Findings (29-03-2026)

Three independent reviews: CodeRabbit CLI, Claude Deep Review, Claude+Codex Dual Review.
Deduplicated and merged below. Previous C1-C15 / H1-H25 fixes verified as complete.

---

## CRITICAL — Fix Before RunPod Training (3)

### FC1 — Training accuracy threshold wrong for logits (0.5 should be 0.0)
- **Files:** `training/train_efficientnet_sbi.py:288,308`, `training/train_audio_sincconv.py:417,441`
- **Found by:** Claude, Codex (both independently)
- **Impact:** Both training scripts use `BCEWithLogitsLoss` (correct) but threshold accuracy at `(outputs > 0.5)`. For logits, 0.0 is the decision boundary (logit=0 → P=0.5). Using 0.5 means model needs P>0.62 to count as positive. **Training accuracy metrics are wrong**, early stopping may pick suboptimal checkpoint.
- **Fix:** Change `predicted = (outputs > 0.5).float()` → `predicted = (outputs > 0.0).float()` in both train AND validation loops of both files. Or: `predicted = (torch.sigmoid(outputs) > 0.5).float()`.

### FC2 — EfficientNet-B4 training has no gradient clipping
- **File:** `training/train_efficientnet_sbi.py:282-284`
- **Found by:** Claude
- **Impact:** Audio script clips at `max_norm=1.0` but EfficientNet (19M params) has none. Gradient spikes → NaN loss during RunPod training, especially with larger batch sizes.
- **Fix:** Add `torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)` between `loss.backward()` and `optimizer.step()`.

### FC3 — SBI blend mask generation uses Python loops (CPU bottleneck on RunPod)
- **File:** `training/train_efficientnet_sbi.py:100-120`
- **Found by:** Claude
- **Impact:** Pixel-by-pixel Python loop for 380x380 = 144,400 iterations per sample. DataLoader will be CPU-bound, wasting GPU hours on RunPod.
- **Fix:** Vectorize with `np.meshgrid` + distance formula + Gaussian blur.

---

## CRITICAL — Fix Before Deployment (3)

### FC4 — `.dockerignore` excludes `*.pth` — ALL model weights missing from Docker image
- **File:** `RealSync-AI-Prototype/.dockerignore:12`
- **Found by:** Claude, Codex (both independently)
- **Impact:** `*.pth` in `.dockerignore` means `COPY . .` skips all PyTorch weight files. AI service in Docker will have NO models — every analysis returns empty/mock results silently.
- **Fix:** Replace `*.pth` with `training/*.pth` or add `!src/models/*.pth` exception.

### FC5 — `session?.sessionId` always undefined in AlertFusion — should be `session?.id`
- **File:** `realsync-backend/lib/alertFusion.js:111`
- **Found by:** Claude, Codex (both independently, 98% confidence)
- **Impact:** `sessionId` resolves to `"unknown"` for ALL sessions. Consecutive frame tracking, cooldown keys are shared globally. Different sessions interfere with each other's alert logic.
- **Fix:** Change `session?.sessionId` → `session?.id`.

### FC6 — AbortController reused on retry — second request inherits ticking timer
- **File:** `realsync-backend/lib/aiClient.js:117-144`
- **Found by:** Codex
- **Impact:** On 429 retry, the same AbortController's timeout continues counting from original request. Retries get progressively less time — under load, all retries timeout.
- **Fix:** Create new `AbortController` + fresh timeout for retry request.

---

## HIGH — Fix Before Deployment (12)

### FH1 — Whisper model not in requirements.txt
- **File:** `RealSync-AI-Prototype/requirements.txt`
- **Found by:** Claude
- `openai-whisper` not listed. Fresh deploy (including RunPod Docker) → transcription silently fails.
- **Fix:** Add `openai-whisper>=20231117` to requirements.txt. Ensure `ffmpeg` in Dockerfile.

### FH2 — Whisper model loader not thread-safe
- **File:** `RealSync-AI-Prototype/serve/whisper_model.py:13-24`
- **Found by:** Claude, Codex (both)
- No `threading.Lock()` or `_LOAD_FAILED` sentinel. All other model loaders have this pattern.
- **Fix:** Add lock + sentinel matching `deepfake_model.py` pattern.

### FH3 — Deepfake calibration sigmoid steepness=300 — near-binary output
- **File:** `RealSync-AI-Prototype/serve/deepfake_model.py:147`
- **Found by:** Claude, Codex (both)
- `1/(1+exp(-300*(x-0.003)))` transitions in range 0.001-0.005. After RunPod tuning, model improvements will be masked by this step function.
- **Fix:** Reduce steepness to 50-100, or implement piecewise linear calibration post-tuning.

### FH4 — `_consecutiveLow` map never cleaned — unbounded memory growth
- **File:** `realsync-backend/lib/alertFusion.js:58,116-119`
- **Found by:** Claude, Codex (both)
- `cooldowns` has eviction but `_consecutiveLow` doesn't. Grows per session+faceId forever.
- **Fix:** Add `this._consecutiveLow = new Map()` to `reset()`. Add eviction similar to cooldowns.

### FH5 — Session creation before scheduledAt validation — orphaned sessions on error
- **File:** `realsync-backend/routes/sessions.js:63-75`
- **Found by:** Codex
- `createSession()` persists to Supabase, THEN validates `scheduledAt`. Invalid input → 400 response but session already created.
- **Fix:** Move validation before `createSession()`.

### FH6 — WavLM model not pre-downloaded in Dockerfile — 360MB download at runtime
- **File:** `RealSync-AI-Prototype/serve/audio_model.py:47`
- **Found by:** Claude
- `WavLMModel.from_pretrained("microsoft/wavlm-base")` downloads on first request. Health check reports "unavailable" until complete. No internet in production → permanent failure.
- **Fix:** Add `RUN python -c "from transformers import WavLMModel; WavLMModel.from_pretrained('microsoft/wavlm-base')"` to Dockerfile.

### FH7 — `notification_reads` left join filter excludes unread notifications
- **File:** `realsync-backend/lib/persistence.js:357`
- **Found by:** CodeRabbit
- `.eq("notification_reads.user_id", userId)` on LEFT JOIN filters out NULL rows (unread notifications). Users see only previously-read notifications.
- **Fix:** Use `.or('user_id.eq.${userId},user_id.is.null', { foreignTable: 'notification_reads' })`.

### FH8 — mediapipe version pinned too low for Tasks API
- **File:** `RealSync-AI-Prototype/requirements.txt:3`
- **Found by:** Codex
- Pinned `mediapipe==0.10.18` but code comment says Tasks API requires `>=0.10.28`. Fresh install may fail.
- **Fix:** Update to `mediapipe>=0.10.28`.

### FH9 — AI API key comparison is timing-attack vulnerable
- **File:** `RealSync-AI-Prototype/serve/app.py:151`
- **Found by:** Codex
- `if provided != AI_API_KEY` uses Python `!=` (not constant-time).
- **Fix:** Use `hmac.compare_digest(provided, AI_API_KEY)`.

### FH10 — STT stream error doesn't null the reference — subsequent writes fail silently
- **File:** `realsync-backend/services/audioHandler.js:24-31`
- **Found by:** Codex
- On STT error, `session.stt` still points to errored stream. Audio keeps writing to dead stream.
- **Fix:** Set `session.stt = null` in `onError` callback.

### FH11 — Temporal/transcript alert cooldowns not scoped per session
- **File:** `realsync-backend/lib/alertFusion.js:254,268`
- **Found by:** Codex
- Cooldown keys like `"temporal_trust_drop"` are global. Session A's alert blocks Session B for 30s.
- **Fix:** Prefix keys with `${session.id}_`.

### FH12 — `deriveMetrics` spreads raw payload — prototype pollution vector
- **File:** `realsync-backend/services/sessionManager.js:130`
- **Found by:** Codex
- `return { ...payload, ... }` copies ALL request body fields including potential `__proto__`. Broadcast to all subscribers.
- **Fix:** Explicitly pick known fields instead of spreading.

---

## MEDIUM — Fix When Possible (15)

### FM1 — ~20 duplicate files with spaces in names (macOS Finder artifacts)
- **Found by:** CodeRabbit (primary finding, very thorough)
- Files like `pytest 2.ini`, `constants 2.js`, `__init__ 2.py`, `bot 2.js`, `health 2.js`, `setup 2.js`, `Dockerfile 3`, `download_models 3.sh`, `download_models 4.sh`, etc.
- **Fix:** Delete all `* 2.*` / `* 3.*` / `* 4.*` files. Add `*.tsbuildinfo` to `.gitignore`.

### FM2 — Health endpoint returns 200 even when degraded
- **File:** `realsync-backend/routes/health.js:28`
- **Found by:** Codex
- Docker HEALTHCHECK uses `curl -f` which only fails on 4xx/5xx. Degraded = 200 → never detected.
- **Fix:** Return `res.status(allOk ? 200 : 503)`.

### FM3 — Whisper hardcodes English language
- **File:** `RealSync-AI-Prototype/serve/whisper_model.py:45`
- `language="en"` hardcoded. Non-English meetings get garbage transcription.
- **Fix:** Make configurable via env var or set to `None` for auto-detect.

### FM4 — Desktop notification permission requested without user gesture
- **File:** `Front-End/src/contexts/NotificationContext.tsx:207-217`
- Auto-requests after 2s. Modern browsers block non-gesture permission requests.
- **Fix:** Only request on user interaction (e.g., Settings toggle).

### FM5 — Race between auto-end on bot disconnect and manual session stop
- **File:** `realsync-backend/ws/ingest.js:159-202`
- Both paths set `endedAt` and call `generateReport()`. Report generated twice.
- **Fix:** Guard with `if (session.endedAt) return;` at top of socket close handler.

### FM6 — Multiple `socket.on("close")` handlers with redundant cleanup
- **File:** `realsync-backend/ws/ingest.js:159,208,352`
- Three separate close handlers, two call `session.stt?.end?.()`. Maintenance hazard.
- **Fix:** Consolidate into single handler.

### FM7 — GCP STT stub timer runs for all sessions (generates duplicate transcripts)
- **File:** `realsync-backend/lib/gcpStt.js:29-42`
- Stub generates transcripts every 6s even when bot provides real captions.
- **Fix:** Check `session.botStreams.captions` before writing.

### FM8 — Whisper `transcribe_audio` doesn't validate base64 input
- **File:** `RealSync-AI-Prototype/serve/whisper_model.py:39`
- No `validate=True`, no odd-byte PCM check. Invalid input → silent corruption.
- **Fix:** Add `validate=True` + odd-byte check.

### FM9 — `finetune_deepfake_head.py` may double-sigmoid with BCEWithLogitsLoss
- **File:** `training/finetune_deepfake_head.py:43-44`
- Imports `EfficientNetDeepfake` which has sigmoid in `forward()`. If loss is `BCEWithLogitsLoss` → double-sigmoid.
- **Fix:** Verify loss function. Create logits-only subclass if needed.

### FM10 — `/api/models` reports wrong model names
- **File:** `realsync-backend/routes/health.js:44-45`
- Reports "FER2013/AffectNet CNN" (real: MobileNetV2) and "XceptionNet+EfficientNet" (real: EfficientNet-B4-SBI).
- **Fix:** Update to actual model names.

### FM11 — Frontend `sourceStatus: disconnected` clears session — user loses data
- **File:** `Front-End/src/components/screens/DashboardScreen.tsx:234-236`
- Bot disconnect calls `onEndSession()` → clears session → dashboard resets to idle. User can't see results.
- **Fix:** Set "session ended" flag, keep data visible, let user dismiss manually.

### FM12 — `console.warn` in production DashboardScreen
- **File:** `Front-End/src/components/screens/DashboardScreen.tsx:284`
- `console.warn('Bot leave request failed...')` left in production code.

### FM13 — `start.sh` venv activation may not carry to backgrounded process
- **File:** `start.sh:17`
- `source .venv/bin/activate && python3 -m serve.app &` — background may not inherit venv.
- **Fix:** Use full path: `.venv/bin/python -m serve.app &`.

### FM14 — `_inference_pool` ThreadPoolExecutor never shut down
- **File:** `RealSync-AI-Prototype/serve/inference.py:53`
- Module-level thread pool not cleaned up on graceful shutdown.
- **Fix:** Add `_inference_pool.shutdown(wait=False)` to lifespan teardown.

### FM15 — `toPercent` edge case at v ≈ 1.0 (floating point)
- **File:** `Front-End/src/components/screens/DashboardScreen.tsx:107-112`
- **Found by:** CodeRabbit
- `v > 1` threshold means `1.0001` (floating point error) treated as already-percentage. Returns 1%.
- **Fix:** Use threshold `v > 1.5` or clamp: `Math.min(100, Math.max(0, ...))`.

---

## Priority Execution Order

### Phase 1: Before RunPod Training (do FIRST)
1. **FC1** — Fix accuracy threshold in both training scripts
2. **FC2** — Add gradient clipping to EfficientNet training
3. **FC3** — Vectorize SBI mask generation

### Phase 2: Before Deployment
4. **FC4** — Fix `.dockerignore` `*.pth` exclusion
5. **FC5** — Fix `session?.sessionId` → `session?.id` in alertFusion
6. **FC6** — Fix AbortController reuse on retry
7. **FH1** — Add whisper to requirements.txt
8. **FH2** — Thread-safe whisper model loader
9. **FH6** — Pre-download WavLM in Dockerfile
10. **FH7** — Fix notification_reads left join
11. **FH8** — Update mediapipe version
12. **FH9** — Constant-time API key comparison
13. **FH12** — Sanitize deriveMetrics payload
14. **FM1** — Delete all duplicate files with spaces

### Phase 3: Before Production
15. **FH3** — Re-evaluate deepfake calibration post-tuning
16. **FH4-FH5, FH10-FH11** — AlertFusion + session fixes
17. **FM2-FM15** — Remaining medium issues

---

## Stats

| Severity | Count | Before Training | Before Deploy | Before Prod |
|----------|-------|-----------------|---------------|-------------|
| CRITICAL | 6 | 3 | 3 | — |
| HIGH | 12 | — | 12 | — |
| MEDIUM | 15 | — | 1 (FM1) | 14 |
| **Total** | **33** | **3** | **16** | **14** |
