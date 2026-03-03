"""
RealSync AI Inference Service — FastAPI Server.

Multi-modal analysis: video deepfake (EfficientNet-B4+SBI), emotion (MobileNetV2),
identity (FaceNet), audio deepfake (AASIST), and behavioral text (DeBERTa-v3).

Run:
    cd RealSync-AI-Prototype
    python -m serve.app

Or:
    uvicorn serve.app:app --host 0.0.0.0 --port 5100 --reload
"""
import re
import sys
import os

import cv2
import numpy as np

# Ensure the src directory is in the Python path for model imports
SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional

from serve.config import PORT, HOST
from serve.inference import analyze_frame, get_identity_tracker, cleanup_session, _utcnow_iso, _get_face_detector
from serve.deepfake_model import get_deepfake_model
from serve.emotion_model import get_emotion_model
from serve.audio_model import get_audio_model, predict_audio
from serve.text_analyzer import get_text_analyzer, analyze_text as analyze_text_fn

# API key for service-to-service auth (optional — if not set, auth is disabled)
AI_API_KEY = os.getenv("AI_API_KEY", "").strip()

# ---------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-load all models and warm up on startup."""
    print("[app] Pre-loading models...")

    face_det = _get_face_detector()
    deepfake = get_deepfake_model()
    emotion = get_emotion_model()
    audio = get_audio_model()
    text_pipe = get_text_analyzer()

    if not face_det:
        print("[app] WARNING: Face detector failed to load")
    if not deepfake:
        print("[app] WARNING: EfficientNet-B4-SBI deepfake model failed to load")
    if not emotion:
        print("[app] WARNING: MobileNetV2 emotion model failed to load")
    if not audio:
        print("[app] WARNING: AASIST audio model failed to load")
    if not text_pipe:
        print("[app] WARNING: DeBERTa text analyzer failed to load")

    # Pre-load FaceNet identity model
    tracker = get_identity_tracker()
    facenet = tracker._get_model()
    if not facenet:
        print("[app] WARNING: FaceNet identity model failed to load")
    else:
        print("[app] FaceNet identity model loaded")

    print("[app] Running warmup inference...")

    try:
        dummy_img = np.zeros((256, 256, 3), dtype=np.uint8)
        if face_det is not None:
            face_det.process(cv2.cvtColor(dummy_img, cv2.COLOR_BGR2RGB))
        if facenet is not None:
            dummy_face = np.zeros((160, 160, 3), dtype=np.uint8)
            tracker.compute_embedding(dummy_face)
        print("[app] Warmup complete.")
    except Exception as e:
        print(f"[app] Warmup failed (non-fatal): {e}")

    print("[app] All models ready.")
    yield

# ---------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------

app = FastAPI(
    title="RealSync AI Inference Service",
    description="Real-time frame analysis for deepfake, emotion, and identity detection.",
    version="1.0.0",
    lifespan=lifespan,
)

# Restrict CORS to the RealSync backend and local development origins.
# CORS_ALLOWED_ORIGIN supports comma-separated values for multiple origins.
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


# API key authentication middleware
@app.middleware("http")
async def api_key_auth(request: Request, call_next):
    # Skip auth if no API key is configured or for health endpoint
    if not AI_API_KEY or request.url.path == "/api/health":
        return await call_next(request)
    provided = request.headers.get("X-API-Key", "")
    if provided != AI_API_KEY:
        return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})
    return await call_next(request)


# ---------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------

class AnalyzeFrameRequest(BaseModel):
    sessionId: str
    frameB64: str = Field(..., description="Base64-encoded JPEG frame")
    capturedAt: Optional[str] = None


class AnalyzeAudioRequest(BaseModel):
    sessionId: str
    audioB64: str = Field(..., description="Base64-encoded PCM16 mono 16kHz audio")
    durationMs: Optional[int] = None


class AnalyzeTextRequest(BaseModel):
    sessionId: str
    text: str = Field(..., description="Transcript text (60s window)")


