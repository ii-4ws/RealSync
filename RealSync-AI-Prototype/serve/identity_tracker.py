"""
Per-session face identity tracking via embedding comparison.

Uses a simple approach: compute a face embedding from pixel values
(lightweight PCA-like hash) and compare to stored baselines per session.

For production, this could be replaced with FaceNet/ArcFace embeddings.
The interface remains the same regardless of the embedding method.
"""
import numpy as np
from typing import Dict, Tuple, Optional


class IdentityTracker:
    """Track face identity consistency within a session."""

    def __init__(self, embedding_dim: int = 128):
        self.embedding_dim = embedding_dim
        # session_id -> { face_id -> baseline_embedding }
        self._baselines: Dict[str, Dict[int, np.ndarray]] = {}
        # Random projection matrix for consistent embeddings
        # (fixed seed for reproducibility across calls)
        rng = np.random.RandomState(42)
        self._projection = rng.randn(embedding_dim, 224 * 224 * 3).astype(np.float32) * 0.01

    def compute_embedding(self, face_rgb: np.ndarray) -> np.ndarray:
        """
        Compute a face embedding from an RGB image.

        Uses a lightweight random projection approach for Phase 1.
        Replace with FaceNet/ArcFace for production accuracy.

        Args:
            face_rgb: numpy array, shape (H, W, 3), dtype uint8 or float32

        Returns:
            numpy array, shape (embedding_dim,), normalized
        """
        # Resize to 224x224 if needed
        import cv2
        if face_rgb.shape[0] != 224 or face_rgb.shape[1] != 224:
            face_rgb = cv2.resize(face_rgb, (224, 224))

        # Normalize to [0, 1]
        if face_rgb.dtype == np.uint8:
            face_rgb = face_rgb.astype(np.float32) / 255.0

        # Flatten and project
        flat = face_rgb.flatten().astype(np.float32)
        embedding = self._projection @ flat

        # L2 normalize
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm

        return embedding

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
        if shift < 0.20:
            risk = "low"
        elif shift < 0.40:
            risk = "medium"
        else:
            risk = "high"

        same_person = shift < 0.25

        # Slowly update baseline (exponential moving average)
        alpha = 0.1
        baselines[face_id] = (1 - alpha) * baseline + alpha * embedding
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
        self._baselines.pop(session_id, None)

    def clear_all(self):
        """Remove all stored baselines."""
        self._baselines.clear()
