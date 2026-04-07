/**
 * AI Inference Service client.
 *
 * Sends video frames, audio, and text to the Python AI service (FastAPI :5100).
 * Returns null when the AI service is unavailable — callers handle the absence.
 */

const log = require("./logger");

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || "http://localhost:5100";
const ANALYZE_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 15000);
const AI_API_KEY = process.env.AI_API_KEY || "";

/* ------------------------------------------------------------------ */
/*  HTTP fetch helper                                                   */
/* ------------------------------------------------------------------ */

let _fetchFn = null;

async function getFetch() {
  if (_fetchFn) return _fetchFn;
  if (typeof globalThis.fetch === "function") {
    _fetchFn = globalThis.fetch;
    return _fetchFn;
  }
  try {
    _fetchFn = (await import("node-fetch")).default;
  } catch {
    _fetchFn = null;
  }
  return _fetchFn;
}

function buildHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (AI_API_KEY) headers["X-API-Key"] = AI_API_KEY;
  return headers;
}

/* ------------------------------------------------------------------ */
/*  Frame analysis                                                      */
/* ------------------------------------------------------------------ */

/**
 * POST a video frame to the AI Inference Service.
 * Returns null if the service is unavailable.
 */
async function analyzeFrame({ sessionId, frameB64, capturedAt }) {
  const fetchImpl = await getFetch();
  if (!fetchImpl) {
    log.warn("aiClient", "No fetch implementation — AI service unavailable.");
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

  try {
    const res = await fetchImpl(`${AI_SERVICE_URL}/api/analyze/frame`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ sessionId, frameB64, capturedAt }),
      signal: controller.signal,
    });

    if (!res.ok) {
      if (res.status === 429) {
        log.debug("aiClient", "AI service busy (429) — retrying in 1.5s");
        await new Promise((r) => setTimeout(r, 1500));
        const retryController = new AbortController();
        const retryTimer = setTimeout(() => retryController.abort(), ANALYZE_TIMEOUT_MS);
        try {
          const retryRes = await fetchImpl(`${AI_SERVICE_URL}/api/analyze/frame`, {
            method: "POST",
            headers: buildHeaders(),
            body: JSON.stringify({ sessionId, frameB64, capturedAt }),
            signal: retryController.signal,
          });
          if (retryRes.ok) return await retryRes.json();
        } catch (_) { /* retry failed */ } finally {
          clearTimeout(retryTimer);
        }
        return null;
      }
      log.error("aiClient", `AI service responded ${res.status}. Is it running on ${AI_SERVICE_URL}?`);
      return null;
    }

    return await res.json();
  } catch (err) {
    if (err?.name === "AbortError") {
      log.error("aiClient", `AI service timed out (${ANALYZE_TIMEOUT_MS}ms).`);
    } else {
      log.error("aiClient", `AI service unreachable at ${AI_SERVICE_URL} (${err?.message ?? err}).`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/*  Health check                                                        */
/* ------------------------------------------------------------------ */

async function checkHealth() {
  const fetchImpl = await getFetch();
  if (!fetchImpl) return { ok: false, reason: "no fetch" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetchImpl(`${AI_SERVICE_URL}/api/health`, {
      method: "GET",
      headers: AI_API_KEY ? { "X-API-Key": AI_API_KEY } : {},
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: `status ${res.status}` };
    return await res.json();
  } catch (err) {
    return { ok: false, reason: err?.message ?? String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/*  Audio analysis                                                      */
/* ------------------------------------------------------------------ */

async function analyzeAudio({ sessionId, audioB64, durationMs }) {
  const fetchImpl = await getFetch();
  if (!fetchImpl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

  try {
    const res = await fetchImpl(`${AI_SERVICE_URL}/api/analyze/audio`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ sessionId, audioB64, durationMs }),
      signal: controller.signal,
    });

    if (!res.ok) {
      log.warn("aiClient", `AI audio service responded ${res.status}.`);
      return null;
    }
    return await res.json();
  } catch (err) {
    log.warn("aiClient", `AI audio service error: ${err?.message ?? err}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/*  Text analysis                                                       */
/* ------------------------------------------------------------------ */

async function analyzeText({ sessionId, text }) {
  const fetchImpl = await getFetch();
  if (!fetchImpl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

  try {
    const res = await fetchImpl(`${AI_SERVICE_URL}/api/analyze/text`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ sessionId, text }),
      signal: controller.signal,
    });

    if (!res.ok) {
      log.warn("aiClient", `AI text service responded ${res.status}.`);
      return null;
    }
    return await res.json();
  } catch (err) {
    log.warn("aiClient", `AI text service error: ${err?.message ?? err}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/*  Whisper transcription                                               */
/* ------------------------------------------------------------------ */

async function transcribeAudio({ sessionId, audioB64, durationMs }) {
  const fetchImpl = await getFetch();
  if (!fetchImpl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

  try {
    const res = await fetchImpl(`${AI_SERVICE_URL}/api/transcribe`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ sessionId, audioB64, durationMs }),
      signal: controller.signal,
    });

    if (!res.ok) {
      log.warn("aiClient", `Whisper transcribe responded ${res.status}`);
      return null;
    }
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  analyzeFrame,
  analyzeAudio,
  analyzeText,
  transcribeAudio,
  checkHealth,
};
