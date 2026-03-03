"""
Per-frame inference pipeline for the RealSync AI Inference Service.

Takes a single JPEG frame, detects faces, runs deepfake + emotion analysis
on each face, tracks identity, and returns a response matching the
contracts/ai-inference.schema.json contract.
"""
import sys
import os
import base64
import datetime
import re
import time
import threading
from typing import Dict, List, Optional

import cv2
import numpy as np


def _utcnow_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


# Add the src directory to path so we can import existing models
SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from serve.config import (
    FACE_CONFIDENCE_THRESHOLD,
    FACE_PADDING_PERCENT,
    FACE_CROP_SIZE,
    EMOTION_LABELS,
    TRUST_WEIGHT_VIDEO,
    TRUST_WEIGHT_IDENTITY,
    TRUST_WEIGHT_BEHAVIOR,
    BEHAVIOR_BASELINE_SCALE,
    NO_FACE_THRESHOLD,
    NO_FACE_COUNTER_MAX,
    NO_FACE_EVICT_BATCH,
    TEMPORAL_SMOOTHING_MIN_FRAMES,
)
from serve.identity_tracker import IdentityTracker
from serve.temporal_analyzer import TemporalAnalyzer
from serve.emotion_model import predict_emotion, get_emotion_model
from serve.deepfake_model import predict_deepfake, get_deepfake_model


# ---------------------------------------------------------------
# Lazy-loaded models (loaded once on first call)
# ---------------------------------------------------------------

_identity_tracker = IdentityTracker()
_temporal_analyzer = TemporalAnalyzer(window_size=15)

# Camera-off tracking: consecutive no-face frames per session
_no_face_counters: Dict[str, int] = {}

# Per-thread MediaPipe face detector (avoids global lock serialization)
_thread_local = threading.local()
_no_face_lock = threading.Lock()


def _get_face_detector():
    """Load MediaPipe face detector (lazy, per-thread to avoid serialization).

    Caches a sentinel value (False) on failure so we don't retry every frame.
    """
    detector = getattr(_thread_local, "face_detector", None)
    if detector is not None:
        return detector if detector is not False else None
    try:
        import mediapipe as mp
        detector = mp.solutions.face_detection.FaceDetection(
            model_selection=0,
            min_detection_confidence=FACE_CONFIDENCE_THRESHOLD,
        )
        _thread_local.face_detector = detector
        print("[inference] MediaPipe face detector loaded (thread-local)")
    except Exception as e:
        _thread_local.face_detector = False
        print(f"[inference] Failed to load MediaPipe: {e}")
    return getattr(_thread_local, "face_detector", None) or None


def get_identity_tracker() -> IdentityTracker:
    """Return the global identity tracker instance."""
    return _identity_tracker


def get_temporal_analyzer() -> TemporalAnalyzer:
    """Return the global temporal analyzer instance."""
    return _temporal_analyzer


def cleanup_session(session_id: str):
    """Clean up all per-session state (no-face counters, identity, temporal)."""
    with _no_face_lock:
        _no_face_counters.pop(session_id, None)
    _identity_tracker.clear_session(session_id)
    _temporal_analyzer.clear_session(session_id)


# ---------------------------------------------------------------
# Frame decoding
# ---------------------------------------------------------------

def decode_frame(frame_b64: str) -> Optional[np.ndarray]:
    """Decode a base64-encoded JPEG into a BGR numpy array."""
    try:
        # M5: Reject oversized payloads (4MB base64 ≈ 3MB decoded image)
        if len(frame_b64) > 4 * 1024 * 1024:
            print("[inference] Frame rejected: base64 payload exceeds 4MB limit")
            return None
        img_bytes = base64.b64decode(frame_b64, validate=True)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is not None:
            h, w = img.shape[:2]
            if h > 4096 or w > 4096 or h < 10 or w < 10:
                print(f"[inference] Frame rejected: dimensions {w}x{h} out of range")
                return None
        return img
    except Exception as e:
        print(f"[inference] Failed to decode frame: {e}")
        return None


# ---------------------------------------------------------------
# Face detection
# ---------------------------------------------------------------

