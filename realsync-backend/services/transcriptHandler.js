const { analyzeText } = require("../lib/aiClient");
const { generateSuggestions } = require("../lib/suggestions");
const { detectMeetingType } = require("../lib/meetingTypeDetector");
const { getRecommendation } = require("../lib/recommendations");
const persistence = require("../lib/persistence");
const log = require("../lib/logger");
const { broadcastToSession, makeIso, toFixedNumber } = require("./sessionManager");

const BEHAVIORAL_ANALYSIS_INTERVAL_MS = 15_000;

/**
 * Handle an incoming transcript event (final or interim) for a session.
 * Updates in-memory state, persists final lines, generates suggestions,
 * runs fraud/behavioral detection, and broadcasts to subscribers.
 */
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

module.exports = { handleTranscript };
