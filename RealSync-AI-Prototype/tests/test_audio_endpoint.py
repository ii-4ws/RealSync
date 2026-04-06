"""Tests for the POST /api/analyze/audio endpoint."""
import base64
import struct
import pytest


@pytest.mark.anyio
async def test_audio_valid_input(client, valid_audio_b64, session_id):
    """AI-A-01: Valid PCM16 audio returns authenticityScore and model."""
    resp = await client.post("/api/analyze/audio", json={
        "sessionId": session_id,
        "audioB64": valid_audio_b64,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["sessionId"] == session_id
    assert "audio" in data
    audio = data["audio"]
    assert "authenticityScore" in audio
    assert "riskLevel" in audio
    assert audio["riskLevel"] in ("low", "medium", "high", "unknown")
    if audio["authenticityScore"] is not None:
        assert 0.0 <= audio["authenticityScore"] <= 1.0


@pytest.mark.anyio
async def test_audio_short_input(client, session_id):
    """AI-A-02: Short audio (1 second, 16000 samples) is padded and processed."""
    pcm = struct.pack("<16000h", *([0] * 16000))
    audio_b64 = base64.b64encode(pcm).decode()
    resp = await client.post("/api/analyze/audio", json={
        "sessionId": session_id,
        "audioB64": audio_b64,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "audio" in data


@pytest.mark.anyio
async def test_audio_empty(client, session_id):
    """AI-A-05: Empty audioB64 returns 400."""
    resp = await client.post("/api/analyze/audio", json={
        "sessionId": session_id,
        "audioB64": "",
    })
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_audio_missing_session_id(client, valid_audio_b64):
    """AI-A-06: Missing sessionId returns 400."""
    resp = await client.post("/api/analyze/audio", json={
        "sessionId": "",
        "audioB64": valid_audio_b64,
    })
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_audio_oversized(client, session_id):
    """AI-A-04: Audio > 4MB returns 413."""
    # Create a 5MB base64 payload
    big_audio = base64.b64encode(b"\x00" * (5 * 1024 * 1024)).decode()
    resp = await client.post("/api/analyze/audio", json={
        "sessionId": session_id,
        "audioB64": big_audio,
    })
    assert resp.status_code == 413
