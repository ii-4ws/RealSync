const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const { createSttStream } = require("./lib/gcpStt");
const { MEETING_TYPES, scoreMeetingType, generateSuggestions } = require("./lib/suggestions");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 4000;

const EMOTIONS = ["Happy", "Neutral", "Angry", "Fear", "Surprise", "Sad"];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toFixedNumber = (value, digits = 4) =>
  Number.parseFloat(value.toFixed(digits));

let broadcastInterval = null;

const sessions = new Map();
let latestSessionId = null;

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

  const embeddingShift = clamp(0.08 + 0.35 * wave(6, 2.1), 0.03, 0.65);
  const identityRisk =
    embeddingShift < 0.2 ? "low" : embeddingShift < 0.4 ? "medium" : "high";

  const authenticityScore = clamp(0.82 + 0.16 * wave(8, 0.7), 0.55, 0.98);
  const deepfakeRisk =
    authenticityScore > 0.85 ? "low" : authenticityScore > 0.7 ? "medium" : "high";

  const audioConfidence = clamp(0.9 + 0.08 * wave(5, 0.4), 0.7, 0.99);
  const videoConfidence = clamp(1 - embeddingShift + 0.03 * wave(4, 1.1), 0.6, 0.99);
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
    identity: {
      samePerson: embeddingShift < 0.25,
      embeddingShift: toFixedNumber(embeddingShift),
      riskLevel: identityRisk,
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

const deriveMetrics = (payload) => {
  const emotionLabel =
    typeof payload?.emotion?.label === "string" && EMOTIONS.includes(payload.emotion.label)
      ? payload.emotion.label
      : "Neutral";
  const emotionConfidence =
    typeof payload?.emotion?.confidence === "number" ? payload.emotion.confidence : 0.5;
  const embeddingShift =
    typeof payload?.identity?.embeddingShift === "number" ? payload.identity.embeddingShift : 0.3;
  const authenticityScore =
    typeof payload?.deepfake?.authenticityScore === "number"
      ? payload.deepfake.authenticityScore
      : 0.8;

  const emotionScores =
    payload?.emotion?.scores ??
    EMOTIONS.reduce((acc, label) => {
      acc[label] = label === emotionLabel ? emotionConfidence : toFixedNumber(0.02);
      return acc;
    }, {});

  const confidenceLayers = payload.confidenceLayers ?? {
    audio: clamp(0.85 + authenticityScore * 0.1, 0, 1),
    video: clamp(1 - embeddingShift, 0, 1),
    behavior: clamp(0.5 + emotionConfidence * 0.5, 0, 1),
  };

  const trustScore =
    typeof payload.trustScore === "number"
      ? payload.trustScore
      : clamp(
          (authenticityScore +
            confidenceLayers.audio +
            confidenceLayers.video +
            confidenceLayers.behavior) /
            4,
          0,
          1
        );

  return {
    ...payload,
    emotion: {
      ...(payload.emotion ?? {}),
      label: emotionLabel,
      confidence: toFixedNumber(emotionConfidence),
      scores: emotionScores,
    },
    confidenceLayers,
    trustScore: toFixedNumber(trustScore),
  };
};

const createSession = ({ title, meetingType }) => {
  const id = uuidv4();
  const session = {
    id,
    title: title?.trim() || "Untitled session",
    createdAt: makeIso(),
    endedAt: null,
    meetingTypeSelected: MEETING_TYPES.includes(meetingType) ? meetingType : "business",
    meetingTypeAuto: { label: null, confidence: 0, scores: null },
    metrics: generateSimulatedMetrics(),
    source: "simulated",
    subscribers: new Set(),
    suggestionState: {
      fired: new Map(),
      lastMeetingTypeNoticeAt: 0,
    },
    transcriptState: {
      interim: "",
      lines: [],
    },
    stt: null,
  };

  sessions.set(id, session);
  latestSessionId = id;
  return session;
};

const getSession = (sessionId) => (sessionId ? sessions.get(sessionId) : null);

const broadcastToSession = (sessionId, message) => {
  const session = getSession(sessionId);
  if (!session) return;

  const payload = JSON.stringify({ sessionId, ...message });
  session.subscribers.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
};

const server = http.createServer(app);
const wssSubscribe = new WebSocket.Server({ server, path: "/ws" });
const wssIngest = new WebSocket.Server({ server, path: "/ws/ingest" });

wssSubscribe.on("connection", (socket, req) => {
  const url = new URL(req.url, "http://localhost");
  const requestedSessionId = url.searchParams.get("sessionId");
  const sessionId = requestedSessionId || latestSessionId;

  const session = sessionId ? getSession(sessionId) : null;
  if (!session) {
    // Backwards-compat: if no sessions exist, keep old behavior.
    socket.send(JSON.stringify({ type: "metrics", data: generateSimulatedMetrics() }));
    return;
  }

  session.subscribers.add(socket);

  socket.send(
    JSON.stringify({
      type: "metrics",
      sessionId: session.id,
      data: session.metrics,
    })
  );

  socket.on("close", () => {
    session.subscribers.delete(socket);
  });
});

const handleTranscript = (session, transcript) => {
  const { text, isFinal, confidence, ts } = transcript;

  if (isFinal) {
    session.transcriptState.lines.push({ text, ts, confidence });
    session.transcriptState.interim = "";
  } else {
    session.transcriptState.interim = text;
  }

  // Auto-detect meeting type (secondary signal).
  const typeScore = scoreMeetingType(text);
  session.meetingTypeAuto = typeScore;

  // Suggestions are rules-first and deterministic.
  const suggestions = generateSuggestions({
    transcriptText: text,
    meetingTypeSelected: session.meetingTypeSelected,
    metrics: session.metrics,
    fired: session.suggestionState.fired,
  });

  broadcastToSession(session.id, {
    type: "transcript",
    text,
    isFinal,
    confidence: typeof confidence === "number" ? toFixedNumber(confidence, 3) : null,
    ts,
  });

  suggestions.forEach((suggestion) => {
    broadcastToSession(session.id, {
      type: "suggestion",
      severity: suggestion.severity,
      title: suggestion.title,
      message: suggestion.message,
      ts: suggestion.ts,
    });
  });

  // Meeting type mismatch notice (low severity) if auto confidence is strong.
  const now = Date.now();
  if (
    typeScore.confidence >= 0.75 &&
    typeScore.label &&
    typeScore.label !== session.meetingTypeSelected &&
    now - session.suggestionState.lastMeetingTypeNoticeAt > 120_000
  ) {
    session.suggestionState.lastMeetingTypeNoticeAt = now;
    broadcastToSession(session.id, {
      type: "suggestion",
      severity: "low",
      title: "Meeting Type Check",
      message: `Transcript sounds more like a ${typeScore.label} meeting. Confirm meeting type if needed.`,
      ts: makeIso(),
    });
  }
};

wssIngest.on("connection", (socket, req) => {
  const url = new URL(req.url, "http://localhost");
  const sessionId = url.searchParams.get("sessionId");
  const session = getSession(sessionId);

  if (!session) {
    socket.close(1008, "Unknown session");
    return;
  }

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString("utf-8"));
    } catch (err) {
      return;
    }

    if (!message || typeof message !== "object") return;

    if (message.type === "start") {
      if (MEETING_TYPES.includes(message.meetingType)) {
        session.meetingTypeSelected = message.meetingType;
      }
      return;
    }

    if (message.type === "stop") {
      session.stt?.end?.();
      session.stt = null;
      return;
    }

    if (message.type === "audio_pcm") {
      if (Number(message.sampleRate) !== 16000 || Number(message.channels) !== 1) {
        return;
      }

      if (!session.stt) {
        session.stt = createSttStream({
          onTranscript: (t) => handleTranscript(session, t),
          onError: (err) => {
            console.warn(`STT error for session ${session.id}: ${err?.message ?? err}`);
          },
        });
      }

      const dataB64 = message.dataB64;
      if (typeof dataB64 !== "string" || !dataB64) return;

      const audioBuffer = Buffer.from(dataB64, "base64");
      session.stt.write(audioBuffer);
      return;
    }

    // Optional v1: forward frames to AI service (not implemented yet).
    if (message.type === "frame") {
      return;
    }
  });

  socket.on("close", () => {
    // If client disconnects, keep session alive; stop STT stream to avoid leaks.
    session.stt?.end?.();
    session.stt = null;
  });
});

