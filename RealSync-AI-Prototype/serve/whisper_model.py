"""
Whisper-based speech-to-text for RealSync.

Transcribes PCM16 mono 16kHz audio (base64-encoded) using OpenAI Whisper.
"""

import base64
import numpy as np

_model = None


def get_whisper_model():
    """Lazy-load Whisper base model (140MB, good speed/accuracy on CPU)."""
    global _model
    if _model is not None:
        return _model
    try:
        import whisper
        _model = whisper.load_model("base")
        print("[whisper] Whisper base model loaded")
        return _model
    except Exception as e:
        print(f"[whisper] Failed to load Whisper model: {e}")
        return None


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

        # Whisper expects float32 audio at 16kHz
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
