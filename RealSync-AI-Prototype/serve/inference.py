"""
Per-frame inference pipeline for the RealSync AI Inference Service.

Takes a single JPEG frame, detects faces, runs deepfake + emotion analysis
on each face, tracks identity, and returns a response matching the
contracts/ai-inference.schema.json contract.
"""
import sys
import os
import base64
import io
import time
from typing import Dict, List, Optional

import cv2
import numpy as np

# Add the src directory to path so we can import existing models
SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from serve.config import (
    FACE_CONFIDENCE_THRESHOLD,
    FACE_PADDING_PERCENT,
    FACE_CROP_SIZE,
    MESONET_INPUT_SIZE,
    FER_TO_LABEL,
    EMOTION_LABELS,
)
from serve.identity_tracker import IdentityTracker


# ---------------------------------------------------------------
# Lazy-loaded models (loaded once on first call)
# ---------------------------------------------------------------

_mesonet_model = None
_fer_detector = None
_mp_face_detection = None
_identity_tracker = IdentityTracker()


def _get_mesonet():
    """Load MesoNet-4 model (lazy)."""
    global _mesonet_model
    if _mesonet_model is None:
        try:
            from video_model import get_model
            _mesonet_model = get_model()
            print("[inference] MesoNet-4 model loaded")
        except Exception as e:
            print(f"[inference] Failed to load MesoNet-4: {e}")
    return _mesonet_model


def _get_fer():
    """Load FER detector (lazy)."""
    global _fer_detector
    if _fer_detector is None:
        try:
            from fer import FER
            _fer_detector = FER(mtcnn=True)
            print("[inference] FER emotion detector loaded")
        except Exception as e:
            print(f"[inference] Failed to load FER: {e}")
    return _fer_detector


def _get_face_detector():
    """Load MediaPipe face detector (lazy)."""
    global _mp_face_detection
    if _mp_face_detection is None:
        try:
            import mediapipe as mp
            _mp_face_detection = mp.solutions.face_detection.FaceDetection(
                model_selection=1,
                min_detection_confidence=FACE_CONFIDENCE_THRESHOLD,
            )
            print("[inference] MediaPipe face detector loaded")
        except Exception as e:
            print(f"[inference] Failed to load MediaPipe: {e}")
    return _mp_face_detection


def get_identity_tracker() -> IdentityTracker:
    """Return the global identity tracker instance."""
    return _identity_tracker


# ---------------------------------------------------------------
# Frame decoding
# ---------------------------------------------------------------

def decode_frame(frame_b64: str) -> Optional[np.ndarray]:
    """Decode a base64-encoded JPEG into a BGR numpy array."""
    try:
        img_bytes = base64.b64decode(frame_b64)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
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
            "crop": crop_resized,
        })

    return faces


# ---------------------------------------------------------------
# Per-face analysis
# ---------------------------------------------------------------

def analyze_deepfake(face_crop: np.ndarray) -> Dict:
    """
    Run MesoNet-4 deepfake detection on a face crop.

    Returns:
        {"authenticityScore": float, "riskLevel": str, "model": str}
    """
    model = _get_mesonet()
    if model is None:
        return {"authenticityScore": 0.85, "riskLevel": "low", "model": "MesoNet-4 (unavailable)"}

    try:
        # Preprocess for MesoNet-4: 256x256 RGB, normalized to [0,1]
        face_rgb = cv2.cvtColor(face_crop, cv2.COLOR_BGR2RGB)
        face_resized = cv2.resize(face_rgb, (MESONET_INPUT_SIZE, MESONET_INPUT_SIZE))
        face_norm = face_resized.astype(np.float32) / 255.0
        face_batch = np.expand_dims(face_norm, axis=0)

        # Predict: 0 = real, 1 = fake
        prediction = float(model.predict(face_batch, verbose=0)[0][0])

        # Convert to authenticity score (1 = real, 0 = fake)
        authenticity = round(1.0 - prediction, 4)

        if authenticity > 0.85:
            risk = "low"
        elif authenticity > 0.70:
            risk = "medium"
        else:
            risk = "high"

        return {
            "authenticityScore": authenticity,
            "riskLevel": risk,
            "model": "MesoNet-4",
        }

    except Exception as e:
        print(f"[inference] Deepfake analysis error: {e}")
        return {"authenticityScore": 0.85, "riskLevel": "low", "model": "MesoNet-4 (error)"}


