const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const http = require("http");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const { execFileSync } = require("child_process");
require("dotenv").config();

// Production startup guard — refuse to start without Supabase in production
if (process.env.NODE_ENV === "production" && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)) {
  console.error("FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY are required in production. Exiting.");
  process.exit(1);
}

const { createSttStream } = require("./lib/gcpStt");
const { MEETING_TYPES, generateSuggestions } = require("./lib/suggestions");
const { analyzeFrame, analyzeAudio, analyzeText, checkHealth: checkAiHealth, clearSession: clearAiSession } = require("./lib/aiClient");
const { AlertFusionEngine } = require("./lib/alertFusion");
const { FraudDetector } = require("./lib/fraudDetector");
const persistence = require("./lib/persistence");
const { detectMeetingType } = require("./lib/meetingTypeDetector");
const botManager = require("./bot/botManager");
const { authenticate, authenticateWsToken, requireSessionOwner } = require("./lib/auth");
const { getRecommendation } = require("./lib/recommendations");
const log = require("./lib/logger");
const { EMOTIONS } = require("./lib/constants");

/* ------------------------------------------------------------------ */
/*  Stale bot cleanup on startup (Bug #10)                             */
/* ------------------------------------------------------------------ */
// Kill orphaned Chromium processes from previous runs (handles kill -9 case)
try {
  const pgrepOut = execFileSync("pgrep", ["-f", "chromium.*--remote-debugging"], {
    encoding: "utf-8",
    timeout: 5000,
  }).trim();
  if (pgrepOut) {
    const pids = pgrepOut.split("\n").filter(Boolean);
    log.info("startup", `Found ${pids.length} orphaned Chromium process(es) — cleaning up`);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGTERM");
      } catch {
        // Process may have already exited
      }
    }
  }
} catch {
  // pgrep not available or no processes found — safe to ignore
}

const app = express();

// Security headers
app.use(helmet());

// CORS — supports comma-separated ALLOWED_ORIGIN for multiple origins
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS: origin not allowed"));
    }
  },
  credentials: true,
}));

// Rate limiting on API routes: 100 requests per minute per IP (global safety net)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", apiLimiter);

// Per-route rate limiters for sensitive endpoints
const sessionCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many session creation requests." },
});

const settingsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many settings requests." },
});

const notificationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many notification requests." },
});

app.use(express.json({ limit: "2mb" }));
app.use(authenticate);

const PORT = process.env.PORT || 4000;

const BEHAVIORAL_ANALYSIS_INTERVAL_MS = 15_000;
const MAX_AUDIO_BUFFER_CHUNKS = 128;
const AUDIO_ANALYSIS_INTERVAL_MS = 4_000;
const AUDIO_DEEPFAKE_ENABLED = process.env.AUDIO_DEEPFAKE_ENABLED === "true";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toFixedNumber = (value, digits = 4) =>
  Number.parseFloat(value.toFixed(digits));

let broadcastInterval = null;

const sessions = new Map();

/**
 * Find the most recently created active session belonging to a specific user.
 * Returns the session object or null if none found.
 */
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

const makeIso = () => new Date().toISOString();

function combineAudioChunks(chunks) {
  return Buffer.concat(chunks.map(b64 => Buffer.from(b64, "base64"))).toString("base64");
}

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

  const rawLayers = payload.confidenceLayers ?? {};
  const confidenceLayers = {
    audio: typeof rawLayers.audio === "number" ? rawLayers.audio : null,
    video: typeof rawLayers.video === "number" ? rawLayers.video : clamp(1 - embeddingShift, 0, 1),
    behavior: typeof rawLayers.behavior === "number" ? rawLayers.behavior : clamp(0.5 + emotionConfidence * 0.5, 0, 1),
  };

  let trustScore;
  if (typeof payload.trustScore === "number") {
    trustScore = payload.trustScore;
  } else {
    // Average only available signals (audio may be null)
    const signals = [authenticityScore, confidenceLayers.video, confidenceLayers.behavior];
    if (typeof confidenceLayers.audio === "number") signals.push(confidenceLayers.audio);
    trustScore = clamp(signals.reduce((s, v) => s + v, 0) / signals.length, 0, 1);
  }

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

const createSession = ({ title, meetingType, meetingUrl = null, userId = null }) => {
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
    // Audio analysis accumulation state
    audioAnalysisBuffer: [],
    audioAnalysisInFlight: false,
    lastAudioAnalysisAt: 0,
    audioAuthenticityScore: null,
    lastBehavioralAnalysisAt: 0,
    // Per-session alert fusion engine and fraud detector
    alertFusion: new AlertFusionEngine(),
    fraudDetector: new FraudDetector(),
    // Bot state
    botStatus: "idle", // idle | joining | connected | disconnected
    botStreams: { audio: false, video: false, captions: false },
    // Alert history (in-memory, also persisted to Supabase)
    alerts: [],
    // Participant registry: faceId → { name, firstSeen }
    participants: new Map(),
  };

  sessions.set(id, session);

  // Persist to Supabase (non-blocking)
  persistence.createSession({ id, title: session.title, meetingType: session.meetingTypeSelected, userId, meetingUrl }).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });

  return session;
};

const getSession = (sessionId) => (sessionId ? sessions.get(sessionId) : null);

/**
 * Lazy session rehydration (Bug #5): If a session isn't in memory but exists
 * in Supabase, rebuild it with default runtime state so the client can reconnect.
 */
/** Cache of in-flight rehydration promises to prevent TOCTOU races. */
const _rehydrating = new Map();

async function rehydrateSession(sessionId) {
  if (!sessionId || sessions.has(sessionId)) return sessions.get(sessionId);

  // Serialize concurrent callers for the same session
  if (_rehydrating.has(sessionId)) return _rehydrating.get(sessionId);

  const promise = _rehydrateSessionInner(sessionId);
  _rehydrating.set(sessionId, promise);
  try {
    return await promise;
  } finally {
    _rehydrating.delete(sessionId);
  }
}

