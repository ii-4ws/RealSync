"""
RealSync AI Inference Service — FastAPI Server.

Video deepfake detection (CLIP ViT-L/14 + SPRT), emotion (EfficientNet-B2),
audio deepfake (WavLM).

Run:
    cd RealSync-AI-Prototype
    python -m serve.app
"""
import hmac
import re
import sys
import os

import cv2
import numpy as np

SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from serve.config import PORT, HOST, INFERENCE_TIMEOUT_S

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
_frame_semaphore = asyncio.Semaphore(1)


def _rate_limit_key(request: Request) -> str:
    return request.headers.get("X-API-Key", get_remote_address(request))


limiter = Limiter(key_func=_rate_limit_key)

from serve.inference import analyze_frame, cleanup_session, _utcnow_iso, _get_face_detector
from serve.clip_deepfake_model import get_clip_deepfake_model
from serve.emotion_model import get_emotion_model
from serve.audio_model import get_audio_model, predict_audio
from serve.text_analyzer import get_text_analyzer, analyze_text as analyze_text_fn
from serve.whisper_model import get_whisper_model, transcribe_audio

AI_API_KEY = os.getenv("AI_API_KEY", "").strip()

if not AI_API_KEY and os.getenv("ENV", "").lower() == "production":
    print("FATAL: AI_API_KEY is required in production. Exiting.")
    sys.exit(1)
elif not AI_API_KEY:
    print("[app] WARNING: AI_API_KEY not set — auth is disabled (dev mode)")


# ---------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-load all models and warm up on startup."""
    print("[app] WARNING: AI_API_KEY not set — auth is disabled (dev mode)")
    print("[app] Pre-loading models...")

    face_det = _get_face_detector()
    clip_model = get_clip_deepfake_model()
    emotion = get_emotion_model()
    audio = get_audio_model()

    if not face_det:
        print("[app] WARNING: Face detector failed to load")
    if not clip_model:
        print("[app] WARNING: CLIP deepfake model failed to load")
    if not emotion:
        print("[app] WARNING: Emotion model failed to load")
    if not audio:
        print("[app] WARNING: WavLM audio model failed to load")

    text_pipe = get_text_analyzer()
    if not text_pipe:
        print("[app] WARNING: DeBERTa text analyzer failed to load")

    whisper_model = get_whisper_model()
    if not whisper_model:
        print("[app] WARNING: Whisper transcription model failed to load")

    print("[app] Running warmup inference...")
    try:
        dummy_img = np.zeros((256, 256, 3), dtype=np.uint8)
        if face_det is not None:
            import mediapipe as mp
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(dummy_img, cv2.COLOR_BGR2RGB))
            face_det.detect(mp_image)
        print("[app] Warmup complete.")
    except Exception as e:
        print(f"[app] Warmup failed (non-fatal): {e}")

    print("[app] All models ready.")
    yield
    from .inference import _inference_pool
    _inference_pool.shutdown(wait=False)
    print("[app] Inference thread pool shut down.")


# ---------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------

app = FastAPI(
    title="RealSync AI Inference Service",
    description="Real-time deepfake detection (CLIP + SPRT), emotion, and audio analysis.",
    version="2.0.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_env_origins = [
    o.strip() for o in (os.getenv("CORS_ALLOWED_ORIGIN") or "").split(",") if o.strip()
]
_allowed_origins = _env_origins if _env_origins else [
    "http://localhost:4000",
    "http://localhost:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
)


@app.middleware("http")
async def api_key_auth(request: Request, call_next):
    if not AI_API_KEY or request.url.path == "/api/health" or request.method == "OPTIONS":
        return await call_next(request)
    provided = request.headers.get("X-API-Key", "")
    if not hmac.compare_digest(provided, AI_API_KEY):
        return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})
    return await call_next(request)


# ---------------------------------------------------------------
# Request models
# ---------------------------------------------------------------

class AnalyzeFrameRequest(BaseModel):
    sessionId: str
    frameB64: str = Field(..., description="Base64-encoded JPEG or PNG frame")
    capturedAt: Optional[str] = None


class AnalyzeAudioRequest(BaseModel):
    sessionId: str
    audioB64: str = Field(..., description="Base64-encoded PCM16 mono 16kHz audio")
    durationMs: Optional[int] = None


# ---------------------------------------------------------------
# Routes
# ---------------------------------------------------------------

@app.get("/api/health")
@limiter.limit("120/minute")
async def health(request: Request):
    """Health check — reports status of all models."""
    models = {}

    try:
        models["clip_deepfake"] = "loaded" if get_clip_deepfake_model() is not None else "unavailable"
    except Exception:
        models["clip_deepfake"] = "error"

    try:
        models["emotion"] = "loaded" if get_emotion_model() is not None else "unavailable"
    except Exception:
        models["emotion"] = "error"

    try:
        models["face_detection"] = "loaded" if _get_face_detector() is not None else "unavailable"
    except Exception:
        models["face_detection"] = "error"

    try:
        models["audio"] = "loaded" if get_audio_model() is not None else "unavailable"
    except Exception:
        models["audio"] = "error"

    try:
        models["text"] = "loaded" if get_text_analyzer() is not None else "unavailable"
    except Exception:
        models["text"] = "error"

    try:
        models["whisper"] = "loaded" if get_whisper_model() is not None else "unavailable"
    except Exception:
        models["whisper"] = "error"

    return {"ok": True, "models": models}