const ensureBroadcastLoop = () => {
  if (broadcastInterval) return;
  broadcastInterval = setInterval(() => {
    sessions.forEach((session) => {
      if (session.endedAt) return;
      if (session.source !== "external") {
        session.metrics = generateSimulatedMetrics();
      }
      broadcastToSession(session.id, {
        type: "metrics",
        data: session.metrics,
      });
    });
  }, 2000);
};

ensureBroadcastLoop();

app.get("/", (req, res) => {
  res.json({ status: "RealSync backend running" });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/models", (req, res) => {
  const usingExternal = Boolean(
    latestSessionId && sessions.get(latestSessionId)?.source === "external"
  );
  res.json({
    mode: usingExternal ? "external" : "simulated",
    updatedAt: latestSessionId ? sessions.get(latestSessionId)?.metrics?.timestamp ?? null : null,
    models: {
      emotion: {
        name: "FER2013 / AffectNet CNN",
        status: usingExternal ? "external" : "simulated",
      },
      identity: {
        name: "FaceNet / InsightFace",
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
  const { title, meetingType } = req.body ?? {};
  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  if (!meetingType || typeof meetingType !== "string" || !MEETING_TYPES.includes(meetingType)) {
    return res.status(400).json({ error: `meetingType must be one of: ${MEETING_TYPES.join(", ")}` });
  }

  const session = createSession({ title, meetingType });
  return res.json({
    sessionId: session.id,
    ingestWsUrl: `/ws/ingest?sessionId=${session.id}`,
    subscribeWsUrl: `/ws?sessionId=${session.id}`,
  });
});

app.get("/api/sessions", (req, res) => {
  const list = Array.from(sessions.values()).map((s) => ({
    id: s.id,
    title: s.title,
    createdAt: s.createdAt,
    endedAt: s.endedAt,
    meetingType: s.meetingTypeSelected,
  }));
  res.json({ sessions: list });
});

app.get("/api/sessions/:id/metrics", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "not found" });
  return res.json(session.metrics);
});

app.post("/api/sessions/:id/metrics", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "not found" });

  const payload = req.body;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid payload." });
  }

  const requiredFields = ["emotion", "identity", "deepfake"];
  const missing = requiredFields.filter((field) => !payload[field]);
  if (missing.length > 0) {
    return res.status(400).json({
      error: `Missing required fields: ${missing.join(", ")}`,
    });
  }

  session.metrics = {
    ...deriveMetrics(payload),
    timestamp: payload.timestamp ?? makeIso(),
    source: "external",
  };
  session.source = "external";

  broadcastToSession(session.id, { type: "metrics", data: session.metrics });
  return res.json({ status: "ok", storedAt: session.metrics.timestamp });
});