async function _rehydrateSessionInner(sessionId) {
  // Double-check after acquiring the "lock"
  if (sessions.has(sessionId)) return sessions.get(sessionId);

  const dbSession = await persistence.getSessionById(sessionId);
  if (!dbSession || dbSession.ended_at) return null; // Don't rehydrate ended sessions

  const session = {
    id: dbSession.id,
    userId: dbSession.user_id,
    title: dbSession.title || "Untitled session",
    createdAt: dbSession.created_at,
    endedAt: dbSession.ended_at || null,
    meetingTypeSelected: dbSession.meeting_type || "business",
    meetingTypeManual: dbSession.meeting_type || null,
    meetingTypeAuto: { label: null, confidence: 0, scores: null },
    meetingUrl: dbSession.meeting_url || null,
    metrics: generateSimulatedMetrics(),
    source: "simulated",
    subscribers: new Set(),
    frameSnapshotCounter: 0,
    suggestionState: { fired: new Map(), lastMeetingTypeNoticeAt: 0 },
    transcriptState: { interim: "", lines: [] },
    stt: null,
    audioAnalysisBuffer: [],
    audioAnalysisInFlight: false,
    lastAudioAnalysisAt: 0,
    audioAuthenticityScore: null,
    lastBehavioralAnalysisAt: 0,
    alertFusion: new AlertFusionEngine(),
    fraudDetector: new FraudDetector(),
    botStatus: dbSession.bot_status || "idle",
    botStreams: { audio: false, video: false, captions: false },
    alerts: [],
    participants: new Map(),
  };

  sessions.set(sessionId, session);
  log.info("rehydrate", `Rehydrated session ${sessionId} from Supabase`);
  return session;
}

const broadcastToSession = (sessionId, message) => {
  const session = getSession(sessionId);
  if (!session) return;

  const payload = JSON.stringify({ sessionId, ...message });
  session.subscribers.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch {
        // Connection died between readyState check and send — safe to ignore
      }
    }
  });
};

const server = http.createServer(app);
const wssSubscribe = new WebSocket.Server({ server, path: "/ws", maxPayload: 256 * 1024 });
const wssIngest = new WebSocket.Server({ server, path: "/ws/ingest", maxPayload: 2 * 1024 * 1024 });

wssSubscribe.on("connection", async (socket, req) => {
  const url = new URL(req.url, "http://localhost");
  const sessionId = url.searchParams.get("sessionId") || null;

  // Try in-memory first, then lazy rehydrate from Supabase (Bug #5)
  let session = sessionId ? getSession(sessionId) : null;
  if (!session && sessionId) {
    session = await rehydrateSession(sessionId);
  }
  if (!session) {
    socket.send(JSON.stringify({ type: "error", message: "Session not found" }));
    socket.close(4004, "Session not found");
    return;
  }

  const addSubscriber = () => {
    session.subscribers.add(socket);
    socket.send(
      JSON.stringify({
        type: "metrics",
        sessionId: session.id,
        data: session.metrics,
      })
    );
    // Send current bot status so late-connecting clients get the right state
    if (session.botStatus && session.botStatus !== "idle") {
      socket.send(
        JSON.stringify({
          type: "sourceStatus",
          sessionId: session.id,
          status: session.botStatus,
          streams: session.botStreams || { audio: false, video: false, captions: false },
          ts: makeIso(),
        })
      );
    }
    // Push current participant list to newly connected subscriber
    if (session.participants && session.participants.size > 0) {
      const participantList = Array.from(session.participants.entries()).map(
        ([faceId, data]) => ({ faceId, name: data.name, firstSeen: data.firstSeen })
      );
      socket.send(JSON.stringify({ type: "participants", sessionId: session.id, participants: participantList, ts: makeIso() }));
    }

    // C3: Respond to client-side ping keepalive messages
    // WS rate limiting: max 60 messages per minute per connection
    let wsMsgCount = 0;
    const wsRateLimitInterval = setInterval(() => { wsMsgCount = 0; }, 60_000);
    socket.on("message", (raw) => {
      wsMsgCount++;
      if (wsMsgCount > 60) {
        socket.close(4029, "Rate limit exceeded");
        clearInterval(wsRateLimitInterval);
        return;
      }
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "ping") {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "pong" }));
          }
        }
      } catch {
        // ignore non-JSON or malformed messages
      }
    });

    socket.on("close", () => {
      clearInterval(wsRateLimitInterval);
      session.subscribers.delete(socket);
    });
  };

  // If session does not require auth, subscribe immediately
  if (!session.userId) {
    addSubscriber();
    return;
  }

  // Session requires auth — accept token from first WS message (not URL params)
  const authTimeout = setTimeout(() => {
    socket.close(4003, "Auth timeout");
  }, 10000);

  socket.once("message", async (raw) => {
    clearTimeout(authTimeout);
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "auth" && msg.token) {
        const wsUserId = await authenticateWsToken(msg.token);
        if (wsUserId && wsUserId === session.userId) {
          if (socket.readyState === WebSocket.OPEN) {
            addSubscriber();
          }
          return;
        }
      }
    } catch {
      // ignore parse errors
    }
    socket.close(4003, "Access denied");
  });
});

