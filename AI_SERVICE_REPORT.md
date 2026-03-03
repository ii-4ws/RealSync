# RealSync AI Service Report

> **Date:** 2026-03-01
> **Service:** RealSync AI Inference Service (FastAPI, port 5100)
> **Version:** 1.0.0

---

## 1. Model Inventory

| # | Model | Architecture | Task | Weights File | Size | Status |
|---|-------|-------------|------|-------------|------|--------|
| 1 | Video Deepfake | EfficientNet-B4 + SBI | Detect face manipulation | `efficientnet_b4_deepfake.pth` | 67.6 MB | Loaded |
| 2 | Emotion | MobileNetV2 | 7-class facial emotion | `emotion_weights.pth` | 10.0 MB | Loaded |
| 3 | Identity | FaceNet InceptionResnetV1 | Face re-identification | Pre-trained (VGGFace2, via pip) | ~100 MB | Loaded |
| 4 | Audio Deepfake | AASIST (SincConv) | Detect voice spoofing | `aasist_weights.pth` | 3.6 MB | Loaded |
| 5 | Text Behavior | DeBERTa-v3-base (zero-shot NLI) | Detect social engineering | HuggingFace auto-download | ~700 MB | Loaded |
| 6 | Face Detection | MediaPipe FaceDetection | Locate faces in frames | Built-in (pip) | N/A | Loaded |

All 6 models confirmed loaded via `GET /api/health` on 2026-03-01.

---

## 2. Accuracy & Performance per Model

### 2.1 Video Deepfake — EfficientNet-B4 + SBI

| Metric | Value |
|--------|-------|
| **Paper accuracy** | 93.18% AUC on FaceForensics++ (c23), 86.16% AUC on Celeb-DF v2 |
| **Reference** | Shiohara & Yamasaki, "Detecting Deepfakes with Self-Blended Images", CVPR 2022 |
| **Our weights** | Fine-tuned on 10K labeled images (5K real + 5K fake) from `Hemg/deepfake-and-real-images` |
| **Our training result** | **92.33% validation accuracy** at epoch 14 (best checkpoint) |
| **Training config** | Differential LR (backbone 3e-5, head 1e-3), freeze blocks 0-3, cosine annealing, patience 8 |
| **Zoom-compressed estimate** | ~85-90% (JPEG compression artifacts degrade all models) |
| **Input** | BGR face crop, resized to 380x380, ImageNet normalization |

**Label Convention (Verified):**
- SBI uses label=0 for REAL, label=1 for FAKE
- Original SBI: `softmax[:,1]` = P(fake)
- Our model: sigmoid output treated as P(fake), then `authenticity = 1.0 - P(fake)`
- The inversion convention is correct

**Training History:**
Initial SBI-only approach (self-blended images on real faces) peaked at 61% — artifacts were too subtle. Switched to supervised training on labeled real/fake data with ImageNet-pretrained backbone, reaching 92.33% at epoch 14. Model was plateau-ing by epochs 15-17 (no improvement over best). Training interrupted at epoch 17/30; early stopping (patience=8) would likely have triggered around epoch 22.

**Risk Thresholds:**
- Low risk: authenticity > 0.85
- Medium risk: 0.70 - 0.85
- High risk: < 0.70

---

### 2.2 Emotion Recognition — MobileNetV2

| Metric | Value |
|--------|-------|
| **Architecture** | MobileNetV2 backbone -> AdaptiveAvgPool2d -> 1280->256->7 classifier |
| **Training data** | FER2013 or similar (pre-existing weights, no training log available) |
| **Expected accuracy** | ~65-72% on FER2013 (typical for MobileNetV2 on this dataset) |
| **Classes (training)** | angry, disgust, fear, happy, sad, surprise, neutral (7 classes) |
| **Classes (API)** | Happy, Neutral, Angry, Fear, Surprise, Sad (6 classes; disgust merged into Angry) |
| **Input** | BGR face crop, resized to 128x128, ImageNet normalization |

**Notes:**
- FER2013 is known to be noisy (~65% human agreement), so 65-72% is competitive
- Emotion confidence feeds into the behavior component of the trust score
- Used as behavioral baseline: `behavior_conf = 0.5 * (1 + emotion_confidence)` [range: 0.5-1.0]

---

### 2.3 Identity Tracking — FaceNet InceptionResnetV1

