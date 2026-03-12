"""Tests for the TemporalAnalyzer (EWMA smoothing, trends, anomaly detection)."""
import pytest

from serve.temporal_analyzer import TemporalAnalyzer
from serve.config import (
    TEMPORAL_TRUST_DROP_THRESHOLD,
    TEMPORAL_EMOTION_CHANGE_THRESHOLD,
    TEMPORAL_EWMA_DECAY,
)


@pytest.fixture
def analyzer():
    """Fresh TemporalAnalyzer per test."""
    a = TemporalAnalyzer(window_size=15)
    yield a
    a.clear_all()


def _frame(trust=0.85, auth=0.85, emotion="Neutral"):
    return {
        "trustScore": trust,
        "authenticityScore": auth,
        "emotionLabel": emotion,
    }


class TestEWMA:
    def test_single_frame(self, analyzer):
        """Single frame returns the score itself."""
        result = analyzer.record_frame("s1", _frame(trust=0.9))
        assert abs(result["smoothedTrustScore"] - 0.9) < 0.01
        assert result["frameCount"] == 1

    def test_smoothing_absorbs_drop(self, analyzer):
        """AI-TP-01: EWMA smooths a sudden drop."""
        for _ in range(4):
            analyzer.record_frame("s1", _frame(trust=0.9))
        result = analyzer.record_frame("s1", _frame(trust=0.1))
        # EWMA should significantly smooth the drop
        assert result["smoothedTrustScore"] > 0.3  # Much higher than 0.1

    def test_ewma_decay_factor(self, analyzer):
        """Verify EWMA uses configured decay factor."""
        assert TEMPORAL_EWMA_DECAY == 0.85


class TestTrend:
    def test_stable_trend(self, analyzer):
        """Fewer than 10 frames returns stable."""
        for _ in range(5):
            result = analyzer.record_frame("s1", _frame(trust=0.8))
        assert result["trendDirection"] == "stable"

    def test_declining_trend(self, analyzer):
        """AI-TP-02: 10+ declining frames detected."""
        for i in range(12):
            trust = 0.9 - i * 0.05
            result = analyzer.record_frame("s1", _frame(trust=max(0.1, trust)))
        assert result["trendDirection"] == "declining"

    def test_improving_trend(self, analyzer):
        """Improving trend detected."""
        for i in range(12):
            trust = 0.3 + i * 0.05
            result = analyzer.record_frame("s1", _frame(trust=min(0.95, trust)))
        assert result["trendDirection"] == "improving"


class TestVolatility:
    def test_zero_volatility(self, analyzer):
        """Constant scores have zero volatility."""
        for _ in range(5):
            result = analyzer.record_frame("s1", _frame(trust=0.85))
        assert result["volatility"] < 0.01

    def test_high_volatility(self, analyzer):
        """Alternating scores have high volatility."""
        for i in range(10):
            trust = 0.9 if i % 2 == 0 else 0.1
            result = analyzer.record_frame("s1", _frame(trust=trust))
        assert result["volatility"] > 0.1


class TestAnomalyDetection:
    def test_sudden_trust_drop(self, analyzer):
        """AI-TP-03: Sudden trust drop detected."""
        for _ in range(5):
            analyzer.record_frame("s1", _frame(trust=0.85))
        result = analyzer.record_frame("s1", _frame(trust=0.50))
        anomaly_types = [a["type"] for a in result["anomalies"]]
        assert "sudden_trust_drop" in anomaly_types

    def test_emotion_instability(self, analyzer):
        """AI-TP-05: Emotion instability with 5+ changes."""
        emotions = ["Happy", "Angry", "Fear", "Neutral", "Sad", "Happy", "Angry"]
        for emotion in emotions:
            result = analyzer.record_frame("s1", _frame(emotion=emotion))
        anomaly_types = [a["type"] for a in result["anomalies"]]
        assert "emotion_instability" in anomaly_types

    def test_no_anomalies_stable(self, analyzer):
        """Stable session has no anomalies."""
        for _ in range(5):
            result = analyzer.record_frame("s1", _frame())
        assert result["anomalies"] == []

    def test_few_frames_no_anomalies(self, analyzer):
        """Fewer than 3 frames returns empty anomalies."""
        result = analyzer.record_frame("s1", _frame(trust=0.1))
        assert result["anomalies"] == []


class TestWindowSize:
    def test_window_bounded(self, analyzer):
        """AI-TP-06: Buffer never exceeds window size."""
        for i in range(20):
            result = analyzer.record_frame("s1", _frame())
        assert result["frameCount"] <= 15

    def test_cleanup_resets(self, analyzer):
        """AI-TP-07: Clear session resets buffer."""
        for _ in range(5):
            analyzer.record_frame("s1", _frame())
        analyzer.clear_session("s1")
        result = analyzer.record_frame("s1", _frame())
        assert result["frameCount"] == 1
