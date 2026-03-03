#!/usr/bin/env bash
# Downloads AI model dependencies that aren't bundled as .pth files.
#
# DeBERTa-v3-base (~700MB) is fetched from HuggingFace and cached locally
# so the AI service can load it on startup without a first-run delay.
#
# Usage:
#   cd RealSync-AI-Prototype
#   bash scripts/download_models.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== RealSync AI Model Downloader ==="
echo ""

# Activate venv if present
if [ -f "$PROJECT_DIR/venv/bin/activate" ]; then
    source "$PROJECT_DIR/venv/bin/activate"
    echo "[download] Activated virtualenv"
fi

echo "[download] Downloading DeBERTa-v3 zero-shot NLI model (~700MB)..."
echo "[download] This may take a few minutes on the first run."
echo ""

python -c "
from transformers import pipeline
print('[download] Loading pipeline (downloads model if not cached)...')
pipe = pipeline(
    'zero-shot-classification',
    model='MoritzLaurer/deberta-v3-base-zeroshot-v2.0',
    device=-1,
)
# Quick smoke test
result = pipe('This is a test sentence.', ['positive', 'negative'])
print(f'[download] Smoke test passed: top label={result[\"labels\"][0]}, score={result[\"scores\"][0]:.3f}')
print('[download] DeBERTa-v3 model cached successfully.')
"

echo ""
echo "[download] Verifying other model weights..."

python -c "
import os, sys
sys.path.insert(0, '$PROJECT_DIR')
from serve.config import EFFICIENTNET_WEIGHTS_PATH, EMOTION_WEIGHTS_PATH, AASIST_WEIGHTS_PATH

models = [
    ('EfficientNet-B4 (deepfake)', EFFICIENTNET_WEIGHTS_PATH),
    ('MobileNetV2 (emotion)',      EMOTION_WEIGHTS_PATH),
    ('AASIST (audio)',             AASIST_WEIGHTS_PATH),
]

all_ok = True
for name, path in models:
    if os.path.isfile(path):
        size_mb = os.path.getsize(path) / (1024 * 1024)
        print(f'  [ok] {name}: {path} ({size_mb:.1f} MB)')
    else:
        print(f'  [MISSING] {name}: {path}')
        all_ok = False

if not all_ok:
    print()
    print('Some model weights are missing. See MEMORY.md for training instructions.')
    sys.exit(1)
"

echo ""
echo "=== All models ready ==="