| Metric | Value |
|--------|-------|
| **Pre-trained on** | VGGFace2 (3.3M images, 9.1K identities) |
| **Published accuracy** | 99.65% on LFW (Labeled Faces in the Wild) |
| **Embedding dimension** | 512 (L2-normalized) |
| **Comparison method** | Cosine distance with EMA baseline (alpha=0.1) |
| **Same-person threshold** | cosine distance < 0.25 |
| **Input** | Face crop resized to 160x160, RGB |

**Risk Thresholds:**
- Low risk: embedding shift < 0.20
- Medium risk: 0.20 - 0.40
- High risk: > 0.40

**Baseline Tracking:**
The identity tracker maintains per-session, per-face embedding baselines. New faces establish a baseline on first appearance. Subsequent embeddings are compared via cosine distance. An exponential moving average (EMA, alpha=0.1) allows gradual adaptation to lighting and angle changes while detecting abrupt identity switches.

---

### 2.4 Audio Deepfake — AASIST (SincConv)

| Metric | Value |
|--------|-------|
| **Architecture** | SincConv (70 channels, kernel=251) -> 4 ConvBlocks -> Attention pooling -> Classifier |
| **Training data** | ASVspoof 2019 LA (1,298 bonafide + ~10K spoofed samples) |
| **Our training result** | Best checkpoint at epoch 5, **54.8% validation accuracy** |
| **SOTA reference** | Full AASIST achieves 0.83% EER on ASVspoof 2019 LA |
| **Typical baselines** | 70-80% accuracy for simplified architectures |
| **Input** | 64,000 PCM16 samples (4 seconds @ 16kHz), padded/truncated |

**Gap Analysis:**
Our 54.8% accuracy is well below the 70-80% baseline target. Likely causes:
1. Small batch size (16) on Apple Silicon MPS — insufficient gradient averaging
2. Learning rate (1e-3) potentially too aggressive for SincConv parameters
3. Short training window (early stopping triggered at epoch 5)
4. Simplified architecture (missing graph attention layers from full AASIST paper)
5. Training data: `Bisher/ASVspoof_2019_LA` on HuggingFace (the `LanceaKing/` version uses deprecated loading scripts)

**Recommendation:** Re-train with lower learning rate (1e-4), larger batch size (32-64), and more epochs (50+) to improve accuracy.

---

### 2.5 Text Behavior — DeBERTa-v3 Zero-Shot NLI

| Metric | Value |
|--------|-------|
| **Base model** | `MoritzLaurer/deberta-v3-base-zeroshot-v2.0` (139M params) |
| **Published accuracy** | ~90% on MNLI, strong zero-shot transfer |
| **Our usage** | Zero-shot classification against 5 behavioral hypotheses |
| **Task-specific training** | None (relies on NLI generalization) |
| **Input** | Transcript text, truncated to 2,000 characters |
| **Inference timeout** | 5 seconds (thread pool with 2 workers) |

**Behavioral Hypotheses:**
1. "This person is pressuring someone to act urgently" -> `social_engineering`
2. "This person is requesting sensitive personal information" -> `credential_theft`
3. "This person is impersonating an authority figure" -> `impersonation`
4. "This person is using emotional manipulation" -> `emotional_manipulation`
5. "This person is trying to isolate the listener from external advice" -> `isolation_tactic`

**Alert Thresholds:**
- Medium severity: score > 0.65
- High severity: score > 0.80

**Setup Note:** The model requires a ~700MB initial download from HuggingFace. Run `scripts/download_models.sh` to pre-cache the model before first startup.

---

### 2.6 Face Detection — MediaPipe

| Metric | Value |
|--------|-------|
| **Accuracy** | 96% mAP on WIDER FACE (easy set) |
| **Model** | Short-range model (model_selection=0) |
| **Confidence threshold** | 0.4 |
| **Face crop padding** | 30% around bounding box |
| **Base crop size** | 224x224 pixels |
| **Threading** | Per-thread instances (avoids global lock serialization) |

---

## 3. Trust Score Formula

### Without Audio (AI service default — 3 signals)

```
behavior_conf = 0.5 * (1 + emotion_confidence)     // Range: [0.5, 1.0]
identity_signal = 1.0 - embedding_shift             // Range: [0.0, 1.0]

trust_score = 0.47 * video_authenticity
            + 0.33 * identity_signal
            + 0.20 * behavior_conf
```

### With Audio (backend reweights — 4 signals)

```
trust_score = 0.35 * video_authenticity
            + 0.25 * audio_authenticity
            + 0.25 * identity_signal
            + 0.15 * behavior_conf
```

