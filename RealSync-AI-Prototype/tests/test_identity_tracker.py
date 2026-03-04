"""Tests for the IdentityTracker (FaceNet-based identity tracking)."""
import time
import pytest
import numpy as np

from serve.identity_tracker import IdentityTracker
from serve.config import IDENTITY_SAME_PERSON_THRESHOLD, IDENTITY_SHIFT_LOW, IDENTITY_SHIFT_HIGH


@pytest.fixture
def tracker():
    """Fresh IdentityTracker instance per test."""
    t = IdentityTracker()
    yield t
    t.clear_all()


def _random_embedding(seed=None):
    """Generate a random L2-normalized 512-dim embedding."""
    rng = np.random.RandomState(seed)
    emb = rng.randn(512).astype(np.float32)
    emb /= np.linalg.norm(emb)
    return emb


class TestBaseline:
    def test_first_embedding_stores_baseline(self, tracker):
        """AI-IT-01: First call stores baseline, returns shift=0, samePerson=True."""
        emb = _random_embedding(42)
        result = tracker.compare_to_baseline("s1", 0, emb)
        assert result["embeddingShift"] == 0.0
        assert result["samePerson"] is True
        assert result["riskLevel"] == "low"

    def test_same_embedding_low_shift(self, tracker):
        """AI-IT-02: Same embedding returns very low shift."""
        emb = _random_embedding(42)
        tracker.compare_to_baseline("s1", 0, emb)
        result = tracker.compare_to_baseline("s1", 0, emb)
        assert result["embeddingShift"] < IDENTITY_SAME_PERSON_THRESHOLD
        assert result["samePerson"] is True

    def test_different_embedding_high_shift(self, tracker):
        """AI-IT-03: Orthogonal embedding returns high shift."""
        emb1 = np.zeros(512, dtype=np.float32)
        emb1[0] = 1.0
        emb2 = np.zeros(512, dtype=np.float32)
        emb2[1] = 1.0  # orthogonal
        tracker.compare_to_baseline("s1", 0, emb1)
        result = tracker.compare_to_baseline("s1", 0, emb2)
        assert result["embeddingShift"] >= IDENTITY_SHIFT_HIGH
        assert result["samePerson"] is False
        assert result["riskLevel"] == "high"


class TestEMAUpdate:
    def test_gradual_drift(self, tracker):
        """AI-IT-04: EMA baseline update with gradual drift."""
        emb = _random_embedding(42)
        tracker.compare_to_baseline("s1", 0, emb)

        # Gradually drift the embedding
        shifts = []
        for i in range(10):
            # Add small noise each time
            noise = np.random.randn(512).astype(np.float32) * 0.05
            emb = emb + noise
            emb /= np.linalg.norm(emb)
            result = tracker.compare_to_baseline("s1", 0, emb)
            shifts.append(result["embeddingShift"])

        # Shifts should be small and relatively stable due to EMA
        for s in shifts:
            assert s < 0.5  # Should not be extreme with small noise


class TestRiskLevels:
    def test_low_risk_threshold(self, tracker):
        """Shift below 0.20 is low risk."""
        emb = _random_embedding(42)
        tracker.compare_to_baseline("s1", 0, emb)
        # Very similar embedding (add tiny noise)
        emb2 = emb + np.random.randn(512).astype(np.float32) * 0.01
        emb2 /= np.linalg.norm(emb2)
        result = tracker.compare_to_baseline("s1", 0, emb2)
        if result["embeddingShift"] < IDENTITY_SHIFT_LOW:
            assert result["riskLevel"] == "low"

    def test_null_embedding(self, tracker):
        """Null embedding returns safe defaults."""
        result = tracker.compare_to_baseline("s1", 0, None)
        assert result["embeddingShift"] == 0.0
        assert result["samePerson"] is True
        assert result["riskLevel"] == "low"


class TestSessionManagement:
    def test_clear_session(self, tracker):
        """Session clear removes baselines."""
        emb = _random_embedding(42)
        tracker.compare_to_baseline("s1", 0, emb)
        tracker.clear_session("s1")
        # Next call should treat as new baseline
        result = tracker.compare_to_baseline("s1", 0, emb)
        assert result["embeddingShift"] == 0.0

    def test_clear_all(self, tracker):
        """Clear all removes all sessions."""
        emb = _random_embedding(42)
        tracker.compare_to_baseline("s1", 0, emb)
        tracker.compare_to_baseline("s2", 0, emb)
        tracker.clear_all()
        result = tracker.compare_to_baseline("s1", 0, emb)
        assert result["embeddingShift"] == 0.0

    def test_multiple_faces_per_session(self, tracker):
        """Different face IDs have independent baselines."""
        emb1 = _random_embedding(42)
        emb2 = _random_embedding(99)
        tracker.compare_to_baseline("s1", 0, emb1)
        tracker.compare_to_baseline("s1", 1, emb2)
        # Each face should have shift 0 on second identical call
        r1 = tracker.compare_to_baseline("s1", 0, emb1)
        r2 = tracker.compare_to_baseline("s1", 1, emb2)
        assert r1["embeddingShift"] < 0.1
        assert r2["embeddingShift"] < 0.1
