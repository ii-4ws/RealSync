"""
Custom MobileNetV2 emotion model — replaces broken FER library.

Architecture matches train_emotion.py exactly:
  MobileNetV2 backbone → AdaptiveAvgPool2d → Flatten → 1280→256→7

Loads weights from src/models/emotion_weights.pth (checkpoint format).
Falls back to ImageNet-pretrained MobileNetV2 if weights not found.

7-class: angry, disgust, fear, happy, sad, surprise, neutral
Mapped to 6-class API: disgust → angry (existing convention).
"""
import os
import threading

import cv2
import numpy as np
import torch
import torch.nn as nn
from torchvision import models, transforms

from serve.config import EMOTION_LABELS, EMOTION_INPUT_SIZE, EMOTION_WEIGHTS_PATH

# ---------------------------------------------------------------
# Model architecture (must match train_emotion.py EmotionNet)
# ---------------------------------------------------------------

_TRAIN_LABELS_7 = ["angry", "disgust", "fear", "happy", "sad", "surprise", "neutral"]

# Map 7-class training labels → 6-class API labels
_LABEL_TO_API = {
    "angry": "Angry",
    "disgust": "Angry",  # merge disgust into angry
    "fear": "Fear",
    "happy": "Happy",
    "sad": "Sad",
    "surprise": "Surprise",
    "neutral": "Neutral",
}


class EmotionNet(nn.Module):
    """MobileNetV2 fine-tuned for 7-class emotion classification."""

    def __init__(self, num_classes=7):
        super().__init__()
        backbone = models.mobilenet_v2(weights=None)
        self.features = backbone.features
        self.pool = nn.AdaptiveAvgPool2d((1, 1))
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.4),
            nn.Linear(1280, 256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, num_classes),
        )

    def forward(self, x):
        x = self.features(x)
        x = self.pool(x)
        x = self.classifier(x)
        return x


# ---------------------------------------------------------------
# Lazy-loaded singleton
# ---------------------------------------------------------------

_model = None
_lock = threading.Lock()

_preprocess = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((EMOTION_INPUT_SIZE, EMOTION_INPUT_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])


def get_emotion_model():
    """Load or return the cached emotion model (thread-safe)."""
    global _model
    if _model is not None:
        return _model
    with _lock:
        if _model is not None:
            return _model
        try:
            net = EmotionNet(num_classes=7)
            if os.path.isfile(EMOTION_WEIGHTS_PATH):
                try:
                    checkpoint = torch.load(EMOTION_WEIGHTS_PATH, map_location="cpu", weights_only=True)
                except Exception:
                    # Checkpoint contains numpy metadata from training; safe (our own weights)
                    print("[emotion] weights_only=True failed, falling back to weights_only=False (local weights)")
                    checkpoint = torch.load(EMOTION_WEIGHTS_PATH, map_location="cpu", weights_only=False)
                state_dict = checkpoint.get("model_state_dict", checkpoint)
                net.load_state_dict(state_dict)
                print(f"[emotion] Loaded weights from {EMOTION_WEIGHTS_PATH}")
                net.eval()
                _model = net
                print("[emotion] MobileNetV2 emotion model ready")
            else:
                _model = None
                print(f"[emotion] DISABLED: weights not found at {EMOTION_WEIGHTS_PATH}")
        except Exception as e:
            print(f"[emotion] Failed to load emotion model: {e}")
    return _model


# ---------------------------------------------------------------
# Public API
# ---------------------------------------------------------------

def predict_emotion(face_crop_bgr: np.ndarray) -> dict:
    """
    Predict emotion from a BGR face crop.

    Returns:
        {"label": str, "confidence": float, "scores": {label: float}}
        Labels are 6-class API labels: Happy, Neutral, Angry, Fear, Surprise, Sad
    """
    model = get_emotion_model()
    if model is None:
        return {
            "label": "Neutral",
            "confidence": 0.0,
            "scores": {lbl: 0.0 for lbl in EMOTION_LABELS},
        }

    try:
        face_rgb = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2RGB)
        tensor = _preprocess(face_rgb).unsqueeze(0)  # (1, 3, 128, 128)

        with torch.no_grad():
            logits = model(tensor)
            probs = torch.softmax(logits, dim=1)[0]  # (7,)

        # Build 7-class raw scores
        raw_scores = {label: float(probs[i]) for i, label in enumerate(_TRAIN_LABELS_7)}

        # Map to 6-class API scores (merge disgust into angry)
        api_scores = {}
        for train_label, prob in raw_scores.items():
            api_label = _LABEL_TO_API[train_label]
            api_scores[api_label] = api_scores.get(api_label, 0.0) + prob

        # Ensure all 6 labels present
        for label in EMOTION_LABELS:
            if label not in api_scores:
                api_scores[label] = 0.0

        # Normalize to sum to 1
        total = sum(api_scores.values())
        if total > 0:
            api_scores = {k: round(v / total, 4) for k, v in api_scores.items()}

        dominant = max(api_scores, key=api_scores.get)

        return {
            "label": dominant,
            "confidence": api_scores[dominant],
            "scores": api_scores,
        }

    except (cv2.error, ValueError, RuntimeError) as exc:
        # cv2.error: invalid/corrupt image data passed to cvtColor
        # ValueError: unexpected tensor shape from preprocessing
        # RuntimeError: PyTorch inference failure (e.g. device mismatch)
        print(f"[emotion] Prediction error: {exc}")
        return {
            "label": "Neutral",
            "confidence": 0.0,
            "scores": {lbl: 0.0 for lbl in EMOTION_LABELS},
        }