# ---------------------------------------------------------------
# Routes
# ---------------------------------------------------------------

@app.get("/api/health")
async def health():
    """Health check endpoint."""
    models = {}

    try:
        models["deepfake"] = "loaded" if get_deepfake_model() is not None else "unavailable"
    except Exception:
        models["deepfake"] = "error"

    try:
        models["emotion"] = "loaded" if get_emotion_model() is not None else "unavailable"
    except Exception:
        models["emotion"] = "error"

    try:
        models["face_detection"] = "loaded" if _get_face_detector() is not None else "unavailable"
    except Exception:
        models["face_detection"] = "error"

    try:
        tracker = get_identity_tracker()
        models["identity"] = "loaded" if tracker._get_model() is not None else "unavailable"
    except Exception:
        models["identity"] = "error"

    try:
        models["audio"] = "loaded" if get_audio_model() is not None else "unavailable"
    except Exception:
        models["audio"] = "error"

    try:
        models["text"] = "loaded" if get_text_analyzer() is not None else "unavailable"
    except Exception:
        models["text"] = "error"

    return {"ok": True, "models": models}


@app.post("/api/analyze/frame")
async def analyze_frame_endpoint(request: AnalyzeFrameRequest):
    """Analyze a video frame for deepfake, emotion, and identity signals."""
    if not request.frameB64 or not request.frameB64.strip():
        raise HTTPException(status_code=400, detail="frameB64 is required")
    if not request.sessionId:
        raise HTTPException(status_code=400, detail="sessionId is required")

    try:
        result = await run_in_threadpool(
            analyze_frame,
            session_id=request.sessionId,
            frame_b64=request.frameB64,
            captured_at=request.capturedAt,
        )
        return result
    except Exception as e:
        print(f"[app] Frame analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/api/analyze/audio")
async def analyze_audio_endpoint(request: AnalyzeAudioRequest):
    """Analyze audio for deepfake detection using AASIST."""
    if not request.audioB64:
        raise HTTPException(status_code=400, detail="audioB64 is required")
    if not request.sessionId:
        raise HTTPException(status_code=400, detail="sessionId is required")
    # M5: Reject oversized audio payloads (4MB base64 ≈ 3MB decoded)
    if len(request.audioB64) > 4 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="audioB64 payload exceeds 4MB limit")

    try:
        result = await run_in_threadpool(predict_audio, request.audioB64)
        processed_at = _utcnow_iso()
        return {
            "sessionId": request.sessionId,
            "processedAt": processed_at,
            "audio": result,
        }
    except Exception as e:
        print(f"[app] Audio analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Audio analysis failed: {str(e)}")


@app.post("/api/analyze/text")
async def analyze_text_endpoint(request: AnalyzeTextRequest):
    """Analyze transcript text for behavioral signals using DeBERTa-v3."""
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    if not request.sessionId:
        raise HTTPException(status_code=400, detail="sessionId is required")
    # I4: Reject oversized text payloads
    if len(request.text) > 50_000:
        raise HTTPException(status_code=413, detail="text payload exceeds 50KB limit")

    try:
        result = await run_in_threadpool(analyze_text_fn, request.text)
        processed_at = _utcnow_iso()
        return {
            "sessionId": request.sessionId,
            "processedAt": processed_at,
            "behavioral": result,
        }
    except Exception as e:
        print(f"[app] Text analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Text analysis failed: {str(e)}")


@app.post("/api/sessions/{session_id}/clear-identity")
async def clear_identity(session_id: str):
    """Clear stored identity baselines, temporal buffer, and no-face counters for a session."""
    if not session_id or len(session_id) > 64 or not re.match(r'^[a-zA-Z0-9_-]+$', session_id):
        raise HTTPException(status_code=400, detail="Invalid session_id format")
    cleanup_session(session_id)
    return {"ok": True, "sessionId": session_id}


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
