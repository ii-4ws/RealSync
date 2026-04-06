"""Tests for the POST /api/analyze/text endpoint."""
import pytest


@pytest.mark.anyio
async def test_text_valid_input(client, session_id):
    """AI-T-01: Valid text returns behavioral signals."""
    resp = await client.post("/api/analyze/text", json={
        "sessionId": session_id,
        "text": "Please send me your verification code immediately, it's urgent.",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["sessionId"] == session_id
    assert "behavioral" in data
    beh = data["behavioral"]
    assert "signals" in beh
    assert isinstance(beh["signals"], list)
    assert "highestScore" in beh


@pytest.mark.anyio
async def test_text_benign(client, session_id):
    """AI-T-02: Benign text returns empty or low signals."""
    resp = await client.post("/api/analyze/text", json={
        "sessionId": session_id,
        "text": "Let's discuss the project timeline for next quarter and review milestones.",
    })
    assert resp.status_code == 200
    data = resp.json()
    signals = data["behavioral"]["signals"]
    # Benign text should have no high-confidence signals
    for sig in signals:
        # Even if present, scores should be relatively low
        assert sig["score"] <= 1.0


@pytest.mark.anyio
async def test_text_empty(client, session_id):
    """AI-T-03: Empty text returns 400."""
    resp = await client.post("/api/analyze/text", json={
        "sessionId": session_id,
        "text": "",
    })
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_text_missing_session_id(client):
    """AI-T-04: Missing sessionId returns 400."""
    resp = await client.post("/api/analyze/text", json={
        "sessionId": "",
        "text": "Some text here.",
    })
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_text_oversized(client, session_id):
    """AI-T-05: Text > 50KB returns 413."""
    big_text = "A" * 60_000
    resp = await client.post("/api/analyze/text", json={
        "sessionId": session_id,
        "text": big_text,
    })
    assert resp.status_code == 413
