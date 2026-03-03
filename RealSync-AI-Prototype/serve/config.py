"""
Configuration for the RealSync AI Inference Service.
"""
import os

# Server
PORT = int(os.getenv("PORT", "5100"))
HOST = os.getenv("HOST", "0.0.0.0")

# Model paths (relative to RealSync-AI-Prototype/src/)
SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src")
MODELS_DIR = os.path.join(SRC_DIR, "models")

# EfficientNet-B4 + SBI deepfake detection
EFFICIENTNET_INPUT_SIZE = 380  # pixels
EFFICIENTNET_WEIGHTS_PATH = os.path.join(MODELS_DIR, "efficientnet_b4_deepfake.pth")

# MobileNetV2 emotion model
EMOTION_INPUT_SIZE = 128  # pixels
EMOTION_WEIGHTS_PATH = os.path.join(MODELS_DIR, "emotion_weights.pth")

# AASIST audio deepfake detection
AASIST_WEIGHTS_PATH = os.path.join(MODELS_DIR, "aasist_weights.pth")

# Face detection
FACE_CONFIDENCE_THRESHOLD = 0.4
FACE_PADDING_PERCENT = 0.3
FACE_CROP_SIZE = 224  # pixels

# Identity tracking — FaceNet InceptionResnetV1
FACENET_INPUT_SIZE = 160  # pixels, required by InceptionResnetV1
FACENET_PRETRAINED = 'vggface2'  # pretrained weights dataset
IDENTITY_SHIFT_LOW = 0.20  # below this = low risk
IDENTITY_SHIFT_HIGH = 0.40  # above this = high risk

# Temporal analysis
TEMPORAL_WINDOW_SIZE = 15
TEMPORAL_TRUST_DROP_THRESHOLD = 0.20
TEMPORAL_IDENTITY_SWITCH_LOW = 0.15
TEMPORAL_IDENTITY_SWITCH_HIGH = 0.35
TEMPORAL_EMOTION_CHANGE_THRESHOLD = 5

# Deepfake thresholds (H9: renamed for clarity)
DEEPFAKE_AUTH_THRESHOLD_LOW_RISK = 0.85   # above → low risk
DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK = 0.70  # below → high risk

# Emotion thresholds
EMOTION_LABELS = ["Happy", "Neutral", "Angry", "Fear", "Surprise", "Sad"]

# --- Session & Identity ---
SESSION_TTL_SECONDS = 3600
IDENTITY_SAME_PERSON_THRESHOLD = 0.25
IDENTITY_EMA_ALPHA = 0.1
SESSION_EVICTION_TRIGGER = 50

# --- Temporal Analysis ---
TEMPORAL_EWMA_DECAY = 0.85
TEMPORAL_TREND_THRESHOLD = 0.05
TEMPORAL_SMOOTHING_MIN_FRAMES = 3

# --- Trust Score Weights ---
TRUST_WEIGHT_VIDEO = 0.47
TRUST_WEIGHT_IDENTITY = 0.33
TRUST_WEIGHT_BEHAVIOR = 0.20
BEHAVIOR_BASELINE_SCALE = 0.5

# --- No-Face Detection ---
NO_FACE_THRESHOLD = 5
NO_FACE_COUNTER_MAX = 500
NO_FACE_EVICT_BATCH = 250

# --- Audio Analysis ---
AUDIO_SAMPLE_RATE = 16000
AUDIO_TARGET_LENGTH = 64000

# --- Text Analysis ---
TEXT_ALERT_THRESHOLD = 0.65
TEXT_HIGH_SEVERITY_THRESHOLD = 0.80
TEXT_MAX_LENGTH = 2000
TEXT_EXECUTOR_WORKERS = 2
TEXT_INFERENCE_TIMEOUT = 5
