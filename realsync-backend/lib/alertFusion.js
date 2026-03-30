/**
 * Alert Fusion Engine.
 *
 * Combines visual analysis results (deepfake, identity, emotion) with
 * transcript-based signals (fraud, scam, altercation) to produce unified
 * alert events that are broadcast to the dashboard and persisted.
 */

const { v4: uuidv4 } = require("uuid");
const log = require("./logger");

/* ------------------------------------------------------------------ */
/*  Thresholds (see FINAL_RELEASE_TECH_SPEC.md §12)                    */
/* ------------------------------------------------------------------ */

const THRESHOLDS = {
  deepfake: {
    medium: 0.70, // authenticityScore <= this → medium risk
    high: 0.40,   // authenticityScore <= this → high risk (real faces score ≥0.55 after calibration)
  },
  emotion: {
    angerMedium: 0.80, // was 0.75
    angerHigh: 0.90,   // was 0.85
  },
};

const DEFAULT_COOLDOWN_MS = 30_000; // 30 seconds between same alert type
const EVICT_AFTER_MS = 5 * 60 * 1000; // 5 minutes

/* ------------------------------------------------------------------ */
/*  Alert builder                                                      */
/* ------------------------------------------------------------------ */

function buildAlert({ severity, category, title, message, model, confidence, faceId, participantName }) {
  const alert = {
    alertId: uuidv4(),
    severity,
    category,
    title: typeof title === "string" ? title.slice(0, 200) : "Alert",
    message: typeof message === "string" ? message.slice(0, 1000) : "",
    source: { model: model || "fusion", confidence: confidence || 0 },
    ts: new Date().toISOString(),
  };
  if (faceId != null) alert.faceId = faceId;
  if (participantName) alert.participantName = participantName;
  return alert;
}

/* ------------------------------------------------------------------ */
/*  Fusion engine                                                      */
/* ------------------------------------------------------------------ */

class AlertFusionEngine {
  constructor() {
    /** @type {Map<string, number>} alertKey → last emitted timestamp */
    this.cooldowns = new Map();
    /** @type {Map<string, number>} sessionId+faceId → consecutive low-score frame count */
    this._consecutiveLow = new Map();
  }

  /**
   * Read-only cooldown check. Returns true if the key is off cooldown.
   * Also evicts stale entries when the map exceeds 200 keys to prevent
   * unbounded memory growth across long-running sessions.
   */
  _checkCooldown(key, cooldownMs = DEFAULT_COOLDOWN_MS) {
    const now = Date.now();

    // Evict stale entries periodically (every 50 entries or every check after 200)
    if (this.cooldowns.size > 50) {
      for (const [k, ts] of this.cooldowns) {
        if (now - ts > EVICT_AFTER_MS) {
          this.cooldowns.delete(k);
        }
      }
    }

    const last = this.cooldowns.get(key) || 0;
    return now - last >= cooldownMs;
  }

  /**
   * Mark a key as just emitted. Call after actually emitting an alert.
   */
  _markEmitted(key) {
    this.cooldowns.set(key, Date.now());
  }

