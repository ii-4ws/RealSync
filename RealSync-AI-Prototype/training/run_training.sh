#!/bin/bash
cd "$(dirname "$0")/.."
exec .venv/bin/python -u training/train_audio_wavlm.py --epochs 20 --batch-size 16 > training/logs/wavlm_training.log 2>&1
