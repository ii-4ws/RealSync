"""
Shared test fixtures for the RealSync AI Inference Service.

Provides:
- FastAPI test client (async)
- Minimal valid JPEG fixture (base64)
- Session ID generator
"""
import base64
import uuid

import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient


def _make_minimal_jpeg() -> bytes:
    """Create a minimal valid JPEG image (32x32 black)."""
    import cv2
    img = np.zeros((32, 32, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


@pytest.fixture
def valid_jpeg_b64() -> str:
    """Base64-encoded 32x32 black JPEG image."""
    return base64.b64encode(_make_minimal_jpeg()).decode()


@pytest.fixture
def session_id() -> str:
    """Generate a valid session ID (must be UUID format for API validation)."""
    return str(uuid.uuid4())


@pytest.fixture
async def client():
    """Async HTTP test client for the FastAPI app (no lifespan to skip model loading)."""
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
