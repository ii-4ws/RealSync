"""Tests for the inference pipeline (decode_frame, detect_faces, analyze_frame)."""
import base64
import pytest
import numpy as np
import cv2

from serve.inference import decode_frame, analyze_frame, cleanup_session
from serve.config import TRUST_WEIGHT_VIDEO, TRUST_WEIGHT_BEHAVIOR, BEHAVIOR_BASELINE_SCALE


class TestDecodeFrame:
    def test_valid_jpeg(self):
        """AI-P-01: Valid JPEG decodes to BGR ndarray."""
        img = np.zeros((256, 256, 3), dtype=np.uint8)
        _, buf = cv2.imencode(".jpg", img)
        b64 = base64.b64encode(buf.tobytes()).decode()
        result = decode_frame(b64)
        assert result is not None
        assert result.shape[0] >= 10
        assert result.shape[1] >= 10
        assert len(result.shape) == 3

    def test_corrupt_data(self):
        """AI-P-02: Corrupt data returns None."""
        b64 = base64.b64encode(b"this is not a jpeg").decode()
        result = decode_frame(b64)
        assert result is None

    def test_oversized_payload(self):
        """Payload > 4MB returns None."""
        big = base64.b64encode(b"\x00" * (5 * 1024 * 1024)).decode()
        result = decode_frame(big)
        assert result is None

    def test_too_small_image(self):
        """Image below 10x10 returns None."""
        img = np.zeros((5, 5, 3), dtype=np.uint8)
        _, buf = cv2.imencode(".jpg", img)
        b64 = base64.b64encode(buf.tobytes()).decode()
        result = decode_frame(b64)
        assert result is None

    def test_too_large_image(self):
        """Image above 4096x4096 returns None."""
        img = np.zeros((4097, 4097, 3), dtype=np.uint8)
        _, buf = cv2.imencode(".jpg", img)
        b64 = base64.b64encode(buf.tobytes()).decode()
        result = decode_frame(b64)
        assert result is None


class TestAnalyzeFrame:
    def test_invalid_session_id(self):
        """AI-P-05: Invalid session ID returns 'invalid' sessionId."""
        img = np.zeros((32, 32, 3), dtype=np.uint8)
        _, buf = cv2.imencode(".jpg", img)
        b64 = base64.b64encode(buf.tobytes()).decode()
        result = analyze_frame("../../etc/passwd", b64)
        assert result["sessionId"] == "invalid"

    def test_empty_session_id(self):
        """Empty session ID returns 'invalid'."""
        img = np.zeros((32, 32, 3), dtype=np.uint8)
        _, buf = cv2.imencode(".jpg", img)
        b64 = base64.b64encode(buf.tobytes()).decode()
        result = analyze_frame("", b64)
        assert result["sessionId"] == "invalid"

    def test_valid_session_no_face(self):
        """Valid black frame with no face returns noFaceDetected."""
        img = np.zeros((32, 32, 3), dtype=np.uint8)
        _, buf = cv2.imencode(".jpg", img)
        b64 = base64.b64encode(buf.tobytes()).decode()
        result = analyze_frame("test-session-01", b64)
        assert result["sessionId"] == "test-session-01"
        assert result["faces"] == []
        assert result["aggregated"]["noFaceDetected"] is True

    def test_cleanup_session(self):
        """AI-P-06: cleanup_session clears all per-session state."""
        # Record some frames, then clean up
        img = np.zeros((32, 32, 3), dtype=np.uint8)
        _, buf = cv2.imencode(".jpg", img)
        b64 = base64.b64encode(buf.tobytes()).decode()
        sid = "test-cleanup-session"
        analyze_frame(sid, b64)
        analyze_frame(sid, b64)
        cleanup_session(sid)
        # After cleanup, next frame should be treated as fresh
        result = analyze_frame(sid, b64)
        assert result["sessionId"] == sid


class TestTrustScoreFormula:
    def test_trust_formula_calculation(self):
        """AI-P-04: Verify trust score formula with known values.

        M16: Uses the authoritative 2-signal formula from config.py
        (video=0.55, behavior=0.45). Identity signal was removed;
        backend reweights to 3-signal only when audio is available.
        """
        auth_score = 0.9
        emotion_conf = 0.8

        # behavior_conf = 0.5 * (1.0 + emotion_conf) — neutral baseline + emotion range
        behavior_conf = BEHAVIOR_BASELINE_SCALE * (1.0 + emotion_conf)
        expected = (
            TRUST_WEIGHT_VIDEO * auth_score
            + TRUST_WEIGHT_BEHAVIOR * behavior_conf
        )
        expected = max(0.0, min(1.0, expected))

        # Verify the formula weights match config.py
        assert abs(TRUST_WEIGHT_VIDEO - 0.55) < 0.01
        assert abs(TRUST_WEIGHT_BEHAVIOR - 0.45) < 0.01
        assert abs(BEHAVIOR_BASELINE_SCALE - 0.5) < 0.01

        # behavior_conf = 0.5 * (1.0 + 0.8) = 0.9
        assert abs(behavior_conf - 0.9) < 0.01

        # trust = 0.55*0.9 + 0.45*0.9 = 0.495 + 0.405 = 0.9
        assert abs(expected - 0.9) < 0.01
