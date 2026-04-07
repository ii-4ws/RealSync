"""
Whisper-based speech-to-text for RealSync.

Transcribes PCM16 mono 16kHz audio (base64-encoded) using OpenAI Whisper.
"""

import base64
import threading

import numpy as np

_model = None
_LOAD_FAILED = object()
_lock = threading.Lock()


def get_whisper_model():
    """Lazy-load Whisper base model (140MB, thread-safe singleton)."""
    global _model
    if _model is not None:
        return None if _model is _LOAD_FAILED else _model
    with _lock:
        if _model is not None:
            return None if _model is _LOAD_FAILED else _model
        try:
            import whisper
            _model = whisper.load_model("base")
            print("[whisper] Whisper base model loaded")
        except Exception as e:
            print(f"[whisper] Failed to load Whisper model: {e}")
            _model = _LOAD_FAILED
    return None if _model is _LOAD_FAILED else _model


def transcribe_audio(audio_b64: str) -> dict:
    """
    Transcribe base64-encoded PCM16 mono 16kHz audio.

    Returns: { "text": "transcribed text", "language": "en" }
    """
    model = get_whisper_model()
    if model is None:
        return {"text": "", "language": "unknown"}

    try:
        raw = base64.b64decode(audio_b64)
        audio_np = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

        result = model.transcribe(
            audio_np,
            fp16=False,
            language="en",
            no_speech_threshold=0.6,
        )

        text = (result.get("text") or "").strip()
        language = result.get("language", "en")

        return {"text": text, "language": language}
    except Exception as e:
        print(f"[whisper] Transcription failed: {e}")
        return {"text": "", "language": "unknown"}
