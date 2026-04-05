# RealSync — Handoff Document

> Last updated: 2026-04-06. Branch: `clip-detection`.
> Deadline: April 9 code freeze, April 13 midnight submission.

---

## What Was Done

### The Problem
The EfficientNet-B4-SBI deepfake detection model was completely broken on Zoom video. Ahmed's test data showed real faces scored 0.48 avg and inswapper fakes scored 0.70 avg — **inverted** (separation: -0.23). The model detected pixel-level blending artifacts that Zoom's H.264 compression destroys.

### The Fix (Branch: `clip-detection`)

**4 commits, +409 lines, -8,589 lines across 44 files.**

| Commit | What |
|--------|------|
| `0583987` | Removed broken EfficientNet, ensemble, heuristics, ViT, text, whisper, all training scripts |
| `3c5d977` | Added CLIP ViT-L/14 deepfake model + SPRT session accumulator |
| `87444d9` | Canvas capture JPEG→PNG, cleaned deps and Dockerfile |
| `d6d955e` | Removed all remaining unused scripts, duplicates, old training files |

### Results

**Tested on Ahmed's Zoom screenshots (10 real + 9 fake JPG, 10 real + 10 fake PNG):**

| Metric | Before (EfficientNet) | After (CLIP + face crop) |
|--------|----------------------|--------------------------|
| Real avg | 0.48 | **0.65** |
| Fake avg | 0.70 | **0.36** |
| Separation | -0.23 (INVERTED) | **+0.29** |
| Real > 0.50 | ~5/10 | **15/20** |
| Fake < 0.50 | ~3/9 | **13/19** |
| SPRT → "real" | N/A | **5 frames (7.5 sec)** |
| SPRT → "fake" | N/A | **2 frames (3 sec)** |

**By format (with face detection crop):**

| Format | Real avg | Fake avg | Separation |
|--------|----------|----------|------------|
| JPEG | 0.79 | 0.41 | +0.38 |
| PNG | 0.51 | 0.30 | +0.21 |

Tests: **34 passed, 0 failed.**

---

## Architecture (Current)

```
Zoom Meeting
  ↓
ZoomBotAdapter.js — captures PNG frames (was JPEG q95)
  ↓
Backend (Node.js) — forwards via HTTP POST
  ↓
AI Service (FastAPI, port 5100)
  ↓
1. Face Detection (MediaPipe BlazeFace) — crops face from frame
  ↓
2. CLIP Deepfake Detection (GenD CLIP ViT-L/14) — semantic authenticity score
   + Emotion (EfficientNet-B2) — runs in parallel
  ↓
3. SPRT Accumulator — accumulates scores across session, decides at 95% confidence
  ↓
4. Temporal Analyzer (EWMA) — smooths trust score, detects anomalies
  ↓
Response: {faces, aggregated: {deepfake, emotion, trustScore, sprt, temporal}}
```

### Models

| Model | File | Status | Latency |
|-------|------|--------|---------|
| CLIP ViT-L/14 (deepfake) | `serve/clip_deepfake_model.py` | Working (CUDA) | ~50ms GPU |
| EfficientNet-B2 (emotion) | `serve/emotion_model.py` | Working (CUDA) | ~15ms GPU |
| WavLM (audio deepfake) | `serve/audio_model.py` | Needs weights | N/A |
| MediaPipe (face detection) | `serve/inference.py` | Working (CPU) | ~5ms |
| SPRT (session decisions) | `serve/sprt_detector.py` | Working | <1ms |

### File Structure

```
RealSync-AI-Prototype/
├── serve/
│   ├── app.py                  ← FastAPI server (health, frame, audio endpoints)
│   ├── clip_deepfake_model.py  ← NEW: GenD CLIP ViT-L/14 deepfake detection
│   ├── sprt_detector.py        ← NEW: Sequential Probability Ratio Test
│   ├── inference.py            ← REWRITTEN: CLIP + emotion pipeline
│   ├── config.py               ← REWRITTEN: CLIP + SPRT config
│   ├── emotion_model.py        ← Kept (EfficientNet-B2 emotion)
│   ├── audio_model.py          ← Kept (WavLM, needs weights training)
│   ├── temporal_analyzer.py    ← Kept (EWMA, generic)
│   └── __init__.py
├── tests/                      ← 34 tests, all passing
├── scripts/benchmark.py        ← Endpoint latency benchmarking
├── src/models/
│   ├── blaze_face_short_range.tflite  ← Face detection
│   └── emotion_weights.pth            ← Emotion model
├── Dockerfile                  ← Updated: CLIP pre-download
├── requirements.txt            ← Updated: removed whisper/torchaudio, added huggingface_hub
├── realsync-ai.service         ← systemd auto-restart
└── nginx/realsync-ai.conf      ← Reverse proxy config
```

---

## How To Run

