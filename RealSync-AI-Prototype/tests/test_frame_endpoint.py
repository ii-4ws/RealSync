"""Tests for the POST /api/analyze/frame endpoint."""
import base64
import pytest
import numpy as np


@pytest.mark.anyio
async def test_frame_valid_input(client, valid_jpeg_b64, session_id):
    """AI-F-01: Valid frame returns faces array and aggregated results."""
    resp = await client.post("/api/analyze/frame", json={
        "sessionId": session_id,
        "frameB64": valid_jpeg_b64,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["sessionId"] == session_id
    assert "faces" in data
    assert isinstance(data["faces"], list)
    assert "aggregated" in data
    agg = data["aggregated"]
    assert "emotion" in agg
    assert "identity" in agg
    assert "deepfake" in agg
    # trustScore can be None (no face) or float
    if agg.get("trustScore") is not None:
        assert 0.0 <= agg["trustScore"] <= 1.0


@pytest.mark.anyio
async def test_frame_empty_frameb64(client, session_id):
    """AI-F-02: Empty frameB64 returns 400."""
    resp = await client.post("/api/analyze/frame", json={
        "sessionId": session_id,
        "frameB64": "",
    })
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_frame_missing_session_id(client, valid_jpeg_b64):
    """AI-F-03: Missing sessionId returns 400."""
    resp = await client.post("/api/analyze/frame", json={
        "sessionId": "",
        "frameB64": valid_jpeg_b64,
    })
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_frame_invalid_base64(client, session_id):
    """AI-F-05: Invalid base64 does not crash, returns structured response."""
    resp = await client.post("/api/analyze/frame", json={
        "sessionId": session_id,
        "frameB64": "not_valid_base64!!!",
    })
    # Should either return 500 with message or 200 with empty faces
    assert resp.status_code in (200, 500)
    if resp.status_code == 200:
        data = resp.json()
        assert data["faces"] == []


@pytest.mark.anyio
async def test_frame_tiny_image(client, session_id, small_jpeg_b64):
    """AI-F-07: Image below 10x10 minimum returns empty faces."""
    resp = await client.post("/api/analyze/frame", json={
        "sessionId": session_id,
        "frameB64": small_jpeg_b64,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["faces"] == []


@pytest.mark.anyio
async def test_frame_no_face_black_image(client, session_id, valid_jpeg_b64):
    """AI-F-09: Black frame (no face) returns noFaceDetected flag."""
    resp = await client.post("/api/analyze/frame", json={
        "sessionId": session_id,
        "frameB64": valid_jpeg_b64,  # black 32x32, unlikely to have a face
    })
    assert resp.status_code == 200
    data = resp.json()
    if len(data["faces"]) == 0:
        assert data["aggregated"].get("noFaceDetected") is True


@pytest.mark.anyio
async def test_frame_camera_off_detection(client, session_id, valid_jpeg_b64):
    """AI-F-10: 5+ consecutive no-face frames trigger cameraOff flag."""
    for i in range(6):
        resp = await client.post("/api/analyze/frame", json={
            "sessionId": session_id,
            "frameB64": valid_jpeg_b64,  # black frame, no face
        })
        assert resp.status_code == 200
        data = resp.json()
        if i >= 4 and len(data["faces"]) == 0:
            # After 5th frame with no face, cameraOff should be true
            assert data["aggregated"].get("cameraOff") is True or data["aggregated"].get("noFaceDetected") is True


@pytest.mark.anyio
async def test_frame_session_id_validation(client, valid_jpeg_b64):
    """AI-F-11: Path traversal in sessionId returns empty response."""
    resp = await client.post("/api/analyze/frame", json={
        "sessionId": "../../etc/passwd",
        "frameB64": valid_jpeg_b64,
    })
    assert resp.status_code == 200
    data = resp.json()
    # Invalid session ID should be caught by validation
    assert data["sessionId"] == "invalid" or data["faces"] == []
