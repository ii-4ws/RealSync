# RealSync Development Log

> Engineering history of the RealSync real-time meeting intelligence platform.
> Last updated: 2026-03-02

---

## Project Overview

RealSync is a real-time meeting intelligence platform that detects deepfakes, voice cloning, social engineering, and emotional manipulation during live video calls. It joins Zoom meetings through a headless browser bot, captures video frames and audio, runs six ML models against the streams, and surfaces alerts on a live dashboard.

Built as a CSIT321 capstone project at the University of Wollongong in Dubai. Deployed at [real-sync.app](https://real-sync.app).

**Architecture**: Three services -- React frontend, Node.js backend with WebSocket, Python FastAPI AI service -- backed by Supabase PostgreSQL. See `docs/CODEMAP.md` for the full codebase map.

---

## Current Status

**Working:**
- Frontend: all 6 screens, dark/light mode, real-time WebSocket updates, notification system with desktop alerts
- Backend: session lifecycle, Zoom bot management (real + stub modes), alert fusion engine, Supabase persistence, fraud detection (keyword + NLI)
- AI service: 6 models loaded and health-checked (deepfake, emotion, identity, audio, text, face detection)
- Zoom bot: headless Puppeteer joins meetings, captures frames at 0.5 FPS, captures audio at 16kHz, scrapes captions and participant names
- Multi-participant detection: per-face analysis with individual cooldown timers, up to 6 faces
- Notification system: in-app bell with category filtering, native desktop notifications, severity-based filtering

**In Progress:**
- EfficientNet-B4 deepfake model -- **92.33% validation accuracy** at epoch 14 (best checkpoint saved; training interrupted at epoch 17/30)
- AASIST audio deepfake model re-training -- best checkpoint 54.8% val accuracy at epoch 5; re-training with optimized hyperparameters

**Pending:**
- End-to-end testing with a live Zoom session after model training completes
- Production deployment to Railway (backend + AI) and Cloudflare Pages (frontend)
- Supabase storage bucket for user avatars
- Address remaining code review findings (trust score double-count, thread safety gaps)

---

## Development Timeline

### Phase 1: Foundation (Jan 19 -- Jan 24, 2026)

Repository initialized with README and git workflow guidelines (branching conventions, commit message standards). The React + Vite + TypeScript frontend was scaffolded with the initial screen layout, Tailwind CSS, and shadcn/ui component library. First PR merged the frontend draft into main.

**Key commits:**
- `65b9263` Initial commit (Jan 19)
- `d0dcfc7` Create frontend (Jan 20)
- `3e8249d` Front-End Draft (Jan 21)
- `b03a301` Merge PR #1: Front-End (Jan 24)

### Phase 2: Demo V1 and Backend (Jan 28, 2026)

Built the Node.js + Express backend with WebSocket support, the Zoom bot using Puppeteer headless Chromium, and the first AI prototype. The AI service initially used MesoNet-4 (2018) for deepfake detection and FER for emotion recognition. Backend WebSocket metrics were wired to the dashboard.

Four commits in a single day hardened the pipeline for Apple Silicon (MPS backend for PyTorch, MediaPipe compatibility).

**Key commits:**
- `3327b81` Demo V1 (Jan 28)
- `026cb6e` AI Prototype Creation (Jan 28)
- `eb03fa7` Add backend websocket metrics and dashboard integration (Jan 28)
- `33e7080` Harden pipeline for Apple Silicon and enrich results (Jan 28)

### Phase 3: Demo Day Fix and Prototype Polish (Feb 3 -- Feb 11, 2026)

Fixed remaining issues for the first demo on an M2 Mac. Added Git LFS for large media files. Scaffolded live transcript and meeting-type suggestion features.

The "Final Prototype" commit (`17bcade`, Feb 9) consolidated the full platform: all frontend screens, backend session management, Zoom bot with frame/audio capture, AI inference pipeline, Supabase integration, and the alert system.

Follow-up commits added light mode with a toggle in settings, fixed a security exposure (hardcoded credentials removed), resolved backend bugs (profile photo, session handling), and merged the Bug-fixed branch via PR #3.

**Key commits:**
- `fac941c` Fixed the app for demo day on M2 Mac (Feb 3)
- `1fbf03e` Live transcript + meeting-type suggestions scaffold (Feb 3)
- `17bcade` RealSync Final Prototype -- Full platform release (Feb 9)
- `fd2dd65` Added light mode + switch toggle in general settings (Feb 11)
- `be1f225` Fixed security exposure (Feb 11)
- `bee2453` Merge PR #3: Bug-fixed (Feb 11)

### Phase 4: Security and Dependency Updates (Feb 11 -- Feb 21, 2026)

Five Dependabot-triggered security updates addressed vulnerabilities in upstream dependencies:

- `c4d7293` Bump qs (prototype pollution)
- `d0d1e38` Bump vite (build-time vulnerability)
- `ec0c21e` Bump jspdf (arbitrary code execution)
- `72e8626` Bump basic-ftp (connection security)
- `943d9c5` Bump minimatch (ReDoS)

### Phase 5: AI Pipeline Upgrade (Feb 21 -- Mar 1, 2026)

The original AI stack had significant limitations: MesoNet-4 produced 48% authenticity scores on real Zoom video (false positives from compression artifacts), FER emotion detection was broken (`pkg_resources` removed in modern Python), and the audio deepfake model existed but was never integrated. A 7-phase upgrade replaced every detection model.

#### Phase 5.1: Emotion Model Replacement
Replaced the broken FER library with a custom MobileNetV2 model (1280 -> 256 -> 7 classes). Weights already existed from prior training (`emotion_weights.pth`). Removed the `tensorflow` and `fer` dependencies entirely. The 7-class output maps "disgust" into "angry" for a cleaner 6-class API surface.

#### Phase 5.2: EfficientNet-B4 Deepfake Detector
Replaced MesoNet-4 (400K params, 2018) with EfficientNet-B4 (19M params). The model uses Self-Blended Image (SBI) augmentation for cross-dataset generalization. Initial training used SBI self-blending on real faces only, which proved too subtle (61% max accuracy). Switched to labeled real/fake data from `Hemg/deepfake-and-real-images` (5K real + 5K fake), reaching 84.6% validation accuracy by epoch 2 with training ongoing.

**Training infrastructure built:**
- `training/finetune_deepfake_labeled.py` -- differential learning rates (backbone 3e-5, head 1e-3), freeze blocks 0-3, cosine annealing, early stopping
- `training/finetune_deepfake_head.py` -- SBI self-blend approach (abandoned at 61%)

#### Phase 5.3: Temporal Analysis Wiring
The AI service already computed temporal anomalies (trust score smoothing, identity switch detection, emotion volatility). This phase wired those signals into the backend's alert fusion engine. Three anomaly types generate alerts: `sudden_trust_drop`, `identity_switch`, and `emotion_instability`.

#### Phase 5.4: AASIST Audio Deepfake Detection
Built an end-to-end audio analysis pipeline. The Zoom bot already captured PCM16 mono audio at 16kHz -- this phase added accumulation in the backend (8 chunks = 4 seconds), a new `/api/analyze/audio` endpoint, and the AASIST model with SincConv encoder. Trained on ASVspoof 2019 LA dataset.

**Training lesson:** The `LanceaKing/asvspoof2019` HuggingFace dataset uses deprecated loading scripts. Switched to `Bisher/ASVspoof_2019_LA`. Also discovered that `NUM_WORKERS=0` is required (multiprocessing deadlocks with audio decoding) and that `TARGET_LENGTH=16000` (1 second) makes training 4x faster while preserving model quality (SincConv is length-agnostic).

#### Phase 5.5: DeBERTa-v3 Text Analysis
Added behavioral text analysis using `MoritzLaurer/deberta-v3-base-zeroshot-v2.0` zero-shot classification. Five behavioral hypotheses detect urgency pressure, credential requests, authority impersonation, emotional manipulation, and isolation tactics. The model auto-downloads from HuggingFace (~700MB) on first use and is pre-cached in Docker builds.

#### Phase 5.6: Trust Score Redesign
Replaced the simple average of three signals with a weighted composite that adapts to available modalities:
- **3-signal (no audio):** 0.47 video + 0.33 identity + 0.20 behavior
- **4-signal (with audio):** 0.35 video + 0.25 audio + 0.25 identity + 0.15 behavior
- **Camera off:** 0.60 audio + 0.40 behavior

See `AI_SERVICE_REPORT.md` Section 3 for the full formula.

#### Phase 5.7: Camera-Off Mode
Added graceful degradation when a participant turns off their camera. After 5 consecutive frames with no detected face, the system switches to audio-only analysis. The dashboard shows an "Audio-only analysis" indicator and greys out the video confidence bar.

**Key commits:**
- `79da89f` AI training has begun (Feb 21)
- `f64a206` More Training (Feb 21)
- `e751178` More training (Feb 22)
- `94ff710` Fixed system vulnerabilities (Feb 23)

### Phase 6: Bug Fixes and Hardening (Feb 27, 2026)

A comprehensive code review identified 43 issues across the backend, AI service, and frontend. All were addressed in a single commit. Key fixes included:

- **Sessions lost on restart** -- Added lazy rehydration from Supabase when a WebSocket client requests a session not in memory. The GET `/api/sessions` endpoint now merges in-memory and historical sessions.
- **Connecting overlay broken** -- Added `botProgress` state with per-step updates (creating -> joining -> streaming) and auto-dismiss after streaming confirmed.
- **Bot stays in Zoom after kill** -- Added stale Chromium process cleanup on startup via `pgrep`/`process.kill`.
- **MediaPipe face detection failing** -- Changed `model_selection=0` (short-range, correct for webcam) and lowered `FACE_CONFIDENCE_THRESHOLD` from 0.65 to 0.4.
- **Zoom popups covering faces** -- Added `_dismissZoomPopups()` to the bot adapter, dismissing overlay elements every 30 seconds.
- **Bot status stuck on "idle"** -- Set `botStatus = "joining"` in the join endpoint and send current status on WebSocket subscribe handshake.

Additional features implemented during hardening:
- **Multi-participant detection** -- Per-face alert evaluation with individual cooldown timers, capped at 6 faces per frame
- **Full participant tracking** -- Zoom DOM scraping for participant names with face-to-name mapping
- **Notification system** -- In-app NotificationBell component with category filtering, native desktop notification support via the Notification API, severity-based filtering persisted to localStorage, and Supabase-backed read-state tracking

**Key commit:**
- `497e2c6` Fix: address 43 critical and important issues across backend, AI service, and frontend (Feb 27)

### Phase 7: Code Review (Feb 28, 2026)

Eight parallel code review agents analyzed the entire codebase and produced a findings report. Results:

- **15 critical issues:** Live Supabase service_role key in `.env` on disk, no `.dockerignore` (secrets baked into Docker images), `torch.load(weights_only=False)` (arbitrary code execution risk), trust score double-counts identity signal, `confidenceLayers.audio` always null, CPU-bound ML inference blocking async event loop, MediaPipe not thread-safe, train on 1s clips but infer on 4s clips (distribution mismatch)
- **25 high issues:** Missing auth on POST `/api/metrics`, frames processed after session stop, audio buffer grows unbounded, face crop double-resampled (loses texture), DeBERTa blocks event loop, notification read-state leaks across users
- **30 medium issues:** Various code quality and consistency findings

Documented in `tasks/code-review-findings.md`. Several critical findings were addressed immediately (torch.load safety, run_in_threadpool for inference), while others remain pending.

### Phase 8: Model Training Campaign (Feb 28 -- Mar 1, 2026)

With the pipeline code complete, focus shifted to model training:

**EfficientNet-B4 (video deepfake):**
Downloaded 10K labeled face images (5K real + 5K fake) from `Hemg/deepfake-and-real-images`. First attempt with SBI self-blending on real faces only reached 61% -- the self-blended artifacts were too subtle for the model to learn from. Switched to direct labeled classification with differential learning rates and ImageNet-pretrained backbone. Training progression: epoch 1 (78.9%) -> epoch 7 (90.0%) -> epoch 14 (92.33%, best checkpoint) -> epochs 15-17 plateau. Training interrupted at epoch 17/30; early stopping (patience 8) would likely have triggered around epoch 22.

**AASIST (audio deepfake):**
Trained on ASVspoof 2019 LA with SincConv encoder. Re-training with optimized hyperparameters (lr=1e-4, batch=32, 50 epochs, 3-epoch linear warmup + cosine decay). Early epochs show rapid convergence.

**Key commit:**
- `f679cd4` Remove bloat from git tracking (Mar 1)

### Phase 9: Documentation (Mar 1 -- Mar 2, 2026)

Created comprehensive project documentation:
- `docs/CODEMAP.md` -- File-level codebase map with architecture diagrams and data flow
- `docs/DEVELOPMENT_LOG.md` -- This file: chronological engineering history
- `AI_SERVICE_REPORT.md` -- Current AI model status with accuracy figures and trust score formulas

---

## Key Technical Decisions

### Three-Service Architecture
Separated the frontend, backend, and AI service into independent processes. The AI service runs heavy ML models that benefit from Python's ecosystem (PyTorch, transformers, MediaPipe). The Node.js backend handles WebSocket connections and real-time event routing efficiently. The React frontend provides a responsive SPA. This separation allows independent scaling -- the AI service can run on a GPU instance while the backend stays on a CPU node.

### Puppeteer for Zoom Integration
Chose headless Chromium via Puppeteer over the Zoom SDK. The SDK requires a paid plan and native binary distribution. Puppeteer joins meetings as a regular browser participant, captures frames via screenshots, and scrapes captions from the DOM. Trade-off: more fragile (Zoom UI changes can break selectors) but zero licensing cost and works on any deployment target.

### Supabase over Self-Hosted PostgreSQL
Supabase provides managed PostgreSQL with Row-Level Security, real-time subscriptions, and auth -- all required for the platform. The free tier covers development and demo needs. RLS policies ensure users only see their own sessions and alerts. A service role key bypasses RLS for the backend's server-side operations.

### EfficientNet-B4 over MesoNet-4
MesoNet-4 (2018, 400K params) was designed for pristine face-swap images. Zoom's video compression introduces artifacts that trigger false positives. EfficientNet-B4 (19M params) with SBI augmentation generalizes better across compression levels and deepfake generation methods. The 6x latency increase (50ms -> ~300ms per frame) is acceptable at 0.5 FPS capture rate.

### Zero-Shot NLI over Fine-Tuned Classifier for Text
DeBERTa-v3 zero-shot classification requires no training data -- it evaluates transcript text against natural language hypotheses like "This person is pressuring someone to act urgently." This catches novel social engineering patterns that a regex or keyword system would miss. Trade-off: higher latency (~200ms per classification) and occasional false positives on benign urgent language.

### Alert Fusion with Cooldowns
Rather than firing an alert for every anomalous frame, the AlertFusionEngine enforces per-category cooldowns (30-120 seconds depending on severity). This prevents alert fatigue while ensuring critical events (identity switches, sudden trust drops) still surface immediately. Visual risk amplification boosts text/audio alert severity when the video deepfake score is already suspicious.

### Graceful Degradation at Every Level
Every subsystem has a dev-friendly fallback: no Supabase (stub persistence), no AI service (mock responses), no GCP credentials (stub STT), no real bot (stub frame/caption loop). The system degrades gracefully without any external services, which accelerates development and prevents cascading failures in production.

---

## Lessons Learned

### Model Training
1. **SBI self-blending is too subtle for small datasets.** The self-blended artifacts on real face images are barely perceptible, and the model can't distinguish them from normal JPEG compression. Labeled real/fake data produces far better results.
2. **Always use BCEWithLogitsLoss, not BCELoss with sigmoid.** Applying sigmoid before BCELoss causes extreme gradient instability (loss values 30+). BCEWithLogitsLoss is numerically stable.
3. **HuggingFace audio datasets require NUM_WORKERS=0.** Multiprocessing with audio decoding causes deadlocks. Single-threaded loading is slower but reliable.
4. **SincConv training speed scales linearly with input length.** Reducing `TARGET_LENGTH` from 64000 to 16000 made training 4x faster with no accuracy loss (the model is length-agnostic at inference time).
5. **ImageNet pretrained weights matter.** Random weight initialization for EfficientNet-B4 produced slow convergence. Loading ImageNet pretrained backbone and freezing early layers (blocks 0-3) gave immediate gains.

### Integration
6. **MediaPipe model_selection matters.** `model_selection=1` (full-range, 2-5m) cannot detect close-up Zoom faces. `model_selection=0` (short-range, <2m) is correct for webcam video.
7. **Zoom popup dialogs cover faces.** The bot must actively dismiss "Floating reactions", "meeting chats", and other overlay elements that appear after joining.
8. **WebSocket late-join state is critical.** If the dashboard connects after a `sourceStatus` broadcast, it misses the bot's current state. The subscribe handshake must send the full current state, not just metrics.

### Architecture
9. **In-memory session state needs a Supabase fallback.** Sessions stored only in a Map are lost on backend restart. Lazy rehydration from Supabase when a client requests an unknown session ID solves this without loading everything at startup.
10. **Mock fallbacks prevent cascading failures.** Every AI service call falls back to mock/simulated data on timeout. The dashboard continues working with degraded data quality rather than failing entirely.
11. **Per-face cooldown keys prevent alert duplication.** When multiple participants are in frame, each face needs its own cooldown timer. A shared cooldown would suppress alerts for face B because face A triggered recently.

---

## File Inventory

For the complete file-by-file codebase map, see `docs/CODEMAP.md`.

For the AI model inventory with accuracy figures and training details, see `AI_SERVICE_REPORT.md`.

For the database schema and migration SQL, see `contracts/supabase-migration.sql`.

For deployment instructions, see `docs/DEPLOYMENT.md`.
