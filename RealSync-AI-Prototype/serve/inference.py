"""
Per-frame inference pipeline for the RealSync AI Inference Service.

Takes a single JPEG frame, detects faces, runs CLIP deepfake detection
+ emotion analysis, feeds scores to SPRT accumulator and temporal analyzer.
"""
import sys
import os
import base64
import datetime
import re
import time
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Dict, List, Optional

import cv2
import numpy as np


def _utcnow_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from serve.config import (
    FACE_CONFIDENCE_THRESHOLD,
    FACE_PADDING_PERCENT,
    FACE_CROP_SIZE,
    EMOTION_LABELS,
    TRUST_WEIGHT_VIDEO,
    TRUST_WEIGHT_BEHAVIOR,
    NO_FACE_THRESHOLD,
    NO_FACE_COUNTER_MAX,
    NO_FACE_EVICT_BATCH,
    TEMPORAL_SMOOTHING_MIN_FRAMES,
    TEMPORAL_WINDOW_SIZE,
    INFERENCE_TIMEOUT_S,
    ENSEMBLE_WEIGHT_CLIP,
    ENSEMBLE_WEIGHT_FREQUENCY,
    ENSEMBLE_WEIGHT_BOUNDARY,
)
from serve.temporal_analyzer import TemporalAnalyzer
from serve.emotion_model import predict_emotion, get_emotion_model
from serve.clip_deepfake_model import predict_clip_deepfake, get_clip_deepfake_model
from serve.sprt_detector import SPRTDetector
from serve.frequency_analyzer import analyze_frequency
from serve.boundary_analyzer import analyze_boundary


# ---------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------

_inference_pool = ThreadPoolExecutor(max_workers=2)
_temporal_analyzer = TemporalAnalyzer(window_size=TEMPORAL_WINDOW_SIZE)
_sprt = SPRTDetector()

_no_face_counters: Dict[str, int] = {}
_thread_local = threading.local()
_no_face_lock = threading.Lock()


def _get_face_detector():
    """Load MediaPipe face detector (lazy, per-thread)."""
    detector = getattr(_thread_local, "face_detector", None)
    if detector is not None:
        return detector if detector is not False else None
    try:
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision

        model_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            "src", "models", "blaze_face_short_range.tflite",
        )
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Face detection model not found at {model_path}")

        options = vision.FaceDetectorOptions(
            base_options=BaseOptions(model_asset_path=model_path),
            min_detection_confidence=FACE_CONFIDENCE_THRESHOLD,
        )
        detector = vision.FaceDetector.create_from_options(options)
        _thread_local.face_detector = detector
        print("[inference] MediaPipe face detector loaded (Tasks API, thread-local)")
    except Exception as e:
        _thread_local.face_detector = False
        print(f"[inference] Failed to load MediaPipe face detector: {e}")
    return getattr(_thread_local, "face_detector", None) or None


def get_temporal_analyzer() -> TemporalAnalyzer:
    return _temporal_analyzer


def cleanup_session(session_id: str):
    with _no_face_lock:
        _no_face_counters.pop(session_id, None)
    _temporal_analyzer.clear_session(session_id)
    _sprt.clear_session(session_id)


# ---------------------------------------------------------------
# Frame decoding
# ---------------------------------------------------------------

def decode_frame(frame_b64: str) -> Optional[np.ndarray]:
    """Decode a base64-encoded image (JPEG or PNG) into a BGR numpy array."""
    try:
        if len(frame_b64) > 10 * 1024 * 1024:  # 10MB limit for PNG frames
            print("[inference] Frame rejected: payload exceeds 10MB limit")
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
    """Detect faces using MediaPipe Tasks API."""
    detector = _get_face_detector()
    if detector is None:
        return []

    h, w, _ = img.shape
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    import mediapipe as mp
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    results = detector.detect(mp_image)

    faces = []
    if not results.detections:
        return faces

    for i, det in enumerate(results.detections):
        confidence = det.categories[0].score if det.categories else 0.0
        if confidence < FACE_CONFIDENCE_THRESHOLD:
            continue

        box = det.bounding_box
        x, y, bw, bh = box.origin_x, box.origin_y, box.width, box.height

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
            "crop_original": crop,
        })

    return faces