const handleTranscript = (session, transcript) => {
  const { text, isFinal, confidence, ts, speaker } = transcript;

  if (session.endedAt) return;

  if (isFinal) {
    session.transcriptState.lines.push({ text, ts, confidence, speaker });
    // M17: Cap in-memory transcript lines to prevent unbounded growth
    if (session.transcriptState.lines.length >= 2000) {
      session.transcriptState.lines = session.transcriptState.lines.slice(-2000);
    }
    session.transcriptState.interim = "";

    // Persist to Supabase (non-blocking)
    persistence.insertTranscriptLine(session.id, { text, isFinal, confidence, ts, speaker }).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });
  } else {
    session.transcriptState.interim = text;
  }

  // Auto-detect meeting type using enhanced 3-channel detector
  const typeResult = detectMeetingType(session);
  session.meetingTypeAuto = typeResult;

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
    speaker: speaker || null,
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
    // Persist suggestion (non-blocking)
    persistence.insertSuggestion(session.id, suggestion).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });
  });

  // Fraud/scam detection on final transcript lines
  if (isFinal && session.fraudDetector) {
    const fraudAlerts = session.fraudDetector.evaluate(text, session.metrics);
    // Fuse with visual state (escalate if deepfake risk is elevated)
    const fusedAlerts = session.alertFusion.fuseWithTranscript(session, fraudAlerts);

    fusedAlerts.forEach((alert) => {
      alert.recommendation = getRecommendation(alert.category, alert.severity);
      session.alerts.push(alert);
      if (session.alerts.length > 500) session.alerts.shift();
      broadcastToSession(session.id, { type: "alert", ...alert });
      persistence.insertAlert(session.id, alert).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });
    });
  }

  // Behavioral text analysis (DeBERTa) — throttled to every 15 seconds
  if (
    isFinal &&
    Date.now() - (session.lastBehavioralAnalysisAt || 0) >= BEHAVIORAL_ANALYSIS_INTERVAL_MS
  ) {
    session.lastBehavioralAnalysisAt = Date.now();
    // Collect 60-second text window from recent transcript lines
    const windowMs = 60000;
    const cutoff = Date.now() - windowMs;
    const recentText = (session.transcriptState?.lines || [])
      .filter(l => new Date(l.ts).getTime() > cutoff)
      .map(l => l.text)
      .join(" ");

    if (recentText.length > 20) {
      analyzeText({ sessionId: session.id, text: recentText })
        .then((res) => {
          if (res?.behavioral?.signals?.length > 0) {
            const behavioralAlerts = session.fraudDetector.evaluateBehavioral(
              res.behavioral,
              session.metrics
            );
            const fused = session.alertFusion.fuseWithTranscript(session, behavioralAlerts);
            for (const ba of fused) {
              ba.recommendation = getRecommendation(ba.category, ba.severity);
              session.alerts.push(ba);
              if (session.alerts.length > 500) session.alerts.shift();
              broadcastToSession(session.id, { type: "alert", ...ba });
              persistence.insertAlert(session.id, ba).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });
            }
          }
        })
        .catch((err) => {
          log.error("server", `behavioral-analysis error: ${err.message}`);
        });
    }
  }

  // Meeting type mismatch notice (low severity) if auto confidence is strong.
  const now = Date.now();
  if (
    typeResult.confidence >= 0.75 &&
    typeResult.label &&
    typeResult.label !== session.meetingTypeSelected &&
    now - session.suggestionState.lastMeetingTypeNoticeAt > 120_000
  ) {
    session.suggestionState.lastMeetingTypeNoticeAt = now;
    broadcastToSession(session.id, {
      type: "suggestion",
      severity: "low",
      title: "Meeting Type Check",
      message: `Transcript sounds more like a ${typeResult.label} meeting (detected via ${typeResult.source}). Confirm meeting type if needed.`,
      ts: makeIso(),
    });
  }
};

