"""
Per-session face identity tracking via FaceNet embedding comparison.

Uses InceptionResnetV1 (pretrained on VGGFace2) to compute 512-dim face
embeddings. Compares each frame's embedding against a per-session baseline
using cosine distance. Supports EMA baseline drift and TTL eviction.

Upgraded from random-projection embeddings (60-75% accuracy) to FaceNet
(>99% LFW accuracy).
"""
import time
import threading
import numpy as np
import cv2
from typing import Dict, Optional

import torch

from serve.config import (
    FACENET_INPUT_SIZE,
    FACENET_PRETRAINED,
    IDENTITY_SHIFT_LOW,
    IDENTITY_SHIFT_HIGH,
    SESSION_TTL_SECONDS,
    IDENTITY_SAME_PERSON_THRESHOLD,
    IDENTITY_EMA_ALPHA,
    SESSION_EVICTION_TRIGGER,
)

# Lazy-loaded FaceNet model (singleton)
_facenet_model = None
_facenet_lock = threading.Lock()


def _get_facenet():
    """Load FaceNet InceptionResnetV1 model (lazy, thread-safe)."""
    global _facenet_model
    if _facenet_model is not None:
        return _facenet_model
    with _facenet_lock:
        if _facenet_model is not None:
            return _facenet_model
        try:
            from facenet_pytorch import InceptionResnetV1
            model = InceptionResnetV1(pretrained=FACENET_PRETRAINED).eval()
            _facenet_model = model
            print(f"[identity_tracker] FaceNet model loaded (pretrained={FACENET_PRETRAINED})")
        except Exception as e:
            print(f"[identity_tracker] Failed to load FaceNet: {e}")
    return _facenet_model


class IdentityTracker:
    """Track face identity consistency within a session using FaceNet embeddings."""

    def __init__(self):
        # session_id -> { face_id -> baseline_embedding }
        self._baselines: Dict[str, Dict[int, np.ndarray]] = {}
        # session_id -> last access timestamp
        self._last_access: Dict[str, float] = {}
        self._lock = threading.Lock()

    def _get_model(self):
        """Return the lazily-loaded FaceNet model."""
        return _get_facenet()

    def compute_embedding(self, face_rgb: np.ndarray) -> Optional[np.ndarray]:
        """
        Compute a 512-dim face embedding using FaceNet InceptionResnetV1.

        Args:
            face_rgb: numpy array, shape (H, W, 3), dtype uint8 or float32, RGB order

        Returns:
            numpy array, shape (512,), L2-normalized
        """
        model = self._get_model()
        if model is None:
            return None

        # Resize to 160x160 (FaceNet input requirement)
        if face_rgb.shape[0] != FACENET_INPUT_SIZE or face_rgb.shape[1] != FACENET_INPUT_SIZE:
            face_rgb = cv2.resize(face_rgb, (FACENET_INPUT_SIZE, FACENET_INPUT_SIZE))

        # Normalize to [-1, 1] range expected by InceptionResnetV1
        if face_rgb.dtype == np.uint8:
            face_float = face_rgb.astype(np.float32) / 255.0
        else:
            face_float = face_rgb.astype(np.float32)
        face_norm = (face_float - 0.5) / 0.5

        # HWC -> CHW, add batch dimension
        face_tensor = torch.from_numpy(face_norm.transpose(2, 0, 1)).unsqueeze(0)

        # Run inference (model set to eval mode via classify=False)
        with torch.no_grad():
            embedding_tensor = model(face_tensor)

        embedding = embedding_tensor.squeeze(0).numpy()

        # L2 normalize
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm

        return embedding

    def _evict_stale_sessions(self):
        """Remove sessions that haven't been accessed within SESSION_TTL_SECONDS.

        Note: Caller must hold self._lock. Collects stale keys under lock,
        performs cleanup in-place (no I/O under lock).
        """
        now = time.time()
        stale = [sid for sid, ts in self._last_access.items()
                 if now - ts > SESSION_TTL_SECONDS]
        for sid in stale:
            self._baselines.pop(sid, None)
            self._last_access.pop(sid, None)
        return len(stale)

    def compare_to_baseline(
        self,
        session_id: str,
        face_id: int,
        embedding: np.ndarray,
    ) -> Dict:
        """
        Compare a face embedding to the stored baseline for this session/face.

        On first call for a session+face, stores the embedding as baseline.
        On subsequent calls, computes cosine distance.

        Returns:
            {
                "embeddingShift": float (0-1, cosine distance),
                "samePerson": bool,
                "riskLevel": "low" | "medium" | "high"
            }
        """
        if embedding is None:
            return {
                "embeddingShift": 0.0,
                "samePerson": True,
                "riskLevel": "low",
            }

        # The lock covers the entire read-check-write sequence so that two
        # concurrent frames for the same session cannot both see "no baseline"
        # and both store their embedding.  Do NOT narrow this lock scope.
        with self._lock:
            self._last_access[session_id] = time.time()

            if len(self._baselines) > SESSION_EVICTION_TRIGGER:
                self._evict_stale_sessions()

            if session_id not in self._baselines:
                self._baselines[session_id] = {}

            baselines = self._baselines[session_id]

            if face_id not in baselines:
                # First time seeing this face — store as baseline
                baselines[face_id] = embedding.copy()
                return {
                    "embeddingShift": 0.0,
                    "samePerson": True,
                    "riskLevel": "low",
                }

            baseline = baselines[face_id]

            # Cosine distance (0 = identical, 1 = orthogonal, 2 = opposite)
            cosine_sim = float(np.dot(baseline, embedding))
            # Clamp to [0, 1] range for shift
            shift = max(0.0, min(1.0, 1.0 - cosine_sim))

            # Determine risk level
            if shift < IDENTITY_SHIFT_LOW:
                risk = "low"
            elif shift < IDENTITY_SHIFT_HIGH:
                risk = "medium"
            else:
                risk = "high"

            same_person = shift < IDENTITY_SAME_PERSON_THRESHOLD

            # Slowly update baseline (exponential moving average)
            baselines[face_id] = (1 - IDENTITY_EMA_ALPHA) * baseline + IDENTITY_EMA_ALPHA * embedding
            # Re-normalize
            norm = np.linalg.norm(baselines[face_id])
            if norm > 0:
                baselines[face_id] = baselines[face_id] / norm

            return {
                "embeddingShift": round(shift, 4),
                "samePerson": same_person,
                "riskLevel": risk,
            }

    def clear_session(self, session_id: str):
        """Remove stored baselines for a session."""
        with self._lock:
            self._baselines.pop(session_id, None)
            self._last_access.pop(session_id, None)

    def clear_all(self):
        """Remove all stored baselines."""
        with self._lock:
            self._baselines.clear()
            self._last_access.clear()