  /**
   * Evaluate an AI analysis result and return any alerts that should fire.
   *
   * @param {object} session  - Session object (has metrics, meetingTypeSelected, etc.)
   * @param {object} result   - AI service response (aggregated field)
   * @param {object} [opts]   - Optional: { faceId, participantName } for multi-face
   * @returns {object[]}        Array of alert objects
   */
  evaluateVisual(session, result, opts = {}) {
    const alerts = [];
    const agg = result?.aggregated;
    if (!agg) return alerts;

    const faceId = opts.faceId ?? null;
    const participantName = opts.participantName || null;
    // Include faceId in cooldown keys so per-face alerts don't collide
    const keySuffix = faceId != null ? `_face${faceId}` : "";
    const nameLabel = participantName || (faceId != null ? `Participant ${faceId}` : "Participant");

    // 1. Deepfake detection (with consecutive-frame gate to filter single-frame jitter)
    const authScore = agg.deepfake?.authenticityScore ?? 1;
    const sessionId = session?.id || "unknown";
    const lowKey = `${sessionId}_${faceId ?? "default"}`;
    const MIN_CONSECUTIVE_LOW = 3; // require 3+ consecutive low frames before alerting

    if (authScore <= THRESHOLDS.deepfake.medium) {
      // Track consecutive low-score frames
      this._consecutiveLow.set(lowKey, (this._consecutiveLow.get(lowKey) || 0) + 1);
    } else {
      // Score is above medium threshold — reset counter
      this._consecutiveLow.set(lowKey, 0);
    }

    const consecutiveCount = this._consecutiveLow.get(lowKey) || 0;

    if (authScore <= THRESHOLDS.deepfake.high && consecutiveCount >= MIN_CONSECUTIVE_LOW) {
      const key = `deepfake_high${keySuffix}`;
      if (this._checkCooldown(key)) {
        alerts.push(
          buildAlert({
            severity: "critical",
            category: "deepfake",
            title: "Visual Manipulation Detected",
            message: `${nameLabel}: Deepfake authenticity score critically low: ${authScore.toFixed(2)}. Verify identity immediately.`,
            model: agg.deepfake?.model || "MesoNet-4",
            confidence: 1 - authScore,
            faceId,
            participantName,
          })
        );
        this._markEmitted(key);
      }
    } else if (authScore <= THRESHOLDS.deepfake.medium && consecutiveCount >= MIN_CONSECUTIVE_LOW) {
      const key = `deepfake_medium${keySuffix}`;
      if (this._checkCooldown(key)) {
        alerts.push(
          buildAlert({
            severity: "high",
            category: "deepfake",
            title: "Possible Visual Manipulation",
            message: `${nameLabel}: Deepfake authenticity score: ${authScore.toFixed(2)}. Consider verifying via secondary channel.`,
            model: agg.deepfake?.model || "MesoNet-4",
            confidence: 1 - authScore,
            faceId,
            participantName,
          })
        );
        this._markEmitted(key);
      }
    }

    // 2. Emotion-based aggression (skip if confidence < 40% — Zoom compression noise)
    const emotion = agg.emotion;
    if (emotion?.label === "Angry" && emotion.confidence >= 0.40) {
      if (emotion.confidence > THRESHOLDS.emotion.angerHigh) {
        const key = `aggression_high${keySuffix}`;
        if (this._checkCooldown(key)) {
          alerts.push(
            buildAlert({
              severity: "medium",
              category: "altercation",
              title: "Aggression Indicator",
              message: `${nameLabel}: High anger detected (confidence ${emotion.confidence.toFixed(2)}). Monitor for escalation.`,
              model: "emotion",
              confidence: emotion.confidence,
              faceId,
              participantName,
            })
          );
          this._markEmitted(key);
        }
      } else if (
        emotion.confidence > THRESHOLDS.emotion.angerMedium &&
        emotion.confidence <= THRESHOLDS.emotion.angerHigh
      ) {
        const key = `aggression_medium${keySuffix}`;
        if (this._checkCooldown(key, 60_000)) {
          alerts.push(
            buildAlert({
              severity: "low",
              category: "emotion",
              title: "Elevated Anger",
              message: `${nameLabel}: Moderate anger detected in participant expression.`,
              model: "emotion",
              confidence: emotion.confidence,
              faceId,
              participantName,
            })
          );
          this._markEmitted(key);
        }
      }
    }

    // 4. Fear in official meeting context
    if (
      emotion?.label === "Fear" &&
      emotion.confidence > 0.6 &&
      session.meetingTypeSelected === "official"
    ) {
      const key = `fear_official${keySuffix}`;
      if (this._checkCooldown(key, 60_000)) {
        alerts.push(
          buildAlert({
            severity: "low",
            category: "emotion",
            title: "Distress Signal",
            message: `${nameLabel}: Elevated fear detected during official meeting. Participant may be under duress.`,
            model: "emotion",
            confidence: emotion.confidence,
            faceId,
            participantName,
          })
        );
        this._markEmitted(key);
      }
    }

    return alerts;
  }

