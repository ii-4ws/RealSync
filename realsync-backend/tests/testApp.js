/**
 * Test-friendly Express app builder.
 *
 * Mirrors the routes from index.js but avoids:
 *   - Server startup / listen()
 *   - WebSocket setup
 *   - Puppeteer / bot manager import
 *   - Chromium cleanup side-effects
 *   - Rate limiting (disabled for test speed)
 *
 * Imports real library modules so tests exercise actual business logic.
 */

const express = require("express");
const { v4: uuidv4 } = require("uuid");

const { MEETING_TYPES, generateSuggestions } = require("../lib/suggestions");
const { checkHealth: checkAiHealth } = require("../lib/aiClient");
const { AlertFusionEngine } = require("../lib/alertFusion");
const { FraudDetector } = require("../lib/fraudDetector");
const persistence = require("../lib/persistence");
const { EMOTIONS } = require("../lib/constants");

/* ------------------------------------------------------------------ */
/*  Helpers (same as index.js)                                         */
/* ------------------------------------------------------------------ */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toFixedNumber = (value, digits = 4) =>
  Number.parseFloat(value.toFixed(digits));
const makeIso = () => new Date().toISOString();

const generateSimulatedMetrics = () => {
  const now = new Date();
  const phase = now.getTime() / 1000;
  const wave = (speed, offset = 0) =>
    (Math.sin(phase / speed + offset) + 1) / 2;

  const dominantIndex = Math.min(
    EMOTIONS.length - 1,
    Math.floor(wave(9, 1.3) * EMOTIONS.length)
  );

  const weights = EMOTIONS.map((_, index) => 0.35 + 0.65 * wave(7, index));
  weights[dominantIndex] += 1.25;

  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const scores = EMOTIONS.reduce((acc, label, index) => {
    acc[label] = toFixedNumber(weights[index] / weightSum);
    return acc;
  }, {});

  const emotionLabel = EMOTIONS[dominantIndex];
  const emotionConfidence = scores[emotionLabel];

  const authenticityScore = clamp(0.82 + 0.16 * wave(8, 0.7), 0.55, 0.98);
  const deepfakeRisk =
    authenticityScore > 0.85 ? "low" : authenticityScore > 0.7 ? "medium" : "high";

  const audioConfidence = clamp(0.9 + 0.08 * wave(5, 0.4), 0.7, 0.99);
  const videoConfidence = clamp(authenticityScore + 0.03 * wave(4, 1.1), 0.6, 0.99);
  const behaviorConfidence = clamp(0.55 + emotionConfidence * 0.4, 0.5, 0.95);

  const trustScore = clamp(
    (authenticityScore + audioConfidence + videoConfidence + behaviorConfidence) / 4,
    0,
    1
  );

  return {
    timestamp: now.toISOString(),
    source: "simulated",
    emotion: {
      label: emotionLabel,
      confidence: toFixedNumber(emotionConfidence),
      scores,
    },
    deepfake: {
      authenticityScore: toFixedNumber(authenticityScore),
      model: "XceptionNet + EfficientNet (simulated)",
      riskLevel: deepfakeRisk,
    },
    trustScore: toFixedNumber(trustScore),
    confidenceLayers: {
      audio: toFixedNumber(audioConfidence),
      video: toFixedNumber(videoConfidence),
      behavior: toFixedNumber(behaviorConfidence),
    },
  };
};

/* ------------------------------------------------------------------ */
/*  In-memory session store                                            */
/* ------------------------------------------------------------------ */

const sessions = new Map();

function createSessionObj({ title, meetingType, meetingUrl = null, userId = null }) {
  const id = uuidv4();
  const session = {
    id,
    userId,
    title: title?.trim() || "Untitled session",
    createdAt: makeIso(),
    endedAt: null,
    meetingTypeSelected: MEETING_TYPES.includes(meetingType) ? meetingType : "business",
    meetingTypeManual: MEETING_TYPES.includes(meetingType) ? meetingType : null,
    meetingTypeAuto: { label: null, confidence: 0, scores: null },
    meetingUrl: meetingUrl || null,
    metrics: generateSimulatedMetrics(),
    source: "simulated",
    subscribers: new Set(),
    frameSnapshotCounter: 0,
    suggestionState: {
      fired: new Map(),
      lastMeetingTypeNoticeAt: 0,
    },
    transcriptState: {
      interim: "",
      lines: [],
    },
    stt: null,
    audioAnalysisBuffer: [],
    audioAnalysisInFlight: false,
    lastAudioAnalysisAt: 0,
    audioAuthenticityScore: null,
    lastBehavioralAnalysisAt: 0,
    alertFusion: new AlertFusionEngine(),
    fraudDetector: new FraudDetector(),
    botStatus: "idle",
    botStreams: { audio: false, video: false, captions: false },
    alerts: [],
    participants: new Map(),
    botDisplayName: "RealSync Bot",
    lastActiveSpeaker: null,
  };

  sessions.set(id, session);

  // Persist to Supabase (non-blocking, stub in test)
  persistence.createSession({
    id,
    title: session.title,
    meetingType: session.meetingTypeSelected,
    userId,
    meetingUrl,
  }).catch(() => {});

  return session;
}