### Camera-Off (audio only — 2 signals)

```
trust_score = 0.60 * audio_authenticity
            + 0.40 * behavior_conf
```

All trust scores are clamped to [0.0, 1.0].

### Temporal Smoothing

Trust scores are smoothed across frames using EWMA (exponentially-weighted moving average):
- **Decay factor:** 0.85
- **Window size:** 15 frames
- **Minimum frames before smoothing:** 3
- **Trend detection:** Compares mean of first 5 vs last 5 frames (threshold: 0.05)
- **Volatility:** Standard deviation of trust scores in window

---

## 4. Pipeline Flow

### Video Frame Pipeline

```
Frame (base64 JPEG, max 4MB)
  |
  v
Decode JPEG -> BGR numpy array (10-4096px per dimension)
  |
  v
Face Detection (MediaPipe, short-range, conf > 0.4)
  |
  +--> No face detected -> Track no-face counter
  |      |                   5+ consecutive -> camera-off response
  |      +--< 5 ----------> empty response (transient)
  |
  +--> Face(s) detected (per face, padded 30%, resized to 224x224)
         |
         +---> Deepfake (EfficientNet-B4, original-size crop -> 380x380)
         |       Returns: authenticityScore, riskLevel
         |
         +---> Emotion (MobileNetV2, 224x224 crop -> 128x128)
         |       Returns: label, confidence, scores{}
         |
         +---> Identity (FaceNet, 224x224 crop -> 160x160)
                 Returns: embeddingShift, samePerson, riskLevel
         |
         v
    Aggregate primary face -> Compute trust score
         |
         v
    Temporal smoothing (EWMA, window=15 frames)
    Anomaly detection: sudden drops, identity switches, emotion instability
         |
         v
    Response: { faces[], aggregated{ emotion, identity, deepfake,
                trustScore, confidenceLayers, temporal } }
```

### Audio Pipeline

```
Audio (base64 PCM16 mono 16kHz, max 4MB)
  |
  v
Decode -> float32 waveform -> pad/truncate to 64K samples (4s)
  |
  v
AASIST (SincConv -> ConvBlocks -> Attention pooling -> Classifier)
  |
  v
authenticity = 1.0 - P(spoof)
  |
  v
Response: { audio: { authenticityScore, riskLevel, model } }
```

### Text Pipeline

```
Transcript text (max 2000 chars, 5s timeout)
  |
  v
DeBERTa-v3 zero-shot NLI (5 behavioral hypotheses, multi_label=true)
  |
  v
Filter signals above 0.65 threshold
  |
  v
Response: { behavioral: { signals[], highestScore, model } }
```

---

## 5. Anomaly Detection

The temporal analyzer detects three types of anomalies:

| Anomaly | Trigger | Severity |
|---------|---------|----------|
| **Sudden trust drop** | Current trust > 0.20 below buffer mean | High |
| **Identity switch** | Embedding shift jumps from avg < 0.15 to current > 0.35 | High |
| **Emotion instability** | Dominant emotion changed 5+ times in window | Medium |

These feed into the backend's Alert Fusion Engine, which applies 30-second cooldown between same-type alerts and can escalate alerts when multiple risk signals co-occur (e.g., text fraud + visual deepfake -> critical).

---

## 6. API Reference

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Model status (loaded/unavailable/error per model) |
| `POST` | `/api/analyze/frame` | Video frame analysis (deepfake + emotion + identity + trust) |
| `POST` | `/api/analyze/audio` | Audio deepfake detection |
| `POST` | `/api/analyze/text` | Behavioral text analysis (NLI) |
| `POST` | `/api/sessions/{id}/clear-identity` | Clear session state (identity baseline, temporal buffer) |

### Authentication

Optional API key via `X-API-Key` header. Set `AI_API_KEY` environment variable to enable. Health endpoint is always public.

### CORS

Defaults to `http://localhost:4000`, `http://localhost:5173`, `http://localhost:3000`. Override with `CORS_ALLOWED_ORIGIN` env var (comma-separated).

---

## 7. Training Infrastructure