wssIngest.on("connection", async (socket, req) => {
  const url = new URL(req.url, "http://localhost");
  const sessionId = url.searchParams.get("sessionId");
  const session = getSession(sessionId);

  if (!session) {
    socket.close(1008, "Unknown session");
    return;
  }

  // M13: Reuse already-parsed URL instead of parsing again
  const ingestToken = url.searchParams.get("token");
  if (session.userId) {
    const wsUserId = await authenticateWsToken(ingestToken);
    if (!wsUserId || wsUserId !== session.userId) {
      socket.close(4003, "Access denied");
      return;
    }
  }

  // B4: Reject second ingest socket if one is already OPEN for this session
  if (session._ingestSocket && session._ingestSocket.readyState === WebSocket.OPEN) {
    socket.close(4009, "Ingest socket already connected");
    return;
  }
  session._ingestSocket = socket;
  socket.on("close", () => {
    if (session._ingestSocket === socket) session._ingestSocket = null;
  });

  // Ingest WS rate limiting: max 500 messages per 10-second window
  let ingestMsgCount = 0;
  const ingestRateLimitInterval = setInterval(() => { ingestMsgCount = 0; }, 10_000);
  socket.on("close", () => { clearInterval(ingestRateLimitInterval); });

  socket.on("message", (raw) => {
    ingestMsgCount++;
    if (ingestMsgCount > 500) {
      log.warn("ws-ingest", `Rate limit exceeded for session ${sessionId}`);
      return; // Silently drop excess messages (don't close — bot recovery is expensive)
    }

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
      if (message.sampleRate !== 16000 || message.channels !== 1) {
        return;
      }

      if (!session.stt) {
        session.stt = createSttStream({
          onTranscript: (t) => handleTranscript(session, t),
          onError: (err) => {
            log.warn("stt", `STT error for session ${session.id}: ${err?.message ?? err}`);
          },
        });
      }

      const dataB64 = message.dataB64;
      if (typeof dataB64 !== "string" || !dataB64) return;

      const audioBuffer = Buffer.from(dataB64, "base64");
      session.stt.write(audioBuffer);

      // Accumulate audio for AI deepfake analysis (H3: cap buffer at 128 chunks)
      session.audioAnalysisBuffer.push(dataB64);
      if (session.audioAnalysisBuffer.length > MAX_AUDIO_BUFFER_CHUNKS) session.audioAnalysisBuffer.shift();
      const now = Date.now();
      if (
        AUDIO_DEEPFAKE_ENABLED &&
        !session.audioAnalysisInFlight &&
        session.audioAnalysisBuffer.length >= 8 &&
        now - session.lastAudioAnalysisAt >= AUDIO_ANALYSIS_INTERVAL_MS
      ) {
        session.audioAnalysisInFlight = true;
        // 7.12: Only splice 8 chunks at a time to prevent silent data loss
        // when audio accumulates faster than analysis can process it.
        const chunks = session.audioAnalysisBuffer.splice(0, 8);
        session.lastAudioAnalysisAt = now;
        analyzeAudio({ sessionId: session.id, audioB64: combineAudioChunks(chunks), durationMs: 4000 })
          .then((res) => {
            session.audioAnalysisInFlight = false;
            if (res?.audio?.authenticityScore != null) {
              session.audioAuthenticityScore = res.audio.authenticityScore;
              if (session.metrics) {
                session.metrics.confidenceLayers = session.metrics.confidenceLayers || {};
                session.metrics.confidenceLayers.audio = res.audio.authenticityScore;
              }
              // Fix 2: Recompute trust and broadcast so frontend sees audio updates
              if (session.metrics?.trustScore != null) {
                const behaviorConf = session.metrics.confidenceLayers?.behavior || 0.55;
                const identityShift = session.metrics.identity?.embeddingShift || 0;
                const identitySignal = 1.0 - identityShift;
                const videoSignal = session.metrics.confidenceLayers?.video ?? 0.5;
                const audioScore = res.audio.authenticityScore;
                const finalTrust = 0.35 * videoSignal + 0.25 * audioScore + 0.25 * identitySignal + 0.15 * behaviorConf;
                session.metrics.trustScore = Math.max(0, Math.min(1, parseFloat(finalTrust.toFixed(4))));
              }
              broadcastToSession(session.id, { type: "metrics", data: session.metrics });
            }
          })
          .catch((err) => {
            session.audioAnalysisInFlight = false;
            log.error("server", `audio-analysis error: ${err.message}`);
          });
      }
      return;
    }

    // Video frame: forward to AI Inference Service for analysis
    if (message.type === "frame") {
      // Reject oversized frames (>2MB base64)
      if (typeof message.dataB64 === "string" && message.dataB64.length > 2 * 1024 * 1024) {
        return;
      }
      handleFrame(session, message).catch((err) => {
        log.warn("ingest", `Frame analysis error for session ${session.id}: ${err?.message ?? err}`);
      });
      return;
    }

    // Captions from Zoom CC or similar source
    if (message.type === "caption") {
      const text = typeof message.text === "string" ? message.text : "";
      if (!text.trim()) return;
      // Reject oversized captions
      if (text.length > 1000) return;
      const speaker = typeof message.speaker === "string" ? message.speaker.trim().slice(0, 100) : "unknown";

      handleTranscript(session, {
        text,
        isFinal: true,
        confidence: 0.95, // Captions are high-confidence
        ts: message.ts || makeIso(),
        speaker,
        source: "caption",
      });
      return;
    }

    // Source status heartbeat from bot adapter
    if (message.type === "source_status") {
      session.botStatus = message.status || "connected";
      session.botStreams = message.streams || { audio: false, video: false, captions: false };

      broadcastToSession(session.id, {
        type: "sourceStatus",
        status: session.botStatus,
        streams: session.botStreams,
        ts: message.ts || makeIso(),
      });

      persistence.updateBotStatus(session.id, session.botStatus).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });
      return;
    }
  });

  socket.on("close", () => {
    // If client disconnects, keep session alive; stop STT stream to avoid leaks.
    session.stt?.end?.();
    session.stt = null;
  });
});

/* ------------------------------------------------------------------ */
/*  Frame analysis handler                                             */
/* ------------------------------------------------------------------ */

/** Throttle: max 1 frame analysis in-flight per session */
const frameInFlight = new Map(); // sessionId → boolean
/** Snapshot metrics to Supabase every Nth frame */
/** Snapshot counter is now per-session: session.frameSnapshotCounter */

