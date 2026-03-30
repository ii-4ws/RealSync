const { analyzeFrame } = require("../lib/aiClient");
const { getRecommendation } = require("../lib/recommendations");
const persistence = require("../lib/persistence");
const log = require("../lib/logger");
const { broadcastToSession, makeIso } = require("./sessionManager");

/* ------------------------------------------------------------------ */
/*  Frame analysis handler                                             */
/* ------------------------------------------------------------------ */

/** Throttle: max 1 frame analysis in-flight per session */
const frameInFlight = new Map(); // sessionId → boolean

const AUDIO_DEEPFAKE_ENABLED = process.env.AUDIO_DEEPFAKE_ENABLED !== "false";

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
    // #10: Re-check after async gap — session may have been stopped while awaiting
    if (session.endedAt) return;
    if (!result || !result.aggregated) return;

    // Update analyzed participant before early returns so it stays current even when camera is off
    if (message.activeSpeaker) {
      session.lastActiveSpeaker = message.activeSpeaker;
    }
    const primaryName = message.activeSpeaker
      || session.lastActiveSpeaker
      || Array.from(session.participants.values())
           .find((p) => p.name !== session.botDisplayName)?.name
      || session.participants?.get(0)?.name
      || null;
    session.metrics.analyzedParticipant = primaryName;

    // Camera-off mode: must be checked BEFORE noFaceDetected, since camera-off
    // also triggers noFaceDetected but needs special audio-only trust handling.
    if (result?.aggregated?.cameraOff === true) {
      session.metrics.cameraOff = true;
      session.metrics.source = "external";
      session.source = "external";
      session.metrics.timestamp = result.processedAt || makeIso();
      session._faceRecoveryCount = 0;  // Reset hysteresis counter
      session.metrics.confidenceLayers = session.metrics.confidenceLayers || {};
      session.metrics.confidenceLayers.video = null;
      session.metrics.confidenceLayers.behavior = null;
      const audioScore = session.audioAuthenticityScore;
      if (audioScore != null) {
        session.metrics.trustScore = parseFloat((1.0 * audioScore).toFixed(4));
      }
      broadcastToSession(session.id, { type: "metrics", data: session.metrics });
      return;  // Skip visual alert evaluation
    }

    // When no face is detected (but not camera-off), keep last visual metrics
    // but update timestamp and source so dashboard stays alive
    if (result.aggregated.noFaceDetected) {
      session.metrics.source = "external";
      session.source = "external";
      session.metrics.timestamp = result.processedAt || makeIso();
      session.metrics.cameraOff = false;
      broadcastToSession(session.id, { type: "metrics", data: session.metrics });
      return;
    }

    // Update session metrics from AI response
    const isMock = result.source === "mock";
    session.metrics = {
      ...result.aggregated,
      timestamp: result.processedAt || makeIso(),
      source: isMock ? "simulated" : "external",
      analyzedParticipant: primaryName,
    };
    session.source = isMock ? "simulated" : "external";

    // Alert frontend when AI service is down (throttle to once per 30s)
    if (isMock && (!session._lastMockAlertAt || Date.now() - session._lastMockAlertAt > 30000)) {
      session._lastMockAlertAt = Date.now();
      broadcastToSession(session.id, {
        type: "alert",
        alertId: `ai-offline-${Date.now()}`,
        severity: "high",
        category: "system",
        title: "AI Service Offline",
        message: "The AI model server is unreachable. Displayed metrics are simulated and NOT real analysis. Start the AI service to get real results.",
        recommendation: "Run the AI service: cd RealSync-AI-Prototype && python -m serve.app",
        source: "system",
        ts: makeIso(),
        sessionId: session.id,
      });
    }

    // H7: Broadcast moved AFTER trust recomputation (below) so clients get audio-corrected trust

    // Hysteresis: require 3 consecutive face-frames before clearing cameraOff
    if (session.metrics.cameraOff) {
      session._faceRecoveryCount = (session._faceRecoveryCount || 0) + 1;
      if (session._faceRecoveryCount < 3) {
        // Don't flip cameraOff yet — wait for stable face detection
      } else {
        session.metrics.cameraOff = false;
        session._faceRecoveryCount = 0;
      }
    } else {
      session.metrics.cameraOff = false;
      session._faceRecoveryCount = 0;
    }

    // Evaluate visual alerts — primary face (face 0 / aggregated)
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

    // Compute face count before multi-face alert evaluation so alertFusion
    // reads the current frame's faceCount, not the previous frame's.
    const faceCount = 1 + faces.length; // primary + additional
    session.metrics.faceCount = faceCount;

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

      let finalTrust;
      if (AUDIO_DEEPFAKE_ENABLED && audioScore != null) {
        // 3-signal weighted: video=0.45, audio=0.35, behavior=0.20
        const videoSignal = result.aggregated.deepfake?.authenticityScore ?? 0.5;
        finalTrust = 0.45 * videoSignal + 0.35 * audioScore + 0.20 * behaviorConf;
        session.metrics.trustScore = Math.max(0, Math.min(1, parseFloat(finalTrust.toFixed(4))));
      } else if (result.aggregated.trustScore != null) {
        // Use AI service's pre-computed trust score directly
        session.metrics.trustScore = Math.max(0, Math.min(1, parseFloat(result.aggregated.trustScore.toFixed(4))));
      } else {
        // Fallback: 2-signal (no audio): video=0.55, behavior=0.45
        const videoSignal = result.aggregated.deepfake?.authenticityScore ?? 0.5;
        finalTrust = 0.55 * videoSignal + 0.45 * behaviorConf;
        session.metrics.trustScore = Math.max(0, Math.min(1, parseFloat(finalTrust.toFixed(4))));
      }
    }

    // H7: Broadcast metrics AFTER trust recomputation so clients get audio-corrected values
    broadcastToSession(session.id, { type: "metrics", data: session.metrics });

    // Persist metrics snapshot every 5th frame (~10s at 2fps)
    session.frameSnapshotCounter = (session.frameSnapshotCounter || 0) + 1;
    if (session.frameSnapshotCounter % 5 === 0) {
      persistence.insertMetricsSnapshot(session.id, session.metrics).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });
    }
  } finally {
    frameInFlight.delete(session.id);
  }
}

module.exports = { handleFrame, frameInFlight };