def detect_faces(img: np.ndarray) -> List[Dict]:
    """
    Detect faces in an image using MediaPipe.

    Returns list of dicts:
        {
            "face_id": int,
            "bbox": {"x": int, "y": int, "w": int, "h": int},
            "confidence": float,
            "crop": np.ndarray (224x224 BGR)
        }
    """
    detector = _get_face_detector()
    if detector is None:
        return []

    h, w, _ = img.shape
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    results = detector.process(rgb)

    faces = []
    if not results.detections:
        return faces

    for i, det in enumerate(results.detections):
        confidence = det.score[0]
        if confidence < FACE_CONFIDENCE_THRESHOLD:
            continue

        box = det.location_data.relative_bounding_box
        x = int(box.xmin * w)
        y = int(box.ymin * h)
        bw = int(box.width * w)
        bh = int(box.height * h)

        # Add padding
        pad_w = int(bw * FACE_PADDING_PERCENT)
        pad_h = int(bh * FACE_PADDING_PERCENT)
        x1 = max(0, x - pad_w)
        y1 = max(0, y - pad_h)
        x2 = min(w, x + bw + pad_w)
        y2 = min(h, y + bh + pad_h)

        crop = img[y1:y2, x1:x2]
        if crop.size == 0 or crop.shape[0] < 20 or crop.shape[1] < 20:
            continue

        crop_resized = cv2.resize(crop, (FACE_CROP_SIZE, FACE_CROP_SIZE))

        faces.append({
            "face_id": i,
            "bbox": {"x": x, "y": y, "w": bw, "h": bh},
            "confidence": round(float(confidence), 4),
            "crop": crop_resized,           # 224x224 (backward compat)
            "crop_original": crop,          # original size, each model resizes as needed
        })

    return faces


# ---------------------------------------------------------------
# Per-face analysis
# ---------------------------------------------------------------

def analyze_deepfake(face_crop: np.ndarray) -> Dict:
    """
    Run EfficientNet-B4+SBI deepfake detection on a face crop.

    Returns:
        {"authenticityScore": float, "riskLevel": str, "model": str}
    """
    return predict_deepfake(face_crop)


def analyze_emotion(face_crop: np.ndarray) -> Dict:
    """
    Run MobileNetV2 emotion recognition on a face crop.

    Returns:
        {"label": str, "confidence": float, "scores": {label: float}}
    """
    return predict_emotion(face_crop)


def analyze_identity(
    session_id: str,
    face_id: int,
    face_crop: np.ndarray,
) -> Dict:
    """
    Track identity consistency for a face within a session.

    Returns:
        {"embeddingShift": float, "samePerson": bool, "riskLevel": str}
    """
    tracker = get_identity_tracker()

    try:
        face_rgb = cv2.cvtColor(face_crop, cv2.COLOR_BGR2RGB)
        embedding = tracker.compute_embedding(face_rgb)
        result = tracker.compare_to_baseline(session_id, face_id, embedding)
        return result
    except Exception as e:
        print(f"[inference] Identity analysis error: {e}")
        return {"embeddingShift": 0.0, "samePerson": True, "riskLevel": "low"}


# ---------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------