app.post("/api/sessions/:id/stop", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "not found" });

  session.endedAt = makeIso();
  session.stt?.end?.();
  session.stt = null;

  return res.json({ ok: true, endedAt: session.endedAt });
});

app.get("/api/metrics", (req, res) => {
  if (latestSessionId && sessions.has(latestSessionId)) {
    return res.json(sessions.get(latestSessionId).metrics);
  }
  return res.json(generateSimulatedMetrics());
});

app.post("/api/metrics", (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid payload." });
  }

  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : null;

  const requiredFields = ["emotion", "identity", "deepfake"];
  const missing = requiredFields.filter((field) => !payload[field]);
  if (missing.length > 0) {
    return res.status(400).json({
      error: `Missing required fields: ${missing.join(", ")}`,
    });
  }

  // Backwards-compat: update a specific session if provided.
  const session =
    (sessionId && sessions.get(sessionId)) ||
    (latestSessionId && sessions.get(latestSessionId)) ||
    createSession({ title: "Implicit session", meetingType: "business" });

  session.metrics = {
    ...deriveMetrics(payload),
    timestamp: payload.timestamp ?? makeIso(),
    source: "external",
  };
  session.source = "external";

  broadcastToSession(session.id, { type: "metrics", data: session.metrics });
  return res.json({ status: "ok", storedAt: session.metrics.timestamp });
});

server.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
