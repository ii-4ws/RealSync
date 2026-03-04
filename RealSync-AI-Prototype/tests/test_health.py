"""Tests for the /api/health endpoint."""
import pytest


@pytest.mark.anyio
async def test_health_returns_ok(client):
    """AI-H-01: Health endpoint returns ok with model statuses."""
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert "models" in data
    models = data["models"]
    expected_keys = {"deepfake", "emotion", "face_detection", "identity", "audio", "text"}
    assert set(models.keys()) == expected_keys
    for key in expected_keys:
        assert models[key] in ("loaded", "unavailable", "error")


@pytest.mark.anyio
async def test_health_no_auth_required(client):
    """AI-H-03: Health endpoint skips API key auth."""
    # Even if AI_API_KEY were set, health should be exempted
    resp = await client.get("/api/health")
    assert resp.status_code == 200