async function handleFrame(session, message) {
  // H2: Don't process frames after session has ended
  if (session.endedAt) return;
  // Throttle: skip if a frame is already being analyzed for this session
  if (frameInFlight.get(session.id)) return;
  frameInFlight.set(session.id, true);

  try {
    const result = await analyzeFrame({
      sessionId: session.id,
      frameB64: message.dataB64,
      capturedAt: message.capturedAt || makeIso(),
    });
    if (!result || !result.aggregated) return;

    // Camera-off mode: must be checked BEFORE noFaceDetected, since camera-off
    // also triggers noFaceDetected but needs special audio-only trust handling.
    if (result?.aggregated?.cameraOff === true) {
      session.metrics.cameraOff = true;
      session.metrics.confidenceLayers = session.metrics.confidenceLayers || {};
      session.metrics.confidenceLayers.video = null;
      const audioScore = session.audioAuthenticityScore;
      const behaviorConf = result.aggregated.confidenceLayers?.behavior || 0.55;
      if (audioScore != null) {
        session.metrics.trustScore = parseFloat((0.60 * audioScore + 0.40 * behaviorConf).toFixed(4));
      }
      broadcastToSession(session.id, { type: "metrics", data: session.metrics });
      return;  // Skip visual alert evaluation
    }

    // When no face is detected, preserve the last good metrics
    if (result.aggregated.noFaceDetected) return;

    // Update session metrics from AI response
    session.metrics = {
      ...result.aggregated,
      timestamp: result.processedAt || makeIso(),
      source: result.source === "mock" ? "simulated" : "external",
    };
    session.source = result.source === "mock" ? "simulated" : "external";

    // H7: Broadcast moved AFTER trust recomputation (below) so clients get audio-corrected trust

    session.metrics.cameraOff = false;

    // Evaluate visual alerts — primary face (face 0 / aggregated)
    const primaryName = session.participants?.get(0)?.name || null;
    const visualAlerts = session.alertFusion.evaluateVisual(session, result, { faceId: 0, participantName: primaryName });
    visualAlerts.forEach((alert) => {
      alert.recommendation = getRecommendation(alert.category, alert.severity);
      session.alerts.push(alert);
      if (session.alerts.length > 500) session.alerts.shift();
      broadcastToSession(session.id, { type: "alert", ...alert });
      persistence.insertAlert(session.id, alert).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });
    });

    // Feature #15: Multi-face alerts — iterate non-primary faces
    const faces = Array.isArray(result.faces) ? result.faces.slice(1, 6) : []; // cap at 6 total
    for (let i = 0; i < faces.length; i++) {
      const faceId = i + 1;
      const face = faces[i];
      if (!face) continue;
      // Build a synthetic result object for this face
      const faceResult = { aggregated: face };
      const participantName = session.participants?.get(faceId)?.name || null;
      const faceAlerts = session.alertFusion.evaluateVisual(session, faceResult, { faceId, participantName });
      faceAlerts.forEach((alert) => {
        alert.recommendation = getRecommendation(alert.category, alert.severity);
        session.alerts.push(alert);
        if (session.alerts.length > 500) session.alerts.shift();
        broadcastToSession(session.id, { type: "alert", ...alert });
        persistence.insertAlert(session.id, alert).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });
      });
    }

    // Add face count to metrics for dashboard display
    const faceCount = 1 + faces.length; // primary + additional
    session.metrics.faceCount = faceCount;

    // Temporal anomaly alerts
    const temporalAlerts = session.alertFusion.evaluateTemporal(session, result);
    for (const ta of temporalAlerts) {
      ta.recommendation = getRecommendation(ta.category, ta.severity);
      session.alerts.push(ta);
      if (session.alerts.length > 500) session.alerts.shift();
      broadcastToSession(session.id, { type: "alert", ...ta });
      persistence.insertAlert(session.id, ta).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });
    }

    // Recompute trust score with audio signal if available
    if (result?.aggregated?.trustScore != null) {
      const audioScore = session.audioAuthenticityScore;
      const behaviorConf = result.aggregated.confidenceLayers?.behavior || 0.55;
      const identityShift = result.aggregated.identity?.embeddingShift || 0;
      const identitySignal = 1.0 - identityShift;

      let finalTrust;
      if (AUDIO_DEEPFAKE_ENABLED && audioScore != null) {
        // 4-signal weighted: video=0.35, audio=0.25, identity=0.25, behavior=0.15
        const videoSignal = result.aggregated.deepfake?.authenticityScore ?? 0.5;
        finalTrust = 0.35 * videoSignal + 0.25 * audioScore + 0.25 * identitySignal + 0.15 * behaviorConf;
      } else {
        // 3-signal (no audio): video=0.47, identity=0.33, behavior=0.20
        const videoSignal = result.aggregated.deepfake?.authenticityScore ?? 0.5;
        finalTrust = 0.47 * videoSignal + 0.33 * identitySignal + 0.20 * behaviorConf;
      }
      session.metrics.trustScore = Math.max(0, Math.min(1, parseFloat(finalTrust.toFixed(4))));
    }

    // H7: Broadcast metrics AFTER trust recomputation so clients get audio-corrected values
    broadcastToSession(session.id, { type: "metrics", data: session.metrics });

    // Persist metrics snapshot every 5th frame (~10s at 2fps)
    session.frameSnapshotCounter = (session.frameSnapshotCounter || 0) + 1;
    if (session.frameSnapshotCounter % 5 === 0) {
      persistence.insertMetricsSnapshot(session.id, session.metrics).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });
    }
  } finally {
    frameInFlight.set(session.id, false);
  }
}

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

app.get("/api/health", async (req, res) => {
  const checks = {};

  // Check AI service reachability
  try {
    const aiHealth = await checkAiHealth();
    checks.ai = aiHealth.ok ? "ok" : `unavailable: ${aiHealth.reason || "unknown"}`;
  } catch (err) {
    checks.ai = `error: ${err?.message ?? err}`;
  }

  // Check Supabase client exists
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

app.post("/api/sessions", sessionCreateLimiter, (req, res) => {
  const { title, meetingType, meetingUrl, scheduledAt } = req.body ?? {};
  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  if (title.length > 500) {
    return res.status(400).json({ error: "title must be 500 characters or fewer" });
  }
  if (!meetingType || typeof meetingType !== "string" || !MEETING_TYPES.includes(meetingType)) {
    return res.status(400).json({ error: `meetingType must be one of: ${MEETING_TYPES.join(", ")}` });
  }
  // Validate meeting URL is a proper HTTP(S) URL when provided
  if (meetingUrl) {
    try {
      const parsed = new URL(meetingUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return res.status(400).json({ error: "meetingUrl must be an HTTP or HTTPS URL" });
      }
    } catch {
      return res.status(400).json({ error: "meetingUrl is not a valid URL" });
    }
  }

  const session = createSession({ title, meetingType, meetingUrl: meetingUrl || null, userId: req.userId || null });

  // Store scheduledAt on session if provided (for reference)
  if (scheduledAt) {
    session.scheduledAt = scheduledAt;
  }

  return res.json({
    sessionId: session.id,
    ingestWsUrl: `/ws/ingest?sessionId=${session.id}`,
    subscribeWsUrl: `/ws?sessionId=${session.id}`,
  });
});

app.get("/api/sessions", async (req, res) => {
  // In-memory sessions (currently active)
  const allSessions = Array.from(sessions.values());
  const filtered = req.userId
    ? allSessions.filter((s) => !s.userId || s.userId === req.userId)
    : allSessions.filter((s) => !s.userId);

  const inMemoryList = filtered.map((s) => ({
    id: s.id,
    title: s.title,
    createdAt: s.createdAt,
    endedAt: s.endedAt,
    meetingType: s.meetingTypeSelected,
    meetingUrl: s.meetingUrl || null,
    scheduledAt: s.scheduledAt || null,
    botStatus: s.botStatus || "idle",
  }));

  // Bug #5: Also fetch historical sessions from Supabase so sessions
  // survive backend restarts. Merge, deduplicating by ID.
  let dbSessions = [];
  if (req.userId) {
    dbSessions = await persistence.getUserSessions(req.userId);
  }

  const inMemoryIds = new Set(inMemoryList.map((s) => s.id));
  const dbList = dbSessions
    .filter((s) => !inMemoryIds.has(s.id))
    .map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: s.created_at,
      endedAt: s.ended_at || null,
      meetingType: s.meeting_type,
      meetingUrl: s.meeting_url || null,
      scheduledAt: null,
      botStatus: s.bot_status || "idle",
    }));

  const merged = [...inMemoryList, ...dbList].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  res.json({ sessions: merged });
});