def analyze_frame(session_id: str, frame_b64: str, captured_at: Optional[str] = None) -> Dict:
    """
    Full analysis pipeline for a single frame.

    1. Decode JPEG from base64
    2. Detect faces
    3. For each face: deepfake + emotion + identity
    4. Aggregate results

    Returns response matching contracts/ai-inference.schema.json
    """
    # H13: Validate sessionId
    if not session_id or len(session_id) > 64 or not re.match(r'^[a-zA-Z0-9_-]+$', session_id):
        return _empty_response('invalid', captured_at)

    start_time = time.time()

    img = decode_frame(frame_b64)
    if img is None:
        return _empty_response(session_id, captured_at)

    faces = detect_faces(img)
    if len(faces) == 0:
        # Track consecutive no-face frames for camera-off detection
        with _no_face_lock:
            # I3: Evict oldest half of counters if unbounded growth exceeds 500 entries
            if len(_no_face_counters) > NO_FACE_COUNTER_MAX:
                keys = list(_no_face_counters.keys())
                for k in keys[:NO_FACE_EVICT_BATCH]:
                    del _no_face_counters[k]
            _no_face_counters[session_id] = _no_face_counters.get(session_id, 0) + 1
            count = _no_face_counters[session_id]
        if count >= NO_FACE_THRESHOLD:
            return _camera_off_response(session_id, captured_at)
        return _empty_response(session_id, captured_at)

    # Face detected — remove counter instead of resetting to 0
    # to avoid accumulating stale entries for sessions that always have a face
    with _no_face_lock:
        _no_face_counters.pop(session_id, None)

    face_results = []
    for face_info in faces:
        crop = face_info["crop"]
        face_id = face_info["face_id"]

        # H11: Use original-size crop for deepfake — EfficientNet resizes to 380 in one step
        deepfake_result = analyze_deepfake(face_info.get("crop_original", crop))
        emotion_result = analyze_emotion(crop)
        identity_result = analyze_identity(session_id, face_id, crop)

        face_results.append({
            "faceId": face_id,
            "bbox": face_info["bbox"],
            "confidence": face_info["confidence"],
            "emotion": emotion_result,
            "identity": identity_result,
            "deepfake": deepfake_result,
        })

    # Aggregate: use the first (most prominent) face for session-level metrics
    primary = face_results[0]

    # Compute trust score from aggregated signals
    auth_score = primary["deepfake"]["authenticityScore"]
    effective_auth = auth_score if auth_score is not None else 0.5
    shift = primary["identity"]["embeddingShift"]
    emotion_conf = primary["emotion"]["confidence"]

    # Audio comes from a separate endpoint — AI service computes partial trust
    # Backend will merge audio signal and recompute final weighted trust
    audio_conf = None
    video_conf = effective_auth
    # H10: Neutral baseline — range 0.5 (no confidence) to 1.0 (full confidence)
    behavior_conf = round(BEHAVIOR_BASELINE_SCALE * (1.0 + emotion_conf), 4)

    # Weighted trust (video + identity + behavior) — no audio on AI side
    identity_signal = 1.0 - shift
    trust_score = round(
        TRUST_WEIGHT_VIDEO * effective_auth + TRUST_WEIGHT_IDENTITY * identity_signal + TRUST_WEIGHT_BEHAVIOR * behavior_conf,
        4,
    )
    trust_score = max(0.0, min(1.0, trust_score))

    # Temporal analysis: smooth trust scores across frames
    temporal_input = {
        "trustScore": trust_score,
        "authenticityScore": effective_auth,
        "embeddingShift": shift,
        "emotionLabel": primary["emotion"]["label"],
    }
    temporal = _temporal_analyzer.record_frame(session_id, temporal_input)

    # Use smoothed trust score once we have 3+ frames of history
    if temporal["frameCount"] >= TEMPORAL_SMOOTHING_MIN_FRAMES:
        trust_score = temporal["smoothedTrustScore"]

    processed_at = _utcnow_iso()
    elapsed_ms = round((time.time() - start_time) * 1000, 1)
    print(f"[inference] Frame analyzed in {elapsed_ms}ms — {len(faces)} face(s)")

    return {
        "sessionId": session_id,
        "capturedAt": captured_at or processed_at,
        "processedAt": processed_at,
        "faces": face_results,
        "aggregated": {
            "emotion": primary["emotion"],
            "identity": primary["identity"],
            "deepfake": primary["deepfake"],
            "trustScore": trust_score,
            "confidenceLayers": {
                "audio": audio_conf,
                "video": video_conf,
                "behavior": behavior_conf,
            },
            "temporal": temporal,
        },
    }


def _empty_response(session_id: str, captured_at: str = None) -> Dict:
    """Return a response when no faces are detected (transient — not yet camera-off)."""
    now = _utcnow_iso()
    return {
        "sessionId": session_id,
        "capturedAt": captured_at or now,
        "processedAt": now,
        "faces": [],
        "aggregated": {
            "emotion": {
                "label": "Neutral",
                "confidence": 0.0,
                "scores": {lbl: 0.0 for lbl in EMOTION_LABELS},
            },
            "identity": {
                "embeddingShift": 0.0,
                "samePerson": True,
                "riskLevel": "low",
            },
            "deepfake": {
                "authenticityScore": 1.0,
                "riskLevel": "low",
                "model": "EfficientNet-B4-SBI",
            },
            "trustScore": None,
            "noFaceDetected": True,
            "confidenceLayers": {
                "audio": None,
                "video": None,
                "behavior": None,
            },
            "temporal": None,
        },
    }


def _camera_off_response(session_id: str, captured_at: str = None) -> Dict:
    """Return a response when camera is off (5+ consecutive no-face frames)."""
    now = _utcnow_iso()
    return {
        "sessionId": session_id,
        "capturedAt": captured_at or now,
        "processedAt": now,
        "faces": [],
        "aggregated": {
            "emotion": {
                "label": "Neutral",
                "confidence": 0.0,
                "scores": {lbl: 0.0 for lbl in EMOTION_LABELS},
            },
            "identity": {
                "embeddingShift": 0.0,
                "samePerson": True,
                "riskLevel": "low",
            },
            "deepfake": {
                "authenticityScore": None,
                "riskLevel": "unknown",
                "model": "camera-off",
            },
            "trustScore": None,
            "cameraOff": True,
            "noFaceDetected": True,
            "confidenceLayers": {
                "audio": None,
                "video": None,
                "behavior": None,
            },
            "temporal": None,
        },
    }
