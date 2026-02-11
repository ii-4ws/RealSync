"""
RealSync AI Inference Service — FastAPI Server.

Wraps the existing AI prototype models (MesoNet-4, FER, MediaPipe) into a
real-time REST API for per-frame analysis.

Run:
    cd RealSync-AI-Prototype
    python -m serve.app

Or:
    uvicorn serve.app:app --host 0.0.0.0 --port 5100 --reload
"""
import sys
import os

# Ensure the src directory is in the Python path for model imports
SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

from serve.config import PORT, HOST
from serve.inference import analyze_frame, get_identity_tracker

# ---------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------

app = FastAPI(
    title="RealSync AI Inference Service",
    description="Real-time frame analysis for deepfake, emotion, and identity detection.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------

class AnalyzeFrameRequest(BaseModel):
    sessionId: str
    frameB64: str = Field(..., description="Base64-encoded JPEG frame")
    capturedAt: Optional[str] = None


# ---------------------------------------------------------------
# Routes
# ---------------------------------------------------------------

@app.get("/api/health")
async def health():
    """Health check endpoint."""
    models = {}

    # Check each model availability
    try:
        from serve.inference import _get_mesonet
        models["deepfake"] = "loaded" if _get_mesonet() is not None else "unavailable"
    except Exception:
        models["deepfake"] = "error"

    try:
        from serve.inference import _get_fer
        models["emotion"] = "loaded" if _get_fer() is not None else "unavailable"
    except Exception:
        models["emotion"] = "error"

    try:
        from serve.inference import _get_face_detector
        models["face_detection"] = "loaded" if _get_face_detector() is not None else "unavailable"
    except Exception:
        models["face_detection"] = "error"

    models["identity"] = "loaded"  # Always available (lightweight)

    return {"ok": True, "models": models}


@app.post("/api/analyze/frame")
async def analyze_frame_endpoint(request: AnalyzeFrameRequest):
    """
    Analyze a video frame for deepfake, emotion, and identity signals.

    Accepts a base64-encoded JPEG frame and returns per-face analysis
    matching the contracts/ai-inference.schema.json contract.
    """
    if not request.frameB64:
        raise HTTPException(status_code=400, detail="frameB64 is required")

    if not request.sessionId:
        raise HTTPException(status_code=400, detail="sessionId is required")

    try:
        result = analyze_frame(
            session_id=request.sessionId,
            frame_b64=request.frameB64,
            captured_at=request.capturedAt,
        )
        return result
    except Exception as e:
        print(f"[app] Frame analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/api/sessions/{session_id}/clear-identity")
async def clear_identity(session_id: str):
    """Clear stored identity baselines for a session (called on session end)."""
    tracker = get_identity_tracker()
    tracker.clear_session(session_id)
    return {"ok": True, "sessionId": session_id}


# ---------------------------------------------------------------
# Startup
# ---------------------------------------------------------------

@app.on_event("startup")
async def startup():
    """Pre-load models on startup for faster first inference."""
    print("[app] Pre-loading models...")
    from serve.inference import _get_mesonet, _get_fer, _get_face_detector
    _get_face_detector()
    _get_fer()
    _get_mesonet()
    print("[app] Models ready.")


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