app.get("/api/sessions/:id/metrics", requireSessionOwner(getSession, rehydrateSession), (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "not found" });
  return res.json(session.metrics);
});

app.post("/api/sessions/:id/metrics", requireSessionOwner(getSession, rehydrateSession), (req, res) => {
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

app.post("/api/sessions/:id/stop", requireSessionOwner(getSession, rehydrateSession), async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "not found" });

  session.endedAt = makeIso();
  session.stt?.end?.();
  session.stt = null;
  frameInFlight.delete(session.id);

  // Stop bot if running
  botManager.stopBot(session.id);
  session.botStatus = "disconnected";

  // Clean up AI service state (identity baselines, temporal buffers) — fire-and-forget
  clearAiSession(session.id).catch((err) => {
    log.warn("ai-cleanup", `AI session cleanup failed: ${err?.message ?? err}`);
  });

  // Persist session end
  persistence.endSession(session.id).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });

  // Generate post-meeting report (non-blocking)
  persistence.generateReport(session.id).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });

  return res.json({ ok: true, endedAt: session.endedAt });
});

/** Shared ingest message processor used by both WS handler and bot callback. */
function processIngestMessage(session, message) {
  if (message.type === "frame") {
    handleFrame(session, message).catch((err) => {
      log.warn("ingest", `Frame analysis error for session ${session.id}: ${err?.message ?? err}`);
    });
  } else if (message.type === "caption") {
    const text = typeof message.text === "string" ? message.text : "";
    if (!text.trim() || text.length > 1000) return;
    const speaker = typeof message.speaker === "string" ? message.speaker.trim().slice(0, 100) : "unknown";
    handleTranscript(session, {
      text,
      isFinal: true,
      confidence: 0.95,
      ts: message.ts || makeIso(),
      speaker,
      source: "caption",
    });
  } else if (message.type === "source_status") {
    session.botStatus = message.status || "connected";
    session.botStreams = message.streams || {};
    broadcastToSession(session.id, {
      type: "sourceStatus",
      status: session.botStatus,
      streams: session.botStreams,
      ts: message.ts || makeIso(),
    });
    persistence.updateBotStatus(session.id, session.botStatus).catch((err) => {
      log.warn("persistence", `updateBotStatus failed: ${err?.message ?? err}`);
    });
  } else if (message.type === "participants") {
    // Feature #16: Participant names from bot's panel scraper
    const rawNames = message.names;
    if (!Array.isArray(rawNames)) return;
    const names = rawNames
      .slice(0, 20)
      .filter((n) => typeof n === "string" && n.trim().length > 0)
      .map((n) => n.trim().slice(0, 100));
    if (names.length === 0) return;

    const now = makeIso();
    names.forEach((name, index) => {
      const existing = session.participants.get(index);
      session.participants.set(index, { name, firstSeen: existing?.firstSeen || now });
    });

    const participantList = Array.from(session.participants.entries()).map(
      ([faceId, data]) => ({ faceId, name: data.name, firstSeen: data.firstSeen })
    );
    broadcastToSession(session.id, { type: "participants", participants: participantList, ts: now });
  } else if (message.type === "audio_pcm") {
    if (!session.stt) {
      session.stt = createSttStream({
        onTranscript: (t) => handleTranscript(session, t),
        onError: (err) => {
          log.warn("stt", `STT error for session ${session.id}: ${err?.message ?? err}`);
        },
      });
    }
    const dataB64 = message.dataB64;
    if (typeof dataB64 === "string" && dataB64) {
      session.stt.write(Buffer.from(dataB64, "base64"));

      // Accumulate audio for AI deepfake analysis (mirrors WS ingest handler)
      session.audioAnalysisBuffer.push(dataB64);
      if (session.audioAnalysisBuffer.length > MAX_AUDIO_BUFFER_CHUNKS) session.audioAnalysisBuffer.shift();
      const now = Date.now();
      if (
        AUDIO_DEEPFAKE_ENABLED &&
        !session.audioAnalysisInFlight &&
        session.audioAnalysisBuffer.length >= 8 &&
        now - session.lastAudioAnalysisAt >= AUDIO_ANALYSIS_INTERVAL_MS
      ) {
        session.audioAnalysisInFlight = true;
        // 7.12: Only splice 8 chunks at a time to prevent silent data loss
        // when audio accumulates faster than analysis can process it.
        const chunks = session.audioAnalysisBuffer.splice(0, 8);
        session.lastAudioAnalysisAt = now;
        analyzeAudio({ sessionId: session.id, audioB64: combineAudioChunks(chunks), durationMs: 4000 })
          .then((res) => {
            session.audioAnalysisInFlight = false;
            if (res?.audio?.authenticityScore != null) {
              session.audioAuthenticityScore = res.audio.authenticityScore;
              if (session.metrics) {
                session.metrics.confidenceLayers = session.metrics.confidenceLayers || {};
                session.metrics.confidenceLayers.audio = res.audio.authenticityScore;
              }
              // Recompute trust and broadcast for audio-via-REST path
              if (session.metrics?.trustScore != null) {
                const behaviorConf = session.metrics.confidenceLayers?.behavior || 0.55;
                const identityShift = session.metrics.identity?.embeddingShift || 0;
                const identitySignal = 1.0 - identityShift;
                const videoSignal = session.metrics.confidenceLayers?.video ?? 0.5;
                const audioScore = res.audio.authenticityScore;
                const finalTrust = 0.35 * videoSignal + 0.25 * audioScore + 0.25 * identitySignal + 0.15 * behaviorConf;
                session.metrics.trustScore = Math.max(0, Math.min(1, parseFloat(finalTrust.toFixed(4))));
              }
              broadcastToSession(session.id, { type: "metrics", data: session.metrics });
            }
          })
          .catch((err) => {
            session.audioAnalysisInFlight = false;
            log.warn("audio-analysis", `Audio analysis error for session ${session.id}: ${err?.message ?? err}`);
          });
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Bot management endpoints                                           */
/* ------------------------------------------------------------------ */

app.post("/api/sessions/:id/join", requireSessionOwner(getSession, rehydrateSession), (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const { meetingUrl } = req.body ?? {};
  const displayName = typeof req.body.displayName === "string" ? req.body.displayName.trim().slice(0, 100) : "RealSync Bot";
  if (!meetingUrl || typeof meetingUrl !== "string") {
    return res.status(400).json({ error: "meetingUrl is required" });
  }

  // H4: Validate URL — allow https://*.zoom.us and https://*.zoom.com
  try {
    const u = new URL(meetingUrl);
    const isZoom = u.hostname.endsWith(".zoom.us") || u.hostname.endsWith(".zoom.com")
      || u.hostname === "zoom.us" || u.hostname === "zoom.com";
    if (u.protocol !== "https:" || !isZoom) throw new Error("Not a Zoom URL");
  } catch {
    return res.status(400).json({ error: "meetingUrl must be a valid Zoom URL (https://...zoom.us or zoom.com)" });
  }

  session.meetingUrl = meetingUrl;
  session.botStatus = "joining";

  const result = botManager.startBot({
    sessionId: session.id,
    meetingUrl,
    displayName: displayName || "RealSync Bot",
    onIngestMessage: (message) => {
      processIngestMessage(session, message);
    },
  });

  // Broadcast joining status to any connected subscribers
  broadcastToSession(session.id, {
    type: "sourceStatus",
    status: "joining",
    streams: { audio: false, video: false, captions: false },
    ts: makeIso(),
  });

  return res.json({
    status: result.status,
    botId: result.botId,
    sessionId: session.id,
  });
});

app.post("/api/sessions/:id/leave", requireSessionOwner(getSession, rehydrateSession), (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const result = botManager.stopBot(session.id, (message) => {
    if (message.type === "source_status") {
      session.botStatus = message.status;
      session.botStreams = message.streams || {};
      broadcastToSession(session.id, {
        type: "sourceStatus",
        status: session.botStatus,
        streams: session.botStreams,
        ts: message.ts || makeIso(),
      });
    }
  });

  session.botStatus = "disconnected";
  return res.json({ ok: result.ok, sessionId: session.id });
});

/* ------------------------------------------------------------------ */
/*  Data retrieval endpoints                                           */
/* ------------------------------------------------------------------ */

app.get("/api/sessions/:id/alerts", requireSessionOwner(getSession, rehydrateSession), async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  // Try Supabase first, fall back to in-memory
  const persisted = await persistence.getSessionAlerts(session.id);
  if (persisted && persisted.length > 0) {
    // Normalize DB rows: Supabase returns `id`, frontend expects `alertId`
    const normalized = persisted.map((a) => ({ ...a, alertId: a.alertId || a.id }));
    return res.json({ alerts: normalized });
  }
  return res.json({ alerts: session.alerts || [] });
});

app.get("/api/sessions/:id/transcript", requireSessionOwner(getSession, rehydrateSession), async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  // Try Supabase first, fall back to in-memory
  const persisted = await persistence.getSessionTranscript(session.id);
  if (persisted && persisted.length > 0) {
    return res.json({ lines: persisted });
  }
  return res.json({ lines: session.transcriptState?.lines || [] });
});

app.get("/api/sessions/:id/report", requireSessionOwner(getSession, rehydrateSession), async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  // Check Supabase for existing report
  let report = await persistence.getSessionReport(session.id);

  // Validate the report has full data (severityBreakdown etc.)
  const hasFullReport = report?.summary?.severityBreakdown;

  if (!hasFullReport) {
    // Build from in-memory data (always authoritative while session is in memory)
    const sessionAlerts = session.alerts || [];
    report = {
      summary: {
        sessionId: session.id,
        title: session.title,
        meetingType: session.meetingTypeSelected,
        createdAt: session.createdAt,
        endedAt: session.endedAt,
        totalAlerts: sessionAlerts.length,
        totalTranscriptLines: (session.transcriptState?.lines || []).length,
        severityBreakdown: {
          low: sessionAlerts.filter((a) => a.severity === "low").length,
          medium: sessionAlerts.filter((a) => a.severity === "medium").length,
          high: sessionAlerts.filter((a) => a.severity === "high").length,
          critical: sessionAlerts.filter((a) => a.severity === "critical").length,
        },
        generatedAt: makeIso(),
      },
    };
  }

  return res.json(report);
});

/* ------------------------------------------------------------------ */
/*  Notification endpoints                                             */
/* ------------------------------------------------------------------ */

app.get("/api/notifications", async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const result = await persistence.getUserNotifications(req.userId, { limit, offset });
  return res.json(result);
});