  /**
   * Evaluate temporal anomalies detected by the AI service's temporal analyzer.
   *
   * @param {object} session - Session object
   * @param {object} result  - AI service response (aggregated.temporal.anomalies[])
   * @returns {object[]}       Array of alert objects
   */
  evaluateTemporal(session, result) {
    const alerts = [];
    const anomalies = result?.aggregated?.temporal?.anomalies;
    if (!Array.isArray(anomalies) || anomalies.length === 0) return alerts;

    for (const anomaly of anomalies) {
      if (typeof anomaly !== "object" || !anomaly.type) {
        log.warn("alertFusion", `Skipping malformed temporal anomaly: ${JSON.stringify(anomaly)}`);
        continue;
      }
      const type = anomaly.type;

      const KNOWN_TYPES = ["sudden_trust_drop", "emotion_instability"];
      if (!KNOWN_TYPES.includes(type)) {
        log.debug("alertFusion", `Unknown temporal anomaly type: "${type}"`);
      }

      if (type === "sudden_trust_drop" && this._checkCooldown(`temporal_trust_drop_${session?.id || "unknown"}`)) {
        alerts.push(
          buildAlert({
            severity: "high",
            category: "deepfake",
            title: "Sudden Trust Score Drop",
            message: "Trust score dropped significantly between frames. Possible manipulation switch detected.",
            model: "temporal-analyzer",
            confidence: 0.85,
          })
        );
        this._markEmitted(`temporal_trust_drop_${session?.id || "unknown"}`);
      }

      if (type === "emotion_instability" && this._checkCooldown(`temporal_emotion_${session?.id || "unknown"}`, 60_000)) {
        alerts.push(
          buildAlert({
            severity: "low",
            category: "emotion",
            title: "Emotional Instability",
            message: "Rapid emotion changes detected over recent frames.",
            model: "temporal-analyzer",
            confidence: 0.60,
          })
        );
        this._markEmitted(`temporal_emotion_${session?.id || "unknown"}`);
      }
    }

    return alerts;
  }

  /**
   * Evaluate transcript-based fraud signals and fuse with current visual state.
   *
   * @param {object} session       - Session object
   * @param {object[]} fraudAlerts - Alerts from fraudDetector module
   * @returns {object[]}            Possibly escalated alerts
   */
  fuseWithTranscript(session, fraudAlerts) {
    const deepfakeRisk = session.metrics?.deepfake?.riskLevel || "low";

    return fraudAlerts.map((alert) => {
      // Escalate fraud alerts when deepfake risk is also elevated
      if (
        deepfakeRisk !== "low" &&
        (alert.category === "fraud" || alert.category === "scam") &&
        alert.severity !== "critical"
      ) {
        // Include alert title in cooldown key so different subcategories
        // (e.g. social_engineering vs credential_theft) don't suppress each other
        const escalateKey = `fuse_escalate_${alert.category}:${alert.title}`;
        if (!this._checkCooldown(escalateKey, 60_000)) {
          return alert;
        }
        this._markEmitted(escalateKey);
        return {
          ...alert,
          severity: "critical",
          message: `${alert.message} [Escalated: visual manipulation risk is also elevated.]`,
        };
      }
      return alert;
    });
  }

  /**
   * Reset cooldowns (useful for testing or session restart).
   */
  reset() {
    this.cooldowns.clear();
    this._consecutiveLow = new Map();
  }
}

module.exports = {
  AlertFusionEngine,
  buildAlert,
  THRESHOLDS,
};
