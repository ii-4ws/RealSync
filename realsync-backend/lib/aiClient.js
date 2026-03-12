/**
 * AI Inference Service client.
 *
 * Sends video frames to the Python AI service (FastAPI :5100) and returns
 * per-face analysis results.  Falls back to a mock response when the AI
 * service is unavailable so the rest of the pipeline can be developed and
 * tested independently.
 */

const log = require("./logger");
const { EMOTIONS } = require("./constants");

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || "http://localhost:5100";
const ANALYZE_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 15000);
const AI_API_KEY = process.env.AI_API_KEY || "";

function generateMockResponse(sessionId, capturedAt) {
  const now = new Date().toISOString();
  const randScore = () => Number((Math.random()).toFixed(4));
  const randBetween = (lo, hi) =>
    Number((lo + Math.random() * (hi - lo)).toFixed(4));

  // Build random emotion scores that sum to ~1
  const rawScores = EMOTIONS.map(() => Math.random());
  const total = rawScores.reduce((s, v) => s + v, 0);
  const scores = {};
  EMOTIONS.forEach((e, i) => {
    scores[e] = Number((rawScores[i] / total).toFixed(4));
  });
  const dominantIdx = rawScores.indexOf(Math.max(...rawScores));
  const emotionLabel = EMOTIONS[dominantIdx];

  const authenticityScore = randBetween(0.55, 0.98);
  const deepfakeRisk =
    authenticityScore > 0.85 ? "low" : authenticityScore > 0.7 ? "medium" : "high";

  const face = {
    faceId: 0,
    bbox: { x: 100, y: 50, w: 200, h: 200 },
    confidence: randBetween(0.85, 0.99),
    emotion: {
      label: emotionLabel,
      confidence: scores[emotionLabel],
      scores,
    },
    deepfake: {
      authenticityScore,
      riskLevel: deepfakeRisk,
      model: "EfficientNet-B4-SBI (mock)",
    },
  };

  // M16: Match AI service trust formula — neutral baseline for behavior
  const behaviorConf = Number(
    (0.5 * (1.0 + scores[emotionLabel])).toFixed(4)
  );
  const audioConf = null; // No audio in mock — don't fabricate a signal
  // Trust score: 2-signal weighted formula matching AI service (video=0.55, behavior=0.45)
  const trustScore = Number(
    (0.55 * authenticityScore + 0.45 * behaviorConf).toFixed(4)
  );

  return {
    sessionId,
    capturedAt: capturedAt || now,
    processedAt: now,
    source: "mock",
    faces: [face],
    aggregated: {
      emotion: face.emotion,
      deepfake: face.deepfake,
      trustScore,
      confidenceLayers: {
        audio: audioConf,
        video: authenticityScore,
        behavior: behaviorConf,
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Real HTTP call to AI service                                       */
/* ------------------------------------------------------------------ */

let _fetchFn = null;

async function getFetch() {
  if (_fetchFn) return _fetchFn;
  // Node 18+ has global fetch; fallback handled gracefully.
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

/**
 * POST a video frame to the AI Inference Service.
 *
 * @param {{ sessionId: string, frameB64: string, capturedAt?: string }} payload
 * @returns {Promise<object>} Analysis result matching ai-inference.schema.json
 */
async function analyzeFrame({ sessionId, frameB64, capturedAt }) {
  const fetchImpl = await getFetch();
  if (!fetchImpl) {
    log.warn("aiClient", "No fetch implementation — returning mock.");
    return generateMockResponse(sessionId, capturedAt);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

  try {
    const headers = { "Content-Type": "application/json" };
    if (AI_API_KEY) headers["X-API-Key"] = AI_API_KEY;

    const res = await fetchImpl(`${AI_SERVICE_URL}/api/analyze/frame`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId, frameB64, capturedAt }),
      signal: controller.signal,
    });

    if (!res.ok) {
      if (res.status === 429) {
        // AI service is busy — wait briefly and retry once
        log.debug("aiClient", "AI service busy (429) — retrying in 1.5s");
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const retryRes = await fetchImpl(`${AI_SERVICE_URL}/api/analyze/frame`, {
            method: "POST",
            headers,
            body: JSON.stringify({ sessionId, frameB64, capturedAt }),
            signal: controller.signal,
          });
          if (retryRes.ok) return await retryRes.json();
        } catch (_) { /* retry failed — give up */ }
        return null;
      }
      log.error("aiClient", `AI service responded ${res.status} — returning mock. Start AI service on ${AI_SERVICE_URL}`);
      return generateMockResponse(sessionId, capturedAt);
    }

    return await res.json();
  } catch (err) {
    if (err?.name === "AbortError") {
      log.error("aiClient", `AI service timed out (${ANALYZE_TIMEOUT_MS}ms) — returning mock.`);
    } else {
      log.error("aiClient", `AI service unreachable at ${AI_SERVICE_URL} (${err?.message ?? err}) — returning mock. Is the AI service running?`);
    }
    return generateMockResponse(sessionId, capturedAt);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Health-check the AI service.
 * @returns {Promise<{ok: boolean, models?: object}>}
 */
async function checkHealth() {
  const fetchImpl = await getFetch();
  if (!fetchImpl) return { ok: false, reason: "no fetch" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const healthHeaders = {};
    if (AI_API_KEY) healthHeaders["X-API-Key"] = AI_API_KEY;

    const res = await fetchImpl(`${AI_SERVICE_URL}/api/health`, {
      method: "GET",
      headers: healthHeaders,
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

/**
 * POST an audio chunk to the AI Inference Service for deepfake detection.
 *
 * @param {{ sessionId: string, audioB64: string, durationMs: number }} payload
 * @returns {Promise<object>} Audio analysis result
 */
async function analyzeAudio({ sessionId, audioB64, durationMs }) {
  const fetchImpl = await getFetch();
  if (!fetchImpl) {
    log.warn("aiClient", "No fetch implementation — returning audio mock.");
    return {
      sessionId,
      processedAt: new Date().toISOString(),
      audio: { authenticityScore: 0.92, riskLevel: "low", model: "AASIST" },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

  try {
    const headers = { "Content-Type": "application/json" };
    if (AI_API_KEY) headers["X-API-Key"] = AI_API_KEY;

    const res = await fetchImpl(`${AI_SERVICE_URL}/api/analyze/audio`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId, audioB64, durationMs }),
      signal: controller.signal,
    });

    if (!res.ok) {
      log.warn("aiClient", `AI audio service responded ${res.status} — returning mock.`);
      return {
        sessionId,
        processedAt: new Date().toISOString(),
        audio: { authenticityScore: 0.92, riskLevel: "low", model: "AASIST" },
      };
    }

    return await res.json();
  } catch (err) {
    if (err?.name === "AbortError") {
      log.warn("aiClient", "AI audio service timed out — returning mock.");
    } else {
      log.warn("aiClient", `AI audio service unreachable (${err?.message ?? err}) — returning mock.`);
    }
    return {
      sessionId,
      processedAt: new Date().toISOString(),
      audio: { authenticityScore: 0.92, riskLevel: "low", model: "AASIST" },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST text to the AI Inference Service for behavioral / NLI analysis.
 *
 * @param {{ sessionId: string, text: string }} payload
 * @returns {Promise<object>} Text analysis result
 */
async function analyzeText({ sessionId, text }) {
  const fetchImpl = await getFetch();
  if (!fetchImpl) {
    log.warn("aiClient", "No fetch implementation — returning text mock.");
    return {
      sessionId,
      processedAt: new Date().toISOString(),
      behavioral: { signals: [], highestScore: 0.0, model: "DeBERTa-v3-NLI" },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

  try {
    const headers = { "Content-Type": "application/json" };
    if (AI_API_KEY) headers["X-API-Key"] = AI_API_KEY;

    const res = await fetchImpl(`${AI_SERVICE_URL}/api/analyze/text`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId, text }),
      signal: controller.signal,
    });

    if (!res.ok) {
      log.warn("aiClient", `AI text service responded ${res.status} — returning mock.`);
      return {
        sessionId,
        processedAt: new Date().toISOString(),
        behavioral: { signals: [], highestScore: 0.0, model: "DeBERTa-v3-NLI" },
      };
    }

    return await res.json();
  } catch (err) {
    if (err?.name === "AbortError") {
      log.warn("aiClient", "AI text service timed out — returning mock.");
    } else {
      log.warn("aiClient", `AI text service unreachable (${err?.message ?? err}) — returning mock.`);
    }
    return {
      sessionId,
      processedAt: new Date().toISOString(),
      behavioral: { signals: [], highestScore: 0.0, model: "DeBERTa-v3-NLI" },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST audio to the AI Inference Service for Whisper transcription.
 *
 * @param {{ sessionId: string, audioB64: string, durationMs?: number }} payload
 * @returns {Promise<object|null>} Transcription result or null on failure
 */
async function transcribeAudio({ sessionId, audioB64, durationMs }) {
  const fetchImpl = await getFetch();
  if (!fetchImpl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

  try {
    const headers = { "Content-Type": "application/json" };
    if (AI_API_KEY) headers["X-API-Key"] = AI_API_KEY;

    const res = await fetchImpl(`${AI_SERVICE_URL}/api/transcribe`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId, audioB64, durationMs }),
      signal: controller.signal,
    });

    if (!res.ok) {
      log.warn("aiClient", `Whisper transcribe responded ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    // Silent failure — transcription is supplementary
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
  // Exposed for testing
  _generateMockResponse: generateMockResponse,
};
