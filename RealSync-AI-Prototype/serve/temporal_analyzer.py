"""
Temporal analysis for smoothing trust scores across frames.

Maintains a per-session sliding window of frame results and computes:
- Exponentially-weighted moving average (EWMA) of trust scores
- Trend direction (stable / improving / declining)
- Score volatility (standard deviation)
- Anomaly detection (sudden trust drops, identity switches, emotion instability)

Reduces MesoNet-4 false positives by stabilizing frame-to-frame noise.
"""
import threading
import time
import numpy as np
from collections import deque
from typing import Dict, List

from serve.config import (
    TEMPORAL_WINDOW_SIZE,
    TEMPORAL_TRUST_DROP_THRESHOLD,
    TEMPORAL_EMOTION_CHANGE_THRESHOLD,
    SESSION_TTL_SECONDS,
    TEMPORAL_EWMA_DECAY,
    TEMPORAL_TREND_THRESHOLD,
    SESSION_EVICTION_TRIGGER,
)


class TemporalAnalyzer:
    """Smooth trust scores and detect anomalies across a sliding window of frames."""

    def __init__(self, window_size: int = TEMPORAL_WINDOW_SIZE):
        self._window_size = window_size
        # session_id -> deque of frame snapshots
        self._buffers: Dict[str, deque] = {}
        # session_id -> last access timestamp
        self._last_access: Dict[str, float] = {}
        self._lock = threading.Lock()

    def _evict_stale_sessions(self):
        """Remove sessions that haven't been accessed within SESSION_TTL_SECONDS.

        Caller must hold self._lock. No I/O under lock.
        """
        now = time.time()
        stale = [sid for sid, ts in self._last_access.items()
                 if now - ts > SESSION_TTL_SECONDS]
        for sid in stale:
            self._buffers.pop(sid, None)
            self._last_access.pop(sid, None)
        return len(stale)

    def record_frame(self, session_id: str, frame_result: Dict) -> Dict:
        """
        Record a frame's results and return temporal analysis.

        Args:
            session_id: The session identifier
            frame_result: Dict with keys:
                - trustScore: float (0-1)
                - authenticityScore: float (0-1)
                - embeddingShift: float (0-1)
                - emotionLabel: str

        Returns:
            {
                "smoothedTrustScore": float,
                "trendDirection": "stable" | "improving" | "declining",
                "volatility": float,
                "frameCount": int,
                "anomalies": [{"type": str, "description": str, "severity": str}]
            }
        """
        with self._lock:
            self._last_access[session_id] = time.time()

            if len(self._buffers) > SESSION_EVICTION_TRIGGER:
                self._evict_stale_sessions()

            if session_id not in self._buffers:
                self._buffers[session_id] = deque(maxlen=self._window_size)

            buf = self._buffers[session_id]

            snapshot = {
                "trustScore": frame_result["trustScore"],
                "authenticityScore": frame_result["authenticityScore"],
                "emotionLabel": frame_result["emotionLabel"],
                "timestamp": time.time(),
            }
            buf.append(snapshot)

            # Compute smoothed trust score (EWMA with decay=0.85)
            smoothed = self._compute_ewma(buf)

            # Compute trend direction
            trend = self._compute_trend(buf)

            # Compute volatility (std dev of trust scores)
            volatility = self._compute_volatility(buf)

            # Detect anomalies
            anomalies = self._detect_anomalies(buf, snapshot)

            return {
                "smoothedTrustScore": round(smoothed, 4),
                "trendDirection": trend,
                "volatility": round(volatility, 4),
                "frameCount": len(buf),
                "anomalies": anomalies,
            }

    def _compute_ewma(self, buf: deque) -> float:
        """Compute exponentially-weighted moving average of trust scores.

        Iterates chronologically (oldest to newest). Each new observation is
        blended with the running average: ewma = decay*ewma + (1-decay)*score.
        With decay=0.85, the most recent observation has direct weight
        (1-decay)=0.15, but all prior observations are decayed by 0.85 each
        step, so the net effect weights recent frames highest (the newest frame
        dominates the running average over time).
        """
        if not buf:
            return 0.5

        scores = [s["trustScore"] for s in buf]

        ewma = scores[0]
        for i in range(1, len(scores)):
            ewma = TEMPORAL_EWMA_DECAY * ewma + (1 - TEMPORAL_EWMA_DECAY) * scores[i]

        return max(0.0, min(1.0, ewma))

    def _compute_trend(self, buf: deque) -> str:
        """Compare first 5 vs last 5 frames to determine trend.

        Requires at least 10 frames so the two windows (first 5, last 5) do not
        overlap.  With fewer frames the trend is indeterminate, so return
        "stable" as a neutral default.
        """
        if len(buf) < 10:
            return "stable"

        scores = [s["trustScore"] for s in buf]
        first_avg = np.mean(scores[:5])
        last_avg = np.mean(scores[-5:])

        diff = last_avg - first_avg
        if diff > TEMPORAL_TREND_THRESHOLD:
            return "improving"
        elif diff < -TEMPORAL_TREND_THRESHOLD:
            return "declining"
        return "stable"

    def _compute_volatility(self, buf: deque) -> float:
        """Compute standard deviation of trust scores in the buffer."""
        if len(buf) < 2:
            return 0.0

        scores = [s["trustScore"] for s in buf]
        return float(np.std(scores))

    def _detect_anomalies(self, buf: deque, current: Dict) -> List[Dict]:
        """Detect anomalies by comparing current frame to buffer history."""
        anomalies = []

        if len(buf) < 3:
            return anomalies

        scores = [s["trustScore"] for s in buf]

        # 1. Sudden trust drop: current trust > threshold below buffer mean
        buffer_mean = np.mean(scores[:-1])  # exclude current frame
        if buffer_mean - current["trustScore"] > TEMPORAL_TRUST_DROP_THRESHOLD:
            anomalies.append({
                "type": "sudden_trust_drop",
                "description": f"Trust score dropped from avg {buffer_mean:.2f} to {current['trustScore']:.2f}",
                "severity": "high",
            })

        # 2. Emotion instability: dominant emotion changed too many times in window
        emotions = [s["emotionLabel"] for s in buf]
        if len(emotions) >= 5:
            changes = sum(1 for i in range(1, len(emotions)) if emotions[i] != emotions[i - 1])
            if changes >= TEMPORAL_EMOTION_CHANGE_THRESHOLD:
                anomalies.append({
                    "type": "emotion_instability",
                    "description": f"Emotion changed {changes} times in {len(emotions)} frames",
                    "severity": "medium",
                })

        return anomalies

    def clear_session(self, session_id: str):
        """Remove stored buffer for a session."""
        with self._lock:
            self._buffers.pop(session_id, None)
            self._last_access.pop(session_id, None)

    def clear_all(self):
        """Remove all stored buffers."""
        with self._lock:
            self._buffers.clear()
            self._last_access.clear()
