"""
Shared test fixtures for the RealSync AI Inference Service.

Provides:
- FastAPI test client (async)
- Minimal valid JPEG fixture (base64)
- Valid PCM16 audio fixture (base64)
- Session ID generator
- Model-disabling monkeypatch (CI-safe, no GPU required)
"""
import base64
import io
import struct
import uuid

import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient

# Build a minimal valid JPEG in-memory (1x1 black pixel)
def _make_minimal_jpeg() -> bytes:
    """Create a minimal valid JPEG image (1x1 pixel) using OpenCV."""
    import cv2
    img = np.zeros((32, 32, 3), dtype=np.uint8)  # 32x32 to be above 10x10 threshold
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def _make_jpeg(width: int, height: int) -> bytes:
    """Create a valid JPEG of specified size."""
    import cv2
    img = np.zeros((height, width, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def _make_pcm16_audio(num_samples: int = 64000) -> bytes:
    """Create PCM16 mono audio (silence)."""
    return struct.pack(f"<{num_samples}h", *([0] * num_samples))


@pytest.fixture
def valid_jpeg_b64() -> str:
    """Base64-encoded 32x32 black JPEG image."""
    return base64.b64encode(_make_minimal_jpeg()).decode()


@pytest.fixture
def valid_audio_b64() -> str:
    """Base64-encoded PCM16 mono 16kHz silence (4 seconds = 64000 samples)."""
    pcm = _make_pcm16_audio(64000)
    return base64.b64encode(pcm).decode()


@pytest.fixture
def session_id() -> str:
    """Generate a valid session ID."""
    return f"test-{uuid.uuid4().hex[:12]}"


@pytest.fixture
async def client():
    """Async HTTP test client for the FastAPI app (no lifespan to skip model loading)."""
    # Import the app but skip lifespan (model pre-loading) for fast tests
    from serve.app import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest.fixture
def small_jpeg_b64() -> str:
    """Base64-encoded 5x5 JPEG (below minimum 10x10 threshold)."""
    import cv2
    img = np.zeros((5, 5, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    return base64.b64encode(buf.tobytes()).decode()
