# WavLM Audio Deepfake Training — Handoff Document

## What Was Done

### Part A: False Positive Sensitivity (COMPLETE)
All threshold tuning changes are applied and ready:

- **`serve/config.py`** — 8 thresholds loosened (identity drift, temporal analysis, emotion)
- **`serve/deepfake_model.py`** — Sigmoid calibration softened (center=0.02, steepness=80)
- **`realsync-backend/lib/alertFusion.js`** — Backend thresholds aligned with AI config

### Part B: Audio Model Replacement (CODE COMPLETE, TRAINING NOT YET RUN)
AASIST SincConv replaced with WavLM-base + classification head:

- **`serve/audio_model.py`** — New `WavLMAudioClassifier` using `microsoft/wavlm-base`
- **`serve/config.py`** — `WAVLM_WEIGHTS_PATH` pointing to `src/models/wavlm_audio_weights.pth`
- **`serve/app.py`** — Updated docstrings/logs from AASIST to WavLM
- **`training/train_audio_wavlm.py`** — Full training script with:
  - Two-phase fine-tuning (Phase 1: frozen encoder, Phase 2: top 4 layers unfrozen)
  - In-memory codec augmentation (mu-law, bandwidth limiting, spectral smoothing, noise)
  - Epoch-level ETA logging
- **`training/monitor_training.py`** — Web dashboard at localhost:8501 with ETA display

### Monitoring Dashboard
- **`training/monitor_training.py`** — Serves live dashboard at `http://localhost:8501`
- Reads from `training/logs/wavlm_training.log`
- Shows: epoch progress, loss/accuracy charts, ETA, phase indicator, raw log

## What Needs To Be Done

### 1. Fix sympy (if needed)
The torch 2.10.0 upgrade broke sympy compatibility. It was fixed with:
```bash
cd RealSync-AI-Prototype
source .venv/bin/activate
pip install sympy==1.13.3
python -c "from sympy import S; import torch; import transformers; print('OK')"
```

### 2. Verify all imports work
```bash
source .venv/bin/activate
python -c "
import torch; print('torch', torch.__version__)
import transformers; print('transformers', transformers.__version__)
from transformers import WavLMModel, Wav2Vec2FeatureExtractor
print('WavLM import OK')
from serve.audio_model import WavLMAudioClassifier
print('Model class OK')
"
```

### 3. Run the training
```bash
cd RealSync-AI-Prototype
source .venv/bin/activate
python -u training/train_audio_wavlm.py --epochs 20 --batch-size 16 2>&1 | tee training/logs/wavlm_training.log
```

Or to run in background:
```bash
nohup python -u training/train_audio_wavlm.py --epochs 20 --batch-size 16 > training/logs/wavlm_training.log 2>&1 &
echo "Training PID: $!"
```

### 4. Start the monitoring dashboard (optional, separate terminal)
```bash
cd RealSync-AI-Prototype
source .venv/bin/activate
python training/monitor_training.py
# Dashboard at http://localhost:8501
```

### 5. After training completes, verify
```bash
# Check weights were saved
ls -la src/models/wavlm_audio_weights.pth

# Start AI service and test
python -m serve.app
# In another terminal:
curl http://localhost:5100/api/health | python -m json.tool
# Should show "audio": "loaded"
```

## Expected Training Output
- **Dataset**: ASVspoof 2019 LA — 25,380 train, 24,844 val (2,580 real / 22,800 spoof)
- **Model**: WavLM-base (94.5M params), classification head (197K params)
- **Phase 1** (epochs 1-5): Frozen encoder, head-only training, LR=1e-3
- **Phase 2** (epochs 6-20): Top 4 encoder layers unfrozen, differential LR (2e-5/1e-4)
- **Early stopping**: Patience=5 on val_loss
- **Codec augmentation**: 50% of training samples get mu-law / bandwidth limiting / spectral smoothing / noise
- **Output**: `src/models/wavlm_audio_weights.pth`
- **Estimated time**: ~20-40 min/epoch on MPS. With early stopping ~3-7 hours total.

## Package Versions (after upgrades)
```
torch==2.10.0
torchvision==0.25.0
torchaudio==2.10.0
transformers==5.3.0
sympy==1.13.3  # MUST be pinned, 1.14.0 breaks torch
numpy==1.26.4  # MUST stay <2 for mediapipe
datasets (latest)
soundfile==0.13.1
torchcodec==0.10.0
```

## File Inventory
| File | Status |
|------|--------|
| `serve/config.py` | MODIFIED — new thresholds + WAVLM_WEIGHTS_PATH |
| `serve/audio_model.py` | REWRITTEN — WavLMAudioClassifier |
| `serve/deepfake_model.py` | MODIFIED — softer sigmoid calibration |
| `serve/app.py` | MODIFIED — WavLM references |
| `realsync-backend/lib/alertFusion.js` | MODIFIED — aligned thresholds |
| `training/train_audio_wavlm.py` | NEW — WavLM training script |
| `training/train_audio_wav2vec2.py` | NEW (obsolete) — can be deleted |
| `training/monitor_training.py` | NEW — web dashboard |
| `training/run_training.sh` | NEW — convenience wrapper |
| `training/logs/wavlm_training.log` | OUTPUT — training log |
| `src/models/wavlm_audio_weights.pth` | NOT YET CREATED — training output |

## Troubleshooting
- **sympy ImportError**: `pip install sympy==1.13.3`
- **numpy version conflict**: `pip install "numpy<2"`
- **torchcodec missing**: `pip install torchcodec` (needed for HuggingFace audio decoding)
- **WavLM download slow**: First run downloads ~360MB from HuggingFace, cached after
- **MPS errors**: If MPS fails, training auto-falls back to CPU (slower)