```bash
cd ~/RealSync/RealSync-AI-Prototype
git checkout clip-detection
source .venv/bin/activate

# Install deps (if needed)
pip install -r requirements.txt

# Start AI service
python -m serve.app
# Health: curl http://localhost:5100/api/health

# Run tests
pytest tests/ -v

# Benchmark
python scripts/benchmark.py
```

### RunPod (for GPU)
```bash
# SSH: ssh root@157.157.221.29 -p 22014 -i ~/.ssh/id_ed25519
# Pod ID: p32q2t4crhraji — STOP WHEN NOT IN USE ($0.27/hr)
cd /workspace/RealSync-fresh/RealSync-AI-Prototype
git fetch origin clip-detection && git checkout clip-detection
pip install -r requirements.txt
python -m serve.app
```

---

## What Still Needs To Be Done

### CRITICAL (Before Code Freeze — April 9)

#### 1. Test with Live Zoom Call (2-3 hours)
The CLIP model was tested on static screenshots. Need to validate with actual real-time Zoom frames flowing through the full pipeline (bot → backend → AI service → response).

**Steps:**
1. Start AI service on RunPod or local GPU
2. Start backend: `cd realsync-backend && npm start`
3. Start a Zoom meeting
4. Bot joins, captures PNG frames via canvas
5. Watch AI service logs for CLIP scores and SPRT decisions
6. Verify SPRT converges to correct decision within 30 seconds

**What could go wrong:**
- `canvas.toDataURL()` may not work in headless Chromium (fallback: keep page.screenshot with PNG)
- Zoom web client DOM may have changed — canvas selector might not find the video element
- Frame rate may be too low for SPRT to converge quickly

#### 2. Train WavLM Audio Model (3-7 hours on RunPod)
The audio deepfake detection model has no trained weights. The training script was deleted in the cleanup but the `serve/audio_model.py` is still there and expects `src/models/wavlm_audio_weights.pth`.

**Options:**
- Re-create training script from git history: `git show main:RealSync-AI-Prototype/training/train_audio_wavlm.py`
- Or train on RunPod using the old main branch training scripts
- Dataset: ASVspoof 2019 LA (auto-downloads from HuggingFace, ~4GB)
- Command: `python training/train_audio_wavlm.py --batch-size 8 --epochs 20`
- Output: `src/models/wavlm_audio_weights.pth`

#### 3. Connect Frontend-v2 to Backend (4-6 hours)
The React frontend exists but is NOT connected to the backend WebSocket. This is the main UI work.

**What's needed:**
- WebSocket connection from frontend to backend
- Display real-time trust score, SPRT decision, emotion
- Show alerts when SPRT decides "fake"
- Session management (start/stop monitoring)

**Files:** `frontend-v2/` directory (React + Vite, port 5175)

#### 4. Deploy Frontend-v2 (1-2 hours)
Currently the landing page is at real-sync.app but the app is not deployed.

**Steps:**
- Build: `cd frontend-v2 && npm run build`
- Deploy to Cloudflare Pages or Netlify at real-sync.app/app

#### 5. Merge `clip-detection` → `main` and Push
Once E2E testing passes:
```bash
git checkout main
git merge clip-detection
git push origin main
```

#### 6. Invite Professor to GitHub (2 minutes)
**NOT DONE.** Go to github.com/AtwaniGG/RealSync → Settings → Collaborators → Add `mayelbarachi`

### HIGH PRIORITY (Before Submission — April 13)

#### 7. E2E Rehearsal (2-3 hours)
Full flow: browser → login → start session → Zoom bot joins → live detection → dashboard shows results → generate report.

#### 8. YouTube Demo Video (3-4 hours)
4-5 minute video showing:
- Login to RealSync
- Start a monitoring session
- Join a Zoom call (real face → high trust)
- Switch to deepfake (Deep Live Cam) → trust drops, alert fires
- Show the dashboard, PDF report
- Record with OBS

#### 9. Final Report (4-6 hours)
Academic report covering:
- Problem statement (deepfake threat in video calls)
- System architecture
- Detection approach (CLIP + SPRT + temporal analysis)
- Results (separation metrics, SPRT convergence)
- Limitations and future work

#### 10. Redo Poster (2-3 hours)
Ahmed rejected v1. Needs redesign following brand guidelines in `BRAND_IDENTITY.md`.

### MEDIUM PRIORITY (Nice to Have)

#### 11. ArcFace Identity Enrollment (Backup Detection — 2-3 hours)
If CLIP + SPRT accuracy isn't sufficient in live testing, add ArcFace one-shot enrollment:
- Capture reference face embedding at session start
- Track cosine similarity per frame
- Alert on >0.30 cosine drop (identity swap)
- Implementation: `insightface` library, `buffalo_sc` model
- This catches identity swaps that CLIP might miss

#### 12. SPRT Parameter Tuning (30 min)
Current SPRT is calibrated from 19 test images. After live Zoom testing, recalibrate with real production scores:
```python
# Update serve/config.py:
SPRT_REAL_MEAN = <new value from live real scores>
SPRT_FAKE_MEAN = <new value from live fake scores>
SPRT_SCORE_STD = <new value>
```