app.get("/api/notifications/unread-count", async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const count = await persistence.getUnreadNotificationCount(req.userId);
  return res.json({ unreadCount: count });
});

app.post("/api/notifications/read", notificationLimiter, async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { alertIds, all } = req.body ?? {};

  if (all === true) {
    const result = await persistence.markAllNotificationsRead(req.userId);
    return res.json({ ok: result.ok });
  }

  if (!Array.isArray(alertIds) || alertIds.length === 0) {
    return res.status(400).json({ error: "alertIds array or all:true is required" });
  }

  // H5: Bound alertIds array size
  if (alertIds.length > 100) {
    return res.status(400).json({ error: "alertIds max 100" });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const valid = alertIds.every((id) => typeof id === "string" && uuidRegex.test(id));
  if (!valid) {
    return res.status(400).json({ error: "alertIds must be valid UUIDs" });
  }

  const result = await persistence.markNotificationsRead(req.userId, alertIds);
  return res.json({ ok: result.ok });
});

/* ------------------------------------------------------------------ */
/*  Detection settings                                                 */
/* ------------------------------------------------------------------ */

app.get("/api/settings", async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const settings = await persistence.getDetectionSettings(req.userId);
  return res.json(settings);
});

app.patch("/api/settings", settingsLimiter, async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Request body must be a JSON object" });
  }
  // Schema validation: only allow known boolean detection settings
  const allowedKeys = ["facialAnalysis", "voicePattern", "emotionDetection"];
  const bodyKeys = Object.keys(body);
  if (bodyKeys.length > 10) {
    return res.status(400).json({ error: "Too many fields" });
  }
  for (const key of bodyKeys) {
    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ error: `Unknown setting: ${key}` });
    }
    if (typeof body[key] !== "boolean") {
      return res.status(400).json({ error: `${key} must be a boolean` });
    }
  }
  const result = await persistence.updateDetectionSettings(req.userId, body);
  if (!result.ok) {
    return res.status(500).json({ error: result.error || "Failed to save settings" });
  }
  const updated = await persistence.getDetectionSettings(req.userId);
  return res.json(updated);
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

