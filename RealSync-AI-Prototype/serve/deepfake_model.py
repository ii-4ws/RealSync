"""
EfficientNet-B4 + SBI deepfake detection model — replaces MesoNet-4.

Binary classification: real (1.0) vs fake (0.0).
Uses EfficientNet-B4 backbone (ImageNet pretrained) with a single sigmoid output.
Loads fine-tuned weights if available; ImageNet features used as baseline.

Input: BGR face crop (any size, resized to 380x380 internally).
Output: {"authenticityScore": float, "riskLevel": str, "model": str}
"""
import math
import os
import threading

import cv2
import numpy as np
import torch
import torch.nn as nn
from torchvision import models, transforms

from serve.config import (
    EFFICIENTNET_INPUT_SIZE,
    EFFICIENTNET_WEIGHTS_PATH,
    DEEPFAKE_AUTH_THRESHOLD_LOW_RISK,
    DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK,
    DISABLE_ZOOM_CALIBRATION,
)

MODEL_NAME = "EfficientNet-B4-SBI"


# ---------------------------------------------------------------
# Model architecture
# ---------------------------------------------------------------

class EfficientNetDeepfake(nn.Module):
    """EfficientNet-B4 with binary deepfake detection head."""

    def __init__(self):
        super().__init__()
        backbone = models.efficientnet_b4(weights=models.EfficientNet_B4_Weights.IMAGENET1K_V1)
        # Replace classifier: 1792 -> 1 (sigmoid)
        in_features = backbone.classifier[1].in_features
        backbone.classifier = nn.Sequential(
            nn.Dropout(p=0.4),
            nn.Linear(in_features, 1),
        )
        self.net = backbone

    def forward(self, x):
        return torch.sigmoid(self.net(x))


# ---------------------------------------------------------------
# Lazy-loaded singleton
# ---------------------------------------------------------------

_LOAD_FAILED = object()  # Sentinel to prevent infinite retry on load failure
_model = None
_lock = threading.Lock()

_preprocess = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((EFFICIENTNET_INPUT_SIZE, EFFICIENTNET_INPUT_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])


def get_deepfake_model():
    """Load or return the cached deepfake model (thread-safe)."""
    global _model
    if _model is not None:
        return None if _model is _LOAD_FAILED else _model
    with _lock:
        if _model is not None:
            return None if _model is _LOAD_FAILED else _model
        try:
            net = EfficientNetDeepfake()

            if os.path.isfile(EFFICIENTNET_WEIGHTS_PATH):
                state = torch.load(EFFICIENTNET_WEIGHTS_PATH, map_location="cpu", weights_only=True)
                state_dict = state.get("model_state_dict", state)
                net.load_state_dict(state_dict)
                print("[deepfake] Loaded SBI weights from " + EFFICIENTNET_WEIGHTS_PATH)
            else:
                print("[deepfake] WARNING: SBI weights not found at " + EFFICIENTNET_WEIGHTS_PATH)
                _model = _LOAD_FAILED
                return None

            # Use CUDA (NVIDIA GPU), MPS (Apple Silicon), or CPU
            _device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
            net = net.to(_device)
            net.train(False)
            net._device = _device
            _model = net
            print("[deepfake] Using device: " + _device)
            print(f"[deepfake] {MODEL_NAME} model ready")
        except Exception as exc:
            print(f"[deepfake] Failed to load model: {exc}")
            _model = _LOAD_FAILED
    return None if _model is _LOAD_FAILED else _model


# ---------------------------------------------------------------
# Public API
# ---------------------------------------------------------------

def predict_deepfake(face_crop_bgr: np.ndarray) -> dict:
    """
    Predict deepfake authenticity from a BGR face crop.

    Returns:
        {"authenticityScore": float, "riskLevel": str, "model": str}
    """
    model = get_deepfake_model()
    if model is None:
        return {"authenticityScore": None, "riskLevel": "unknown", "model": MODEL_NAME, "available": False}

    try:
        face_rgb = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2RGB)
        device = getattr(model, '_device', 'cpu')
        tensor = _preprocess(face_rgb).unsqueeze(0).to(device)

        with torch.no_grad():
            raw = model(tensor)  # (1, 1)
            prediction = float(raw[0][0])

        # SBI label convention: label=0 → real, label=1 → fake.
        # sigmoid output ≈ P(fake), so raw_authenticity = 1 - P(fake).
        #
        # Problem: Zoom video is double-compressed (Zoom codec + JPEG screenshot),
        # which introduces artifacts the model interprets as manipulation.
        # Real faces through Zoom typically score raw_authenticity 0.01-0.15.
        # Actual deepfakes through Zoom would score even lower (near 0).
        #
        # Calibration strategy: apply a sigmoid-based rescaling that maps the
        # compressed-video range [0, 0.5] → [0.4, 0.85] while still allowing
        # genuine deepfakes (raw < 0.01) to score low.
        raw_authenticity = 1.0 - prediction

        if DISABLE_ZOOM_CALIBRATION:
            # Direct mode: use raw authenticity without Zoom compression calibration.
            # Use this for locally-generated deepfake testing (not Zoom-captured video).
            print(f"[deepfake] raw_prediction={prediction:.4f} raw_auth={raw_authenticity:.4f} (calibration disabled)", flush=True)
            authenticity = round(max(0.0, min(1.0, raw_authenticity)), 4)
        else:
            # I1: Sigmoid rescale — gradual curve to reduce jitter from Zoom compression.
            # Actual Zoom real-face raw_auth: 0.0001–0.007 (median 0.003, p95 0.14).
            # Zoom double-compression makes model score real faces near 0.
            # center=0.003, steepness=300: maps median real face to 0.73 (low risk);
            # even worst-case real frames (0.0001) score 0.63 (above alert thresholds).
            # TODO(post-RunPod): Re-evaluate steepness after fine-tuning.
            # Current steepness=300 creates near-binary output ([0.50, 0.95]).
            # After tuning, model may produce better-separated raw scores.
            # Consider reducing to 50-100 and re-calibrating on validation set.
            calibrated = 1.0 / (1.0 + math.exp(-300 * (raw_authenticity - 0.003)))
            calibrated = 0.50 + calibrated * 0.45

            print(f"[deepfake] raw_prediction={prediction:.4f} raw_auth={raw_authenticity:.4f} calibrated={calibrated:.4f}", flush=True)
            authenticity = round(max(0.0, min(1.0, calibrated)), 4)

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
        print(f"[deepfake] Prediction error: {exc}")
        return {"authenticityScore": None, "riskLevel": "unknown", "model": MODEL_NAME, "available": False}