const getSession = (sessionId) => (sessionId ? sessions.get(sessionId) : null);

function getLatestSessionForUser(userId) {
  let latest = null;
  let latestTime = 0;
  for (const session of sessions.values()) {
    if (session.endedAt) continue;
    if (session.userId !== userId) continue;
    const created = new Date(session.createdAt).getTime();
    if (created > latestTime) {
      latestTime = created;
      latest = session;
    }
  }
  return latest;
}

/* ------------------------------------------------------------------ */
/*  Build Express app with all REST routes                             */
/* ------------------------------------------------------------------ */

function buildApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // In test mode: no Supabase, so authenticate middleware passes through
  // with req.userId = null (prototype mode). We replicate that here.
  app.use((req, _res, next) => {
    req.userId = req.headers["x-test-user-id"] || null;
    next();
  });

  // --- Routes (matching index.js) ---

  app.get("/", (req, res) => {
    res.json({ status: "RealSync backend running" });
  });

  app.get("/api/health", async (req, res) => {
    const checks = {};

    try {
      const aiHealth = await checkAiHealth();
      checks.ai = aiHealth.ok ? "ok" : `unavailable: ${aiHealth.reason || "unknown"}`;
    } catch (err) {
      checks.ai = `error: ${err?.message ?? err}`;
    }

    checks.supabase = persistence.isAvailable?.() !== false ? "ok" : "unavailable";

    const allOk = checks.ai === "ok" && checks.supabase === "ok";
    const status = allOk ? 200 : 503;

    res.status(status).json({
      ok: allOk,
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  app.get("/api/models", (req, res) => {
    const latestSession = getLatestSessionForUser(req.userId);
    const usingExternal = Boolean(latestSession?.source === "external");
    res.json({
      mode: usingExternal ? "external" : "simulated",
      updatedAt: latestSession?.metrics?.timestamp ?? null,
      models: {
        emotion: {
          name: "FER2013 / AffectNet CNN",
          status: usingExternal ? "external" : "simulated",
        },
        deepfake: {
          name: "XceptionNet + EfficientNet",
          status: usingExternal ? "external" : "simulated",
        },
        transcript: {
          name: "GCP Streaming Speech-to-Text",
          status: process.env.REALSYNC_USE_GCP_STT === "1" ? "external" : "stub",
        },
      },
    });
  });

  app.post("/api/sessions", (req, res) => {
    const { title, meetingType, meetingUrl } = req.body ?? {};
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title is required" });
    }
    if (title.length > 500) {
      return res.status(400).json({ error: "title must be 500 characters or fewer" });
    }
    if (!meetingType || typeof meetingType !== "string" || !MEETING_TYPES.includes(meetingType)) {
      return res.status(400).json({ error: `meetingType must be one of: ${MEETING_TYPES.join(", ")}` });
    }
    if (meetingUrl) {
      try {
        const u = new URL(meetingUrl);
        const isZoom = u.hostname.endsWith(".zoom.us") || u.hostname.endsWith(".zoom.com")
          || u.hostname === "zoom.us" || u.hostname === "zoom.com";
        if (u.protocol !== "https:" || !isZoom) throw new Error("Not a Zoom URL");
      } catch {
        return res.status(400).json({ error: "meetingUrl must be a valid Zoom URL (https://...zoom.us or zoom.com)" });
      }
    }

    const session = createSessionObj({
      title,
      meetingType,
      meetingUrl: meetingUrl || null,
      userId: req.userId || null,
    });

    return res.json({
      sessionId: session.id,
      ingestWsUrl: `/ws/ingest?sessionId=${session.id}`,
      subscribeWsUrl: `/ws?sessionId=${session.id}`,
    });
  });

  app.get("/api/sessions", async (req, res) => {
    const allSessions = Array.from(sessions.values());
    const filtered = req.userId
      ? allSessions.filter((s) => s.userId === req.userId)
      : allSessions.filter((s) => !s.userId);

    const list = filtered.map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      endedAt: s.endedAt,
      meetingType: s.meetingTypeSelected,
      meetingUrl: s.meetingUrl || null,
      scheduledAt: s.scheduledAt || null,
      botStatus: s.botStatus || "idle",
    }));

    const sorted = list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json({ sessions: sorted });
  });

  app.post("/api/sessions/:id/stop", (req, res) => {
    const session = getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "not found" });

    session.endedAt = makeIso();
    session.stt?.end?.();
    session.stt = null;
    session.botStatus = "disconnected";

    persistence.endSession(session.id).catch(() => {});

    return res.json({ ok: true, endedAt: session.endedAt });
  });

  app.get("/api/sessions/:id/metrics", (req, res) => {
    const session = getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "not found" });
    return res.json(session.metrics);
  });

  app.get("/api/metrics", (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const latestSession = getLatestSessionForUser(req.userId);
    if (latestSession) {
      return res.json(latestSession.metrics);
    }
    return res.json(generateSimulatedMetrics());
  });

  // Global error handler (Express 5 requires 4-arg signature)
  app.use((err, req, res, _next) => {
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

module.exports = {
  buildApp,
  sessions,
  getSession,
  createSessionObj,
  generateSimulatedMetrics,
};
