"""Tests for the POST /api/sessions/{session_id}/clear-identity endpoint."""
import pytest


@pytest.mark.anyio
async def test_clear_identity_valid(client):
    """AI-C-01: Valid session clear returns ok."""
    resp = await client.post("/api/sessions/test-session-123/clear-identity")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["sessionId"] == "test-session-123"


@pytest.mark.anyio
async def test_clear_identity_invalid_format(client):
    """AI-C-02: Path traversal in session_id returns 400."""
    resp = await client.post("/api/sessions/..%2F..%2Fetc/clear-identity")
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_clear_identity_oversized_id(client):
    """AI-C-03: Session ID > 64 chars returns 400."""
    long_id = "a" * 65
    resp = await client.post(f"/api/sessions/{long_id}/clear-identity")
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_clear_identity_special_chars(client):
    """Session ID with special characters returns 400."""
    resp = await client.post("/api/sessions/test@session!/clear-identity")
    assert resp.status_code in (400, 404)  # 404 if FastAPI path doesn't match
