"""
WavLM audio deepfake detection model.

Uses microsoft/wavlm-base as a feature extractor with a lightweight
classification head fine-tuned on ASVspoof 2019 LA with codec augmentation.
WavLM's denoising pre-training makes it robust to Zoom/Opus compression.

Input: base64-encoded PCM16 mono 16kHz audio (4 seconds = 64000 samples).
Output: {"authenticityScore": float, "riskLevel": str, "model": str}
"""
import base64
import os
import threading

import numpy as np
import torch
import torch.nn as nn

from serve.config import (
    WAVLM_WEIGHTS_PATH,
    DEEPFAKE_AUTH_THRESHOLD_LOW_RISK,
    DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK,
    AUDIO_SAMPLE_RATE,
    AUDIO_TARGET_LENGTH,
)

MODEL_NAME = "WavLM-Audio"
SAMPLE_RATE = AUDIO_SAMPLE_RATE
TARGET_LENGTH = AUDIO_TARGET_LENGTH


# ---------------------------------------------------------------
# Model architecture
# ---------------------------------------------------------------

class WavLMAudioClassifier(nn.Module):
    """
    WavLM-base encoder + classification head for audio deepfake detection.

    Architecture:
        WavLMModel (frozen or partial-unfreeze) -> mean pool -> Linear(768,256) -> ReLU -> Dropout -> Linear(256,1) -> Sigmoid
    """

    def __init__(self, freeze_encoder=True):
        super().__init__()
        from transformers import WavLMModel
        self.encoder = WavLMModel.from_pretrained("microsoft/wavlm-base")

        if freeze_encoder:
            for param in self.encoder.parameters():
                param.requires_grad = False

        self.classifier = nn.Sequential(
            nn.Linear(768, 256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, 1),
        )

    def forward(self, input_values):
        """
        Args:
            input_values: (batch, seq_len) raw waveform tensor, normalized by Wav2Vec2FeatureExtractor
        Returns:
            (batch, 1) sigmoid output — P(spoof)
        """
        outputs = self.encoder(input_values)
        hidden_states = outputs.last_hidden_state  # (batch, seq_len, 768)
        pooled = hidden_states.mean(dim=1)          # (batch, 768)
        logits = self.classifier(pooled)             # (batch, 1)
        return torch.sigmoid(logits)


# ---------------------------------------------------------------
# Lazy-loaded singleton
# ---------------------------------------------------------------

_LOAD_FAILED = object()
_model = None
_processor = None
_lock = threading.Lock()


def get_audio_model():
    """Load or return the cached audio deepfake model (thread-safe)."""
    global _model, _processor
    if _model is not None:
        return None if _model is _LOAD_FAILED else _model
    with _lock:
        if _model is not None:
            return None if _model is _LOAD_FAILED else _model
        try:
            from transformers import Wav2Vec2FeatureExtractor

            # WavLM uses the same feature extractor as Wav2Vec2
            _processor = Wav2Vec2FeatureExtractor.from_pretrained("microsoft/wavlm-base")

            net = WavLMAudioClassifier(freeze_encoder=True)

            if os.path.isfile(WAVLM_WEIGHTS_PATH):
                state = torch.load(WAVLM_WEIGHTS_PATH, map_location="cpu", weights_only=True)
                head_state = state.get("classifier_state_dict", state.get("model_state_dict", state))
                if "classifier_state_dict" in state:
                    net.classifier.load_state_dict(head_state)
                else:
                    net.load_state_dict(head_state, strict=False)
                print(f"[audio] Loaded WavLM classification head from {WAVLM_WEIGHTS_PATH}")
            else:
                print(f"[audio] WARNING: WavLM weights not found at {WAVLM_WEIGHTS_PATH}")
                print("[audio] Model disabled — no trained classification head available")
                _model = _LOAD_FAILED
                return None

            net.train(False)
            _device = "mps" if torch.backends.mps.is_available() else "cpu"
            net = net.to(_device)
            net._device = _device
            _model = net
            print(f"[audio] Using device: {_device}")
            print(f"[audio] {MODEL_NAME} model ready on {_device}")
        except Exception as exc:
            print(f"[audio] Failed to load audio model: {exc}")
            _model = _LOAD_FAILED
    return None if _model is _LOAD_FAILED else _model


# ---------------------------------------------------------------
# Public API
# ---------------------------------------------------------------

def predict_audio(audio_b64: str) -> dict:
    """
    Predict audio deepfake from base64-encoded PCM16 mono 16kHz data.

    Returns:
        {"authenticityScore": float, "riskLevel": str, "model": str}
    """
    model = get_audio_model()
    if model is None:
        return {"authenticityScore": None, "riskLevel": "unknown", "model": MODEL_NAME, "available": False}

    try:
        pcm_bytes = base64.b64decode(audio_b64, validate=True)
        if len(pcm_bytes) % 2 != 0:
            print(f"[audio] Rejecting odd-byte PCM payload ({len(pcm_bytes)} bytes)")
            return {"authenticityScore": None, "riskLevel": "unknown", "model": MODEL_NAME, "available": False}
        pcm_int16 = np.frombuffer(pcm_bytes, dtype=np.int16)
        waveform = pcm_int16.astype(np.float32) / 32768.0

        # Pad or truncate to 4 seconds
        if len(waveform) < TARGET_LENGTH:
            waveform = np.pad(waveform, (0, TARGET_LENGTH - len(waveform)))
        else:
            waveform = waveform[:TARGET_LENGTH]

        device = getattr(model, '_device', 'cpu')
        inputs = _processor(
            waveform,
            sampling_rate=SAMPLE_RATE,
            return_tensors="pt",
            padding=False,
        )
        input_values = inputs.input_values.to(device)  # (1, seq_len)

        with torch.no_grad():
            raw = model(input_values)
            prediction = float(raw[0][0])

        # Model outputs P(spoof). Convert to authenticity.
        authenticity = round(1.0 - prediction, 4)

        print(f"[audio] raw_spoof_prob={prediction:.4f} authenticity={authenticity:.4f}")

        if authenticity > DEEPFAKE_AUTH_THRESHOLD_LOW_RISK:
            risk = "low"
        elif authenticity > DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK:
            risk = "medium"
        else:
            risk = "high"

        return {
            "authenticityScore": authenticity,
            "riskLevel": risk,
            "model": MODEL_NAME,
        }

    except Exception as exc:
        print(f"[audio] Prediction error: {exc}")
        return {"authenticityScore": None, "riskLevel": "unknown", "model": MODEL_NAME, "available": False}