# ---------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------

def analyze_frame(session_id: str, frame_b64: str, captured_at: Optional[str] = None) -> Dict:
    """
    Full analysis pipeline for a single frame.

    1. Decode image from base64
    2. Detect faces
    3. For each face: CLIP deepfake + emotion (parallel)
    4. Feed CLIP score to SPRT accumulator
    5. Temporal smoothing
    6. Return response
    """
    if len(_no_face_counters) > 100:
        _no_face_counters.clear()

    if not session_id or len(session_id) > 64 or not re.match(r'^[a-zA-Z0-9_-]+$', session_id):
        return _empty_response('invalid', captured_at)

    start_time = time.time()

    img = decode_frame(frame_b64)
    if img is None:
        return _empty_response(session_id, captured_at)

    faces = detect_faces(img)
    if len(faces) == 0:
        with _no_face_lock:
            if len(_no_face_counters) > NO_FACE_COUNTER_MAX:
                keys = list(_no_face_counters.keys())
                for k in keys[:NO_FACE_EVICT_BATCH]:
                    del _no_face_counters[k]
            _no_face_counters[session_id] = _no_face_counters.get(session_id, 0) + 1
            count = _no_face_counters[session_id]
        if count >= NO_FACE_THRESHOLD:
            return _camera_off_response(session_id, captured_at)
        return _empty_response(session_id, captured_at)

    with _no_face_lock:
        _no_face_counters.pop(session_id, None)

    face_results = []
    for face_info in faces:
        crop = face_info["crop"]
        deepfake_crop = face_info.get("crop_original", crop)

        # Run CLIP deepfake + emotion + frequency + boundary in parallel
        clip_future = _inference_pool.submit(predict_clip_deepfake, deepfake_crop)
        emo_future = _inference_pool.submit(predict_emotion, crop)
        freq_future = _inference_pool.submit(analyze_frequency, deepfake_crop)
        boundary_future = _inference_pool.submit(analyze_boundary, deepfake_crop)

        clip_result = {"authenticityScore": None, "riskLevel": "unknown", "model": "timeout"}
        emotion_result = {"label": "Neutral", "confidence": 0.0, "scores": {}}
        freq_result = {"frequencyScore": 0.5, "highFreqRatio": 0.0, "spectralFlatness": 0.0}
        boundary_result = {"boundaryScore": 0.5, "gradientDiscontinuity": 0.0, "colorShift": 0.0}

        try:
            clip_result = clip_future.result(timeout=INFERENCE_TIMEOUT_S)
        except FuturesTimeoutError:
            print(f"[inference] CLIP model timed out for session {session_id}")

        try:
            emotion_result = emo_future.result(timeout=INFERENCE_TIMEOUT_S)
        except FuturesTimeoutError:
            print(f"[inference] Emotion model timed out for session {session_id}")

        try:
            freq_result = freq_future.result(timeout=10)
        except (FuturesTimeoutError, Exception) as e:
            print(f"[inference] Frequency analyzer failed for session {session_id}: {e}")

        try:
            boundary_result = boundary_future.result(timeout=10)
        except (FuturesTimeoutError, Exception) as e:
            print(f"[inference] Boundary analyzer failed for session {session_id}: {e}")

        # Ensemble: weighted combination of all three detectors
        clip_score = clip_result.get("authenticityScore")
        freq_score = freq_result["frequencyScore"]
        boundary_score = boundary_result["boundaryScore"]

        if clip_score is not None:
            # Adaptive: when frequency signal is weak (Zoom H.264 strips texture),
            # boost CLIP weight from 50%→65% and reduce frequency from 30%→15%
            if freq_score < 0.55:
                eff_clip_w = 0.65
                eff_freq_w = 0.15
                eff_bnd_w = ENSEMBLE_WEIGHT_BOUNDARY  # 0.20 stays
                ensemble_score = round(
                    eff_clip_w * clip_score + eff_freq_w * freq_score + eff_bnd_w * boundary_score,
                    4,
                )
            else:
                ensemble_score = round(
                    ENSEMBLE_WEIGHT_CLIP * clip_score
                    + ENSEMBLE_WEIGHT_FREQUENCY * freq_score
                    + ENSEMBLE_WEIGHT_BOUNDARY * boundary_score,
                    4,
                )
            # Determine risk level from ensemble score
            if ensemble_score > 0.70:
                ensemble_risk = "low"
            elif ensemble_score > 0.40:
                ensemble_risk = "medium"
            else:
                ensemble_risk = "high"
        else:
            ensemble_score = None
            ensemble_risk = "unknown"

        deepfake_result = {
            "authenticityScore": ensemble_score,
            "riskLevel": ensemble_risk,
            "model": "ensemble(CLIP+freq+boundary)",
            "components": {
                "clip": clip_result,
                "frequency": freq_result,
                "boundary": boundary_result,
            },
        }

        face_results.append({
            "faceId": face_info["face_id"],
            "bbox": face_info["bbox"],
            "confidence": face_info["confidence"],
            "emotion": emotion_result,
            "deepfake": deepfake_result,
        })

    # Aggregate: primary face
    primary = face_results[0]

    auth_score = primary["deepfake"]["authenticityScore"]
    effective_auth = auth_score if auth_score is not None else 0.5
    emotion_conf = primary["emotion"]["confidence"]

    # Feed to SPRT
    sprt_result = _sprt.update(session_id, auth_score)

    # Trust score
    audio_conf = None
    video_conf = effective_auth
    behavior_conf = round(0.5 + emotion_conf * 0.5, 4)

    trust_score = round(
        TRUST_WEIGHT_VIDEO * effective_auth + TRUST_WEIGHT_BEHAVIOR * behavior_conf,
        4,
    )
    trust_score = max(0.0, min(1.0, trust_score))

    # Temporal smoothing
    temporal_input = {
        "trustScore": trust_score,
        "authenticityScore": effective_auth,
        "emotionLabel": primary["emotion"]["label"],
    }
    temporal = _temporal_analyzer.record_frame(session_id, temporal_input)

    if temporal["frameCount"] >= TEMPORAL_SMOOTHING_MIN_FRAMES:
        trust_score = temporal["smoothedTrustScore"]

    processed_at = _utcnow_iso()
    elapsed_ms = round((time.time() - start_time) * 1000, 1)
    print(f"[inference] Frame analyzed in {elapsed_ms}ms — {len(faces)} face(s), SPRT: {sprt_result['decision']}")

    return {
        "sessionId": session_id,
        "capturedAt": captured_at or processed_at,
        "processedAt": processed_at,
        "faces": face_results,
        "aggregated": {
            "emotion": primary["emotion"],
            "deepfake": primary["deepfake"],
            "trustScore": trust_score,
            "sprt": sprt_result,
            "confidenceLayers": {
                "audio": audio_conf,
                "video": video_conf,
                "behavior": behavior_conf,
            },
            "temporal": temporal,
        },
    }


def _empty_response(session_id: str, captured_at: str = None) -> Dict:
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
            "deepfake": {
                "authenticityScore": 1.0,
                "riskLevel": "low",
                "model": "no-face",
            },
            "trustScore": None,
            "noFaceDetected": True,
            "sprt": None,
            "confidenceLayers": {
                "audio": None,
                "video": None,
                "behavior": None,
            },
            "temporal": None,
        },
    }


def _camera_off_response(session_id: str, captured_at: str = None) -> Dict:
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
            "deepfake": {
                "authenticityScore": None,
                "riskLevel": "unknown",
                "model": "camera-off",
            },
            "trustScore": None,
            "cameraOff": True,
            "noFaceDetected": True,
            "sprt": None,
            "confidenceLayers": {
                "audio": None,
                "video": None,
                "behavior": None,
            },
            "temporal": None,
        },
    }