def analyze_emotion(face_crop: np.ndarray) -> Dict:
    """
    Run FER emotion recognition on a face crop.

    Returns:
        {
            "label": str (e.g. "Happy"),
            "confidence": float,
            "scores": {"Happy": float, "Neutral": float, ...}
        }
    """
    detector = _get_fer()
    if detector is None:
        return {
            "label": "Neutral",
            "confidence": 0.5,
            "scores": {e: 0.0 for e in EMOTION_LABELS},
        }

    try:
        emotions = detector.detect_emotions(face_crop)

        if not emotions or len(emotions) == 0:
            return {
                "label": "Neutral",
                "confidence": 0.5,
                "scores": {e: 0.0 for e in EMOTION_LABELS},
            }

        fer_scores = emotions[0]["emotions"]

        # Map FER labels to our labels
        scores = {}
        for fer_key, value in fer_scores.items():
            our_label = FER_TO_LABEL.get(fer_key)
            if our_label:
                if our_label in scores:
                    scores[our_label] = max(scores[our_label], value)
                else:
                    scores[our_label] = value

        # Ensure all labels present
        for label in EMOTION_LABELS:
            if label not in scores:
                scores[label] = 0.0

        # Normalize scores to sum to 1
        total = sum(scores.values())
        if total > 0:
            scores = {k: round(v / total, 4) for k, v in scores.items()}

        # Find dominant emotion
        dominant = max(scores, key=scores.get)

        return {
            "label": dominant,
            "confidence": scores[dominant],
            "scores": scores,
        }

    except Exception as e:
        print(f"[inference] Emotion analysis error: {e}")
        return {
            "label": "Neutral",
            "confidence": 0.5,
            "scores": {e_label: 0.0 for e_label in EMOTION_LABELS},
        }


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

def analyze_frame(session_id: str, frame_b64: str, captured_at: str = None) -> Dict:
    """
    Full analysis pipeline for a single frame.

    1. Decode JPEG from base64
    2. Detect faces
    3. For each face: deepfake + emotion + identity
    4. Aggregate results

    Returns response matching contracts/ai-inference.schema.json
    """
    start_time = time.time()

    img = decode_frame(frame_b64)
    if img is None:
        return _empty_response(session_id, captured_at)

    faces = detect_faces(img)
    if len(faces) == 0:
        return _empty_response(session_id, captured_at)

    face_results = []
    for face_info in faces:
        crop = face_info["crop"]
        face_id = face_info["face_id"]

        deepfake_result = analyze_deepfake(crop)
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
    shift = primary["identity"]["embeddingShift"]
    emotion_conf = primary["emotion"]["confidence"]

    audio_conf = 0.9  # placeholder — no audio analysis in frame pipeline
    video_conf = auth_score
    behavior_conf = round(0.55 + emotion_conf * 0.4, 4)

    trust_score = round(
        (auth_score + audio_conf + (1 - shift) + behavior_conf) / 4, 4
    )
    trust_score = max(0.0, min(1.0, trust_score))

    processed_at = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
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
        },
    }


def _empty_response(session_id: str, captured_at: str = None) -> Dict:
    """Return a response when no faces are detected."""
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    return {
        "sessionId": session_id,
        "capturedAt": captured_at or now,
        "processedAt": now,
        "faces": [],
        "aggregated": {
            "emotion": {
                "label": "Neutral",
                "confidence": 0.0,
                "scores": {e: 0.0 for e in EMOTION_LABELS},
            },
            "identity": {
                "embeddingShift": 0.0,
                "samePerson": True,
                "riskLevel": "low",
            },
            "deepfake": {
                "authenticityScore": 1.0,
                "riskLevel": "low",
                "model": "MesoNet-4",
            },
            "trustScore": 0.95,
            "confidenceLayers": {
                "audio": 0.9,
                "video": 1.0,
                "behavior": 0.55,
            },
        },
    }
