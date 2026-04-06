"""
DeBERTa-v3 zero-shot NLI behavioral text analyzer.

Uses MoritzLaurer/deberta-v3-base-zeroshot-v2.0 for zero-shot classification
of transcript text against behavioral hypotheses (social engineering, fraud, etc).

No training data needed -- the model generalizes via natural language inference.

Input: transcript text (60s window, truncated to ~2000 chars).
Output: {"signals": [...], "highestScore": float, "model": str}
"""
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

from serve.config import (
    TEXT_ALERT_THRESHOLD,
    TEXT_HIGH_SEVERITY_THRESHOLD,
    TEXT_MAX_LENGTH,
    TEXT_EXECUTOR_WORKERS,
    TEXT_INFERENCE_TIMEOUT,
)

MODEL_ID = "MoritzLaurer/deberta-v3-base-zeroshot-v2.0"
MODEL_NAME = "DeBERTa-v3-NLI"
MAX_TEXT_LENGTH = TEXT_MAX_LENGTH

# Behavioral hypotheses — written to match actual spoken social engineering patterns.
# Each hypothesis describes a concrete behavior, not an abstract concept.
HYPOTHESES = [
    {
        "hypothesis": "This person is asking for a password, login credentials, verification code, PIN, or two-factor authentication code",
        "category": "credential_theft",
    },
    {
        "hypothesis": "This person is demanding an urgent wire transfer, payment, gift card purchase, or money transfer",
        "category": "financial_fraud",
    },
    {
        "hypothesis": "This person claims to be from IT support, the bank, a government agency, or a company executive and is making demands",
        "category": "impersonation",
    },
    {
        "hypothesis": "This person is saying do not tell anyone, keep this secret, do not ask questions, or do not verify with others",
        "category": "isolation_tactic",
    },
    {
        "hypothesis": "This person is threatening consequences like account suspension, legal action, job loss, or arrest unless immediate action is taken",
        "category": "coercion",
    },
    {
        "hypothesis": "This person is asking someone to install remote access software, share their screen credentials, or click a suspicious link",
        "category": "tech_exploitation",
    },
]

# Severity thresholds
ALERT_THRESHOLD = TEXT_ALERT_THRESHOLD
HIGH_SEVERITY_THRESHOLD = TEXT_HIGH_SEVERITY_THRESHOLD


# ---------------------------------------------------------------
# Lazy-loaded singleton
# ---------------------------------------------------------------

_LOAD_FAILED = object()  # Sentinel to prevent infinite retry on load failure
_pipeline = None
_lock = threading.Lock()
# max_workers=2 ensures that even if one task is blocked by the 5s timeout
# in analyze_text(), a second worker is available for the next request.
_text_executor = ThreadPoolExecutor(max_workers=TEXT_EXECUTOR_WORKERS)


def get_text_analyzer():
    """Load or return the cached zero-shot classification pipeline (thread-safe)."""
    global _pipeline
    if _pipeline is not None:
        return None if _pipeline is _LOAD_FAILED else _pipeline
    with _lock:
        if _pipeline is not None:
            return None if _pipeline is _LOAD_FAILED else _pipeline
        try:
            from transformers import pipeline
            _pipeline = pipeline(
                "zero-shot-classification",
                model=MODEL_ID,
                device=-1,  # CPU
            )
            print(f"[text] {MODEL_NAME} pipeline loaded ({MODEL_ID})")
        except Exception as exc:
            print(f"[text] Failed to load text analyzer: {exc}")
            _pipeline = _LOAD_FAILED
    return None if _pipeline is _LOAD_FAILED else _pipeline


# ---------------------------------------------------------------
# Public API
# ---------------------------------------------------------------

def analyze_text(text: str) -> dict:
    """
    Analyze transcript text for behavioral manipulation signals.

    Returns:
        {
            "signals": [{"hypothesis": str, "category": str, "score": float, "severity": str}],
            "highestScore": float,
            "model": str,
        }
    """
    pipe = get_text_analyzer()
    if pipe is None:
        return {"signals": [], "highestScore": 0.0, "model": MODEL_NAME, "available": False}

    try:
        # Truncate text to avoid excessive inference time
        text = text.strip()[:MAX_TEXT_LENGTH]
        if not text:
            return {"signals": [], "highestScore": 0.0, "model": MODEL_NAME}

        # H12: Run zero-shot classification with 5s timeout to prevent hangs
        candidate_labels = [h["hypothesis"] for h in HYPOTHESES]
        future = _text_executor.submit(pipe, text, candidate_labels, multi_label=True)
        try:
            result = future.result(timeout=TEXT_INFERENCE_TIMEOUT)
        except FuturesTimeout:
            # Note: future.cancel() only prevents execution of futures that are
            # still queued in the thread pool.  Once a future is already running,
            # cancel() is a no-op (Python limitation).  With max_workers=TEXT_EXECUTOR_WORKERS the
            # timed-out task will finish in the background; the next submission
            # still gets a free worker slot.
            future.cancel()
            print(f"[text] Analysis timed out ({TEXT_INFERENCE_TIMEOUT}s)")
            return {"signals": [], "highestScore": 0.0, "model": MODEL_NAME}

        # Build signals list
        signals = []
        highest_score = 0.0

        label_to_category = {h["hypothesis"]: h["category"] for h in HYPOTHESES}

        for label, score in zip(result["labels"], result["scores"]):
            score = round(float(score), 4)
            if score > highest_score:
                highest_score = score

            if score < ALERT_THRESHOLD:
                continue

            if score >= HIGH_SEVERITY_THRESHOLD:
                severity = "high"
            else:
                severity = "medium"

            signals.append({
                "hypothesis": label,
                "category": label_to_category.get(label, "unknown"),
                "score": score,
                "severity": severity,
            })

        # Sort by score descending
        signals.sort(key=lambda s: s["score"], reverse=True)

        return {
            "signals": signals,
            "highestScore": round(highest_score, 4),
            "model": MODEL_NAME,
        }

    except Exception as exc:
        print(f"[text] Analysis error: {exc}")
        return {"signals": [], "highestScore": 0.0, "model": MODEL_NAME, "available": False}
