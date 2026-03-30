"""
Emotion model — EfficientNet-B2 or MobileNetV2 fine-tuned for 7-class emotions.

Architecture auto-detected from checkpoint metadata:
  Backbone features → AdaptiveAvgPool2d → Flatten → feat_dim→256→7

Loads weights from src/models/emotion_weights.pth (checkpoint format).
Falls back gracefully if weights not found.

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

# Backbone registry — must match train_emotion.py
_BACKBONE_REGISTRY = {
    'efficientnet_b2': (1408, models.efficientnet_b2),
    'efficientnet_b0': (1280, models.efficientnet_b0),
    'mobilenetv2':     (1280, models.mobilenet_v2),
}


class EmotionNet(nn.Module):
    """Configurable backbone for 7-class emotion classification."""

    def __init__(self, num_classes=7, backbone_name='mobilenetv2'):
        super().__init__()
        feat_dim, constructor = _BACKBONE_REGISTRY[backbone_name]
        backbone = constructor(weights=None)
        self.features = backbone.features
        self.pool = nn.AdaptiveAvgPool2d((1, 1))
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.4),
            nn.Linear(feat_dim, 256),
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

_LOAD_FAILED = object()  # Sentinel to prevent infinite retry on load failure
_model = None
_preprocess = None
_lock = threading.Lock()


def _build_preprocess(img_size):
    return transforms.Compose([
        transforms.ToPILImage(),
        transforms.Resize((img_size, img_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])


def get_emotion_model():
    """Load or return the cached emotion model (thread-safe).
    Auto-detects backbone and input size from checkpoint metadata."""
    global _model, _preprocess
    if _model is not None:
        return None if _model is _LOAD_FAILED else _model
    with _lock:
        if _model is not None:
            return None if _model is _LOAD_FAILED else _model
        try:
            if not os.path.isfile(EMOTION_WEIGHTS_PATH):
                _model = _LOAD_FAILED
                print("[emotion] DISABLED: weights not found at " + EMOTION_WEIGHTS_PATH)
                return None

            checkpoint = torch.load(EMOTION_WEIGHTS_PATH, map_location="cpu", weights_only=True)

            # Auto-detect architecture from checkpoint metadata
            backbone_name = checkpoint.get("backbone", "mobilenetv2")
            img_size = checkpoint.get("img_size", EMOTION_INPUT_SIZE)

            net = EmotionNet(num_classes=7, backbone_name=backbone_name)
            state_dict = checkpoint.get("model_state_dict", checkpoint)
            net.load_state_dict(state_dict)
            # Use CUDA (NVIDIA GPU), MPS (Apple Silicon), or CPU
            _device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
            net = net.to(_device)
            net.train(False)
            net._device = _device
            _preprocess = _build_preprocess(img_size)
            _model = net  # Publish model AFTER _preprocess is set (ordering matters for readers outside lock)
            print("[emotion] Loaded " + backbone_name + " on " + _device + " (" + str(img_size) + "x" + str(img_size) + ")")
            print("[emotion] Emotion model ready")
        except Exception as e:
            print("[emotion] Failed to load emotion model: " + str(e))
            _model = _LOAD_FAILED  # #20: Cache failure to prevent retry on every request
    return None if _model is _LOAD_FAILED else _model


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
        # I3: Read _preprocess after get_emotion_model() guarantees it's set
        preprocess = _preprocess or _build_preprocess(EMOTION_INPUT_SIZE)
        device = getattr(model, '_device', 'cpu')
        tensor = preprocess(face_rgb).unsqueeze(0).to(device)

        # TTA: average predictions from original + horizontal flip
        with torch.no_grad():
            logits = model(tensor)
            logits_flip = model(torch.flip(tensor, dims=[3]))
            probs = torch.softmax((logits + logits_flip) / 2, dim=1)[0]  # (7,)

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
