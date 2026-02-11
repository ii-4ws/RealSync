/**
 * AI Inference Service client.
 *
 * Sends video frames to the Python AI service (FastAPI :5100) and returns
 * per-face analysis results.  Falls back to a mock response when the AI
 * service is unavailable so the rest of the pipeline can be developed and
 * tested independently.
 */

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || "http://localhost:5100";
const ANALYZE_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 5000);

/* ------------------------------------------------------------------ */
/*  Mock response (matches contracts/ai-inference.schema.json)         */
/* ------------------------------------------------------------------ */

const EMOTIONS = ["Happy", "Neutral", "Angry", "Fear", "Surprise", "Sad"];

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

  const embeddingShift = randBetween(0.03, 0.45);
  const identityRisk =
    embeddingShift < 0.2 ? "low" : embeddingShift < 0.4 ? "medium" : "high";

  const face = {
    faceId: 0,
    bbox: { x: 100, y: 50, w: 200, h: 200 },
    confidence: randBetween(0.85, 0.99),
    emotion: {
      label: emotionLabel,
      confidence: scores[emotionLabel],
      scores,
    },
    identity: {
      embeddingShift,
      samePerson: embeddingShift < 0.25,
      riskLevel: identityRisk,
    },
    deepfake: {
      authenticityScore,
      riskLevel: deepfakeRisk,
      model: "MesoNet-4 (mock)",
    },
  };

  const behaviorConf = Number(
    (0.55 + scores[emotionLabel] * 0.4).toFixed(4)
  );
  const trustScore = Number(
    (
      (authenticityScore +
        0.9 +
        (1 - embeddingShift) +
        behaviorConf) /
      4
    ).toFixed(4)
  );

  return {
    sessionId,
    capturedAt: capturedAt || now,
    processedAt: now,
    faces: [face],
    aggregated: {
      emotion: face.emotion,
      identity: face.identity,
      deepfake: face.deepfake,
      trustScore,
      confidenceLayers: {
        audio: 0.9,
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
    console.warn("[aiClient] No fetch implementation — returning mock.");
    return generateMockResponse(sessionId, capturedAt);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

  try {
    const res = await fetchImpl(`${AI_SERVICE_URL}/api/analyze/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, frameB64, capturedAt }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(
        `[aiClient] AI service responded ${res.status} — returning mock.`
      );
      return generateMockResponse(sessionId, capturedAt);
    }

    return await res.json();
  } catch (err) {
    if (err?.name === "AbortError") {
      console.warn("[aiClient] AI service timed out — returning mock.");
    } else {
      console.warn(
        `[aiClient] AI service unreachable (${err?.message ?? err}) — returning mock.`
      );
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

  try {
    const res = await fetchImpl(`${AI_SERVICE_URL}/api/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ok: false, reason: `status ${res.status}` };
    return await res.json();
  } catch (err) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

module.exports = {
  analyzeFrame,
  checkHealth,
  // Exposed for testing
  _generateMockResponse: generateMockResponse,
};
