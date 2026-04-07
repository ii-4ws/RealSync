"""
Configuration for the RealSync AI Inference Service.
"""
import os

# Server
PORT = int(os.getenv("PORT", "5100"))
HOST = os.getenv("HOST", "0.0.0.0")

# Model paths
SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src")
MODELS_DIR = os.path.join(SRC_DIR, "models")

# --- CLIP Deepfake Detection ---
CLIP_DEEPFAKE_ENABLED = True

# --- Emotion Model ---
EMOTION_INPUT_SIZE = 128
EMOTION_WEIGHTS_PATH = os.path.join(MODELS_DIR, "emotion_weights.pth")
EMOTION_LABELS = ["Happy", "Neutral", "Angry", "Fear", "Surprise", "Sad"]

# --- Audio Deepfake (WavLM) ---
WAVLM_WEIGHTS_PATH = os.path.join(MODELS_DIR, "wavlm_audio_weights.pth")
AUDIO_SAMPLE_RATE = 16000
AUDIO_TARGET_LENGTH = 64000

# --- Face Detection ---
FACE_CONFIDENCE_THRESHOLD = 0.4
FACE_PADDING_PERCENT = 0.3
FACE_CROP_SIZE = 224

# --- Deepfake Thresholds ---
DEEPFAKE_AUTH_THRESHOLD_LOW_RISK = 0.70
DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK = 0.40

# --- SPRT (Sequential Probability Ratio Test) ---
SPRT_ALPHA = 0.05              # Max false positive rate (flag real as fake)
SPRT_BETA = 0.05               # Max false negative rate (miss a real fake)
SPRT_REAL_MEAN = 0.78          # Calibrated from live Zoom E2E: real face ~0.75-0.82 with adaptive freq weights
SPRT_FAKE_MEAN = 0.38          # Calibrated from live Zoom E2E: deepfake ~0.25-0.45 with adaptive freq weights
SPRT_SCORE_STD = 0.14          # Wider std to account for Zoom compression variance

# --- Session ---
SESSION_TTL_SECONDS = 3600
SESSION_EVICTION_TRIGGER = 50

# --- Temporal Analysis ---
TEMPORAL_WINDOW_SIZE = 30
TEMPORAL_EWMA_DECAY = 0.90
TEMPORAL_TRUST_DROP_THRESHOLD = 0.40
TEMPORAL_EMOTION_CHANGE_THRESHOLD = 10
TEMPORAL_TREND_THRESHOLD = 0.05
TEMPORAL_SMOOTHING_MIN_FRAMES = 2

# --- Trust Score Weights ---
TRUST_WEIGHT_VIDEO = 0.55
TRUST_WEIGHT_BEHAVIOR = 0.45
BEHAVIOR_BASELINE_SCALE = 0.5

# --- No-Face Detection ---
NO_FACE_THRESHOLD = 30
NO_FACE_COUNTER_MAX = 500
NO_FACE_EVICT_BATCH = 250

# --- Text Analysis ---
TEXT_ALERT_THRESHOLD = 0.65
TEXT_HIGH_SEVERITY_THRESHOLD = 0.80
TEXT_MAX_LENGTH = 2000
TEXT_EXECUTOR_WORKERS = 2
TEXT_INFERENCE_TIMEOUT = 15

# --- Ensemble Deepfake Detection ---
ENSEMBLE_WEIGHT_CLIP = 0.50       # Semantic/spatial analysis (CLIP ViT-L/14)
ENSEMBLE_WEIGHT_FREQUENCY = 0.30  # Frequency-domain artifacts (DCT/FFT)
ENSEMBLE_WEIGHT_BOUNDARY = 0.20   # Face boundary blending artifacts

# --- Inference ---
INFERENCE_TIMEOUT_S = 30