@app.post("/api/analyze/frame")
async def analyze_frame_endpoint(request: Request, payload: AnalyzeFrameRequest):
    """Analyze a video frame for deepfake (CLIP + SPRT) and emotion."""
    if not payload.frameB64 or not payload.frameB64.strip():
        raise HTTPException(status_code=400, detail="frameB64 is required")
    if not payload.sessionId or not _UUID_RE.match(payload.sessionId):
        raise HTTPException(status_code=400, detail="sessionId must be a valid UUID")
    if len(payload.frameB64 or "") > 10_000_000:
        raise HTTPException(status_code=413, detail="frameB64 payload exceeds 10MB limit")

    acquired = False
    try:
        await asyncio.wait_for(_frame_semaphore.acquire(), timeout=5)
        acquired = True
    except asyncio.TimeoutError:
        raise HTTPException(status_code=429, detail="Frame analysis busy — try again later")

    try:
        result = await asyncio.wait_for(
            run_in_threadpool(
                analyze_frame,
                session_id=payload.sessionId,
                frame_b64=payload.frameB64,
                captured_at=payload.capturedAt,
            ),
            timeout=INFERENCE_TIMEOUT_S,
        )
        return result
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Frame analysis timed out")
    except Exception as e:
        print(f"[app] Frame analysis failed: {e}")
        raise HTTPException(status_code=500, detail="Analysis failed — see server logs")
    finally:
        if acquired:
            _frame_semaphore.release()


@app.post("/api/analyze/audio")
@limiter.limit("30/minute")
async def analyze_audio_endpoint(request: Request, payload: AnalyzeAudioRequest):
    """Analyze audio for deepfake detection using WavLM."""
    if not payload.audioB64:
        raise HTTPException(status_code=400, detail="audioB64 is required")
    if not payload.sessionId or not _UUID_RE.match(payload.sessionId):
        raise HTTPException(status_code=400, detail="sessionId must be a valid UUID")
    if len(payload.audioB64 or "") > 5_000_000:
        raise HTTPException(status_code=413, detail="audioB64 payload exceeds 4MB limit")

    try:
        result = await asyncio.wait_for(
            run_in_threadpool(predict_audio, payload.audioB64),
            timeout=INFERENCE_TIMEOUT_S,
        )
        processed_at = _utcnow_iso()
        return {
            "sessionId": payload.sessionId,
            "processedAt": processed_at,
            "audio": result,
        }
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Audio analysis timed out")
    except Exception as e:
        print(f"[app] Audio analysis failed: {e}")
        raise HTTPException(status_code=500, detail="Audio analysis failed — see server logs")


class AnalyzeTextRequest(BaseModel):
    sessionId: str
    text: str = Field(..., description="Transcript text to analyze for behavioral signals")


class TranscribeRequest(BaseModel):
    sessionId: str
    audioB64: str = Field(..., description="Base64-encoded PCM16 mono 16kHz audio")


@app.post("/api/analyze/text")
@limiter.limit("30/minute")
async def analyze_text_endpoint(request: Request, payload: AnalyzeTextRequest):
    """Analyze transcript text for social engineering / phishing signals."""
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    if not payload.sessionId or not _UUID_RE.match(payload.sessionId):
        raise HTTPException(status_code=400, detail="sessionId must be a valid UUID")
    if len(payload.text) > 50_000:
        raise HTTPException(status_code=413, detail="text payload exceeds 50KB limit")

    try:
        result = await asyncio.wait_for(
            run_in_threadpool(analyze_text_fn, payload.text),
            timeout=INFERENCE_TIMEOUT_S,
        )
        return {
            "sessionId": payload.sessionId,
            "processedAt": _utcnow_iso(),
            "behavioral": result,
        }
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Text analysis timed out")
    except Exception as e:
        print(f"[app] Text analysis failed: {e}")
        raise HTTPException(status_code=500, detail="Text analysis failed — see server logs")


@app.post("/api/transcribe")
@limiter.limit("20/minute")
async def transcribe_endpoint(request: Request, payload: TranscribeRequest):
    """Transcribe audio using Whisper."""
    if not payload.audioB64:
        raise HTTPException(status_code=400, detail="audioB64 is required")
    if not payload.sessionId or not _UUID_RE.match(payload.sessionId):
        raise HTTPException(status_code=400, detail="sessionId must be a valid UUID")
    if len(payload.audioB64 or "") > 5_000_000:
        raise HTTPException(status_code=413, detail="audioB64 payload exceeds limit")

    try:
        result = await asyncio.wait_for(
            run_in_threadpool(transcribe_audio, payload.audioB64),
            timeout=INFERENCE_TIMEOUT_S,
        )
        return {
            "sessionId": payload.sessionId,
            "processedAt": _utcnow_iso(),
            "transcription": result,
        }
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Transcription timed out")
    except Exception as e:
        print(f"[app] Transcription failed: {e}")
        raise HTTPException(status_code=500, detail="Transcription failed — see server logs")


# ---------------------------------------------------------------
# Run with: python -m serve.app
# ---------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "serve.app:app",
        host=HOST,
        port=PORT,
        reload=False,
        log_level="info",
    )
