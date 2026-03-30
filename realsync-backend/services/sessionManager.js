const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws");
const { MEETING_TYPES } = require("../lib/suggestions");
const { AlertFusionEngine } = require("../lib/alertFusion");
const { FraudDetector } = require("../lib/fraudDetector");
const persistence = require("../lib/persistence");
const log = require("../lib/logger");
const { EMOTIONS } = require("../lib/constants");

/* ------------------------------------------------------------------ */
/*  Utility helpers                                                     */
/* ------------------------------------------------------------------ */

const makeIso = () => new Date().toISOString();

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toFixedNumber = (value, digits = 4) =>
  Number.parseFloat(value.toFixed(digits));

/* ------------------------------------------------------------------ */
/*  In-memory session store                                             */
/* ------------------------------------------------------------------ */

const sessions = new Map();

/* ------------------------------------------------------------------ */
/*  Simulated metrics generator                                         */
/* ------------------------------------------------------------------ */

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
/*  Metrics derivation                                                  */
/* ------------------------------------------------------------------ */

const deriveMetrics = (payload) => {
  const emotionLabel =
    typeof payload?.emotion?.label === "string" && EMOTIONS.includes(payload.emotion.label)
      ? payload.emotion.label
      : "Neutral";
  const emotionConfidence =
    typeof payload?.emotion?.confidence === "number" ? payload.emotion.confidence : 0.5;
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
    video: typeof rawLayers.video === "number" ? rawLayers.video : authenticityScore,
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
    emotion: {
      ...(payload.emotion ?? {}),
      label: emotionLabel,
      confidence: toFixedNumber(emotionConfidence),
      scores: emotionScores,
    },
    deepfake: payload.deepfake ?? {},
    confidenceLayers,
    trustScore: toFixedNumber(trustScore),
    faces: payload.faces ?? [],
    identity: payload.identity ?? {},
    timestamp: payload.timestamp ?? new Date().toISOString(),
    processedAt: payload.processedAt ?? null,
  };
};

/* ------------------------------------------------------------------ */
/*  Session factory                                                     */
/* ------------------------------------------------------------------ */

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
    // Active speaker tracking
    botDisplayName: "RealSync Bot",
    lastActiveSpeaker: null,
  };

  sessions.set(id, session);

  // Persist to Supabase (non-blocking)
  persistence.createSession({ id, title: session.title, meetingType: session.meetingTypeSelected, userId, meetingUrl }).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });

  return session;
};

/* ------------------------------------------------------------------ */
/*  Session lookup                                                      */
/* ------------------------------------------------------------------ */

const getSession = (sessionId) => (sessionId ? sessions.get(sessionId) : null);

/* ------------------------------------------------------------------ */
/*  Lazy session rehydration (Bug #5)                                   */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Broadcast helper                                                    */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Helper: most recently created active session for a user            */
/* ------------------------------------------------------------------ */

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

module.exports = {
  sessions,
  makeIso,
  clamp,
  toFixedNumber,
  generateSimulatedMetrics,
  deriveMetrics,
  createSession,
  getSession,
  rehydrateSession,
  broadcastToSession,
  getLatestSessionForUser,
};
