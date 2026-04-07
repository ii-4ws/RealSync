"""
Sequential Probability Ratio Test (SPRT) for deepfake detection.

Accumulates per-frame authenticity scores across a session and makes a
statistically-grounded real/fake decision with controlled error rates.

Theory: Even at 70% single-frame accuracy, SPRT reaches 95%+ confidence
after ~15-20 frames (~22-30 seconds at 1.5fps capture rate).

Usage:
    sprt = SPRTDetector()
    for each frame:
        result = sprt.update(session_id, authenticity_score)
        if result["decision"] != "undecided":
            # Decision reached with 95% confidence
"""
import math

from serve.config import (
    SPRT_ALPHA,
    SPRT_BETA,
    SPRT_FAKE_MEAN,
    SPRT_REAL_MEAN,
    SPRT_SCORE_STD,
)


class SPRTDetector:
    """Session-scoped SPRT accumulator for deepfake detection."""

    def __init__(
        self,
        alpha: float = None,
        beta: float = None,
        real_mean: float = None,
        fake_mean: float = None,
        score_std: float = None,
    ):
        self.alpha = alpha or SPRT_ALPHA
        self.beta = beta or SPRT_BETA
        self.real_mean = real_mean or SPRT_REAL_MEAN
        self.fake_mean = fake_mean or SPRT_FAKE_MEAN
        self.score_std = score_std or SPRT_SCORE_STD

        # Wald's decision boundaries
        self.upper_bound = math.log((1 - self.beta) / self.alpha)    # → decide FAKE
        self.lower_bound = math.log(self.beta / (1 - self.alpha))    # → decide REAL

        self._sessions = {}

    def _get_session(self, session_id: str) -> dict:
        if session_id not in self._sessions:
            self._sessions[session_id] = {
                "llr": 0.0,
                "n": 0,
                "decision": "undecided",
                "confidence": 0.5,
                "scores": [],
            }
        return self._sessions[session_id]

    def update(self, session_id: str, authenticity_score: float) -> dict:
        """
        Feed one frame's authenticity score. Returns current decision state.

        Args:
            session_id: Unique session identifier
            authenticity_score: 0.0 (definitely fake) to 1.0 (definitely real)

        Returns:
            {
                "decision": "real" | "fake" | "undecided",
                "confidence": float (0-1),
                "framesAnalyzed": int,
                "logLikelihoodRatio": float,
            }
        """
        if authenticity_score is None:
            return self._format_result(session_id)

        state = self._get_session(session_id)

        # Already decided — don't accumulate further
        if state["decision"] != "undecided":
            return self._format_result(session_id)

        # Clamp score to avoid log(0) / division issues
        score = max(0.01, min(0.99, authenticity_score))
        state["n"] += 1
        state["scores"].append(score)

        # Gaussian log-likelihood ratio: log(P(score|fake) / P(score|real))
        std = self.score_std
        ll_fake = -0.5 * ((score - self.fake_mean) / std) ** 2
        ll_real = -0.5 * ((score - self.real_mean) / std) ** 2
        llr_increment = ll_fake - ll_real

        state["llr"] += llr_increment

        # Check decision boundaries
        if state["llr"] >= self.upper_bound:
            state["decision"] = "fake"
            state["confidence"] = round(1.0 - self.alpha, 4)
        elif state["llr"] <= self.lower_bound:
            state["decision"] = "real"
            state["confidence"] = round(1.0 - self.beta, 4)
        else:
            # Compute progress toward decision as confidence
            total_range = self.upper_bound - self.lower_bound
            position = (state["llr"] - self.lower_bound) / total_range
            state["confidence"] = round(max(0.0, min(1.0, position)), 4)

        return self._format_result(session_id)

    def _format_result(self, session_id: str) -> dict:
        state = self._get_session(session_id)
        return {
            "decision": state["decision"],
            "confidence": state["confidence"],
            "framesAnalyzed": state["n"],
            "logLikelihoodRatio": round(state["llr"], 4),
        }

    def get_session_stats(self, session_id: str) -> dict:
        """Get detailed stats for a session (for debugging/calibration)."""
        state = self._get_session(session_id)
        scores = state["scores"]
        if not scores:
            return {"framesAnalyzed": 0}
        import numpy as np
        return {
            "framesAnalyzed": state["n"],
            "decision": state["decision"],
            "scoreMean": round(float(np.mean(scores)), 4),
            "scoreStd": round(float(np.std(scores)), 4),
            "scoreMin": round(float(min(scores)), 4),
            "scoreMax": round(float(max(scores)), 4),
        }

    def clear_session(self, session_id: str):
        """Remove a session's accumulated state."""
        self._sessions.pop(session_id, None)

    def clear_all(self):
        """Clear all session states."""
        self._sessions.clear()