app.post("/api/metrics", (req, res) => {
  // H1: Require authentication
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

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

  // Backwards-compat: update a specific session if provided, else use latest for this user.
  const session =
    (sessionId && sessions.get(sessionId)) ||
    getLatestSessionForUser(req.userId);

  if (!session) {
    return res.status(404).json({ error: "No active session. Create one first via POST /api/sessions." });
  }

  // Verify ownership — always check, no null-bypass
  if (session.userId !== req.userId) {
    return res.status(403).json({ error: "Access denied" });
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

// Global error handler (Express 5 requires 4-arg signature)
app.use((err, req, res, _next) => {
  log.error("server", `Unhandled error: ${err?.message ?? err}`);
  res.status(500).json({ error: "Internal server error" });
});

server.listen(PORT, () => {
  log.info("server", `Backend listening on port ${PORT}`);
});

/* ------------------------------------------------------------------ */
/*  WebSocket keepalive — ping/pong heartbeat (C3)                     */
/* ------------------------------------------------------------------ */

const WS_PING_INTERVAL_MS = 30_000; // 30 seconds

function setupWsPingPong(wss, label) {
  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });
  });

  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        log.debug("ws-keepalive", `Terminating dead ${label} connection`);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, WS_PING_INTERVAL_MS);
}

setupWsPingPong(wssSubscribe, "subscribe");
setupWsPingPong(wssIngest, "ingest");

/* ------------------------------------------------------------------ */
/*  Session garbage collection                                         */
/* ------------------------------------------------------------------ */

const SESSION_GC_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const SESSION_GC_MAX_AGE_MS = 60 * 60 * 1000;  // 1 hour after ended

const sessionGcInterval = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (!session.endedAt) continue;
    const endedMs = new Date(session.endedAt).getTime();
    if (now - endedMs > SESSION_GC_MAX_AGE_MS) {
      // Clean up resources
      session.stt?.end?.();
      // Close lingering subscriber WebSocket connections before clearing
      session.subscribers.forEach((client) => {
        try { client.close(1000, "Session expired"); } catch { /* best effort */ }
      });
      session.subscribers.clear();
      frameInFlight.delete(id);
      sessions.delete(id);
      log.info("gc", `Garbage-collected session ${id}`);
    }
  }

  // Clean up orphaned frameInFlight entries for sessions that no longer exist
  for (const id of frameInFlight.keys()) {
    if (!sessions.has(id)) {
      frameInFlight.delete(id);
    }
  }
}, SESSION_GC_INTERVAL_MS);

/* ------------------------------------------------------------------ */
/*  Graceful shutdown                                                   */
/* ------------------------------------------------------------------ */

let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log.info("server", `${signal} received — shutting down gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    log.info("server", "HTTP server closed");
  });

  // Stop broadcast loop and GC
  if (broadcastInterval) clearInterval(broadcastInterval);
  clearInterval(sessionGcInterval);

  // Close all WebSocket clients
  for (const client of wssSubscribe.clients) {
    client.close(1001, "Server shutting down");
  }
  for (const client of wssIngest.clients) {
    client.close(1001, "Server shutting down");
  }

  // End all STT streams and clean up bots
  for (const [, session] of sessions) {
    session.stt?.end?.();
    session.stt = null;
  }
  botManager.cleanupAll?.();

  // Force exit after 10s if cleanup hasn't finished
  setTimeout(() => {
    log.warn("server", "Forced exit after 10s timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  log.error("uncaught", `Uncaught exception: ${err.message}`, { stack: err.stack });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  log.error("unhandled-rejection", `Unhandled rejection: ${reason}`, { stack: reason?.stack });
});