#### 13. Canvas captureStream() (Advanced — 1-2 hours)
Current fix switches JPEG→PNG in `page.screenshot()`. The next level is `canvas.captureStream()` which captures raw decoded video at higher FPS:
```javascript
const canvas = document.querySelector('canvas');
const stream = canvas.captureStream(2);  // 2 FPS
```
This eliminates the Puppeteer screenshot layer entirely. Higher risk (DOM dependency) but highest quality.

#### 14. Stress Testing (1 hour)
10 concurrent frame requests, monitor GPU memory, check for OOM or timeouts.

#### 15. Delete `coderabbitai` Branch from Origin
```bash
git push origin --delete coderabbitai/docstrings/5522913
```

---

## Git Workflow

- **Main repo:** github.com/AtwaniGG/RealSync (origin)
- **Ahmed's fork:** github.com/ahmedwais-012/RealSync (ahmed remote)
- **Current branch:** `clip-detection` (pushed to origin)
- **NO AI traces** in commits — no Co-Authored-By, no Claude/Copilot mentions
- **Conventional commits:** `feat:`, `fix:`, `docs:`, `refactor:`, `cleanup:`

---

## Key Config (serve/config.py)

```python
# Deepfake thresholds
DEEPFAKE_AUTH_THRESHOLD_LOW_RISK = 0.70   # > 0.70 = low risk (real)
DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK = 0.40  # < 0.40 = high risk (fake)

# SPRT (calibrated from Ahmed's Zoom screenshots)
SPRT_ALPHA = 0.05          # False positive rate
SPRT_BETA = 0.05           # False negative rate
SPRT_REAL_MEAN = 0.7645    # Expected CLIP score for real faces
SPRT_FAKE_MEAN = 0.6419    # Expected CLIP score for fake faces
SPRT_SCORE_STD = 0.1726    # Score standard deviation

# Trust score weights
TRUST_WEIGHT_VIDEO = 0.55   # 55% from deepfake authenticity
TRUST_WEIGHT_BEHAVIOR = 0.45 # 45% from emotion confidence
```

---

## API Endpoints

```
GET  /api/health              → Model status (clip_deepfake, emotion, face_detection, audio)
POST /api/analyze/frame       → Send base64 PNG/JPEG, get deepfake + emotion + SPRT decision
POST /api/analyze/audio       → Send base64 PCM16, get audio deepfake score (needs WavLM weights)
```

### Frame Response Shape
```json
{
  "sessionId": "uuid",
  "capturedAt": "ISO8601",
  "processedAt": "ISO8601",
  "faces": [{
    "faceId": 0,
    "bbox": {"x": 100, "y": 50, "w": 200, "h": 200},
    "confidence": 0.95,
    "emotion": {"label": "Neutral", "confidence": 0.85, "scores": {...}},
    "deepfake": {"authenticityScore": 0.82, "riskLevel": "low", "model": "GenD-CLIP-ViT-L14"}
  }],
  "aggregated": {
    "emotion": {...},
    "deepfake": {"authenticityScore": 0.82, "riskLevel": "low", "model": "GenD-CLIP-ViT-L14"},
    "trustScore": 0.78,
    "sprt": {
      "decision": "real",
      "confidence": 0.95,
      "framesAnalyzed": 5,
      "logLikelihoodRatio": -3.21
    },
    "confidenceLayers": {"audio": null, "video": 0.82, "behavior": 0.92},
    "temporal": {
      "smoothedTrustScore": 0.80,
      "trendDirection": "stable",
      "volatility": 0.02,
      "frameCount": 5,
      "anomalies": []
    }
  }
}
```

---

## Brand Guidelines

Colors, fonts, design system: see `BRAND_IDENTITY.md` in repo root.
- Background: #0F0F1E
- Cyan accent: #22D3EE
- Blue: #3B82F6
- Severity: green (safe) → yellow (medium) → orange (high) → red (critical)

---

## Test Data Locations

| Location | Contents |
|----------|----------|
| `RealSync-AI-Prototype/data/test-ahmed/` | 10 real + 9 fake JPEG (Ahmed's Zoom screenshots) |
| `/home/kali/321_test/combined_test/` | 20 real + 19 fake (JPG + PNG mixed) |
| `RealSync-AI-Prototype/data/self_faces/` | 2 face photos for testing |
| `RealSync-AI-Prototype/data/audio_test/` | 4 synthetic audio samples for WavLM testing |

---

## Backup Plans

If CLIP + SPRT isn't enough in live testing:
1. **LN-tune CLIP** on Ahmed's 19 images (5 min, 0.03% of params, zero forgetting risk)
2. **DF40 CLIP-Large** checkpoint (trained WITH InSwapper in dataset, Google Drive download)
3. **ArcFace identity enrollment** (2 hours, catches identity swaps independently of visual artifacts)
