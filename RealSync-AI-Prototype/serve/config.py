"""
Configuration for the RealSync AI Inference Service.
"""
import os

# Server
PORT = int(os.getenv("PORT", "5100"))
HOST = os.getenv("HOST", "0.0.0.0")

# Model paths (relative to RealSync-AI-Prototype/src/)
SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src")
WEIGHTS_PATH = os.path.join(SRC_DIR, "models", "mesonet4_weights.h5")

# Face detection
FACE_CONFIDENCE_THRESHOLD = 0.5
FACE_PADDING_PERCENT = 0.3
FACE_CROP_SIZE = 224  # pixels

# MesoNet-4 input
MESONET_INPUT_SIZE = 256  # pixels

# Identity tracking
IDENTITY_EMBEDDING_DIM = 128  # face embedding vector size
IDENTITY_SHIFT_LOW = 0.20  # below this = low risk
IDENTITY_SHIFT_HIGH = 0.40  # above this = high risk

# Deepfake thresholds
DEEPFAKE_AUTH_LOW = 0.85  # above this = low risk
DEEPFAKE_AUTH_HIGH = 0.70  # below this = high risk

# Emotion thresholds
EMOTION_LABELS = ["Happy", "Neutral", "Angry", "Fear", "Surprise", "Sad"]

# FER to our label mapping
FER_TO_LABEL = {
    "happy": "Happy",
    "neutral": "Neutral",
    "angry": "Angry",
    "fear": "Fear",
    "surprise": "Surprise",
    "sad": "Sad",
    "disgust": "Angry",  # map disgust → angry for simplicity
}