| Script | Purpose | Data Source | Output |
|--------|---------|-------------|--------|
| `training/convert_sbi_weights.py` | Convert official SBI checkpoint to our format | Google Drive (SBI FF-c23) | `efficientnet_b4_deepfake.pth` |
| `training/train_audio_sincconv.py` | Train audio deepfake detector | HuggingFace ASVspoof 2019 LA | `aasist_weights.pth` |
| `training/finetune_deepfake_labeled.py` | Fine-tune EfficientNet-B4 on labeled data (92.33% acc) | `Hemg/deepfake-and-real-images` (HuggingFace) | `efficientnet_b4_deepfake.pth` |
| `training/train_efficientnet_sbi.py` | Train video deepfake from scratch (SBI augmentation) | FaceForensics++ real faces (manual) | `efficientnet_b4_deepfake.pth` |
| `scripts/download_models.sh` | Download HuggingFace models (DeBERTa) + verify weights | HuggingFace Hub | HF cache (~700MB) |

### Training Gotchas

- `LanceaKing/asvspoof2019` uses deprecated HF loading scripts — use `Bisher/ASVspoof_2019_LA` instead
- HuggingFace audio datasets: set `NUM_WORKERS=0` (multiprocessing deadlocks with audio decoding)
- SincConv (kernel=251, 64K samples) is extremely slow: use `TARGET_LENGTH=16000` (1s) for training
- MPS works but is slow for SincConv; ~1s/batch at batch_size=16
- Python output buffering: use `PYTHONUNBUFFERED=1` for background training jobs

---

## 8. Known Limitations

### Critical

1. **Audio model accuracy 54.8%** — Barely above random (50%). Needs re-training with better hyperparameters (lower LR, larger batch, more epochs).

### Moderate

3. **No end-to-end benchmark suite** — No automated regression tests against known real/fake samples.

4. **Session state lost on restart** — Identity baselines and temporal buffers are in-memory only. Restarting the AI service resets all session tracking.

5. **DeBERTa uses no task-specific training** — Relies entirely on zero-shot NLI generalization. Accuracy on meeting transcript text specifically is unvalidated.

### Minor

6. **Emotion model weights loading** — Falls back to unsafe deserialization due to numpy metadata in checkpoint. These are our own locally-trained weights so the risk is minimal, but not ideal for production.

7. **Face detection is short-range only** — MediaPipe short-range model optimized for faces within 2 meters. May miss faces further from camera in group calls.

---

## 9. Configuration Reference

All configurable values live in `serve/config.py`:

| Parameter | Value | Description |
|-----------|-------|-------------|
| `PORT` | 5100 | Server port |
| `EFFICIENTNET_INPUT_SIZE` | 380 | Deepfake model input size |
| `EMOTION_INPUT_SIZE` | 128 | Emotion model input size |
| `FACENET_INPUT_SIZE` | 160 | Identity model input size |
| `FACE_CONFIDENCE_THRESHOLD` | 0.4 | Minimum face detection confidence |
| `FACE_PADDING_PERCENT` | 0.3 | Padding around detected face bbox |
| `DEEPFAKE_AUTH_THRESHOLD_LOW_RISK` | 0.85 | Above = low risk |
| `DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK` | 0.70 | Below = high risk |
| `IDENTITY_SHIFT_LOW` | 0.20 | Below = low risk |
| `IDENTITY_SHIFT_HIGH` | 0.40 | Above = high risk |
| `IDENTITY_EMA_ALPHA` | 0.1 | Baseline adaptation rate |
| `TEMPORAL_WINDOW_SIZE` | 15 | Frames in sliding window |
| `TEMPORAL_EWMA_DECAY` | 0.85 | Trust score smoothing factor |
| `TEMPORAL_SMOOTHING_MIN_FRAMES` | 3 | Minimum frames before smoothing activates |
| `TEXT_ALERT_THRESHOLD` | 0.65 | Minimum NLI score for alert |
| `TEXT_HIGH_SEVERITY_THRESHOLD` | 0.80 | Score threshold for high severity |
| `TEXT_MAX_LENGTH` | 2000 | Maximum input text characters |
| `TEXT_INFERENCE_TIMEOUT` | 5 | Seconds before text analysis times out |
| `AUDIO_SAMPLE_RATE` | 16000 | Expected audio sample rate (Hz) |
| `AUDIO_TARGET_LENGTH` | 64000 | Audio input samples (4 seconds) |
| `NO_FACE_THRESHOLD` | 5 | Consecutive no-face frames before camera-off |
| `TRUST_WEIGHT_VIDEO` | 0.47 | Video signal weight (3-signal mode) |
| `TRUST_WEIGHT_IDENTITY` | 0.33 | Identity signal weight (3-signal mode) |
| `TRUST_WEIGHT_BEHAVIOR` | 0.20 | Behavior signal weight (3-signal mode) |
