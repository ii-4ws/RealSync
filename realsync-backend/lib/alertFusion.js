/**
 * Alert Fusion Engine.
 *
 * Combines visual analysis results (deepfake, identity, emotion) with
 * transcript-based signals (fraud, scam, altercation) to produce unified
 * alert events that are broadcast to the dashboard and persisted.
 */

const { v4: uuidv4 } = require("uuid");

/* ------------------------------------------------------------------ */
/*  Thresholds (see FINAL_RELEASE_TECH_SPEC.md §12)                    */
/* ------------------------------------------------------------------ */

const THRESHOLDS = {
  deepfake: {
    medium: 0.85, // authenticityScore <= this → medium risk
    high: 0.70,   // authenticityScore <= this → high risk
  },
  identity: {
    medium: 0.20, // embeddingShift >= this → medium risk
    high: 0.40,   // embeddingShift >= this → high risk
  },
  emotion: {
    angerMedium: 0.50,
    angerHigh: 0.70,
  },
};

const DEFAULT_COOLDOWN_MS = 30_000; // 30 seconds between same alert type

/* ------------------------------------------------------------------ */
/*  Alert builder                                                      */
/* ------------------------------------------------------------------ */

function buildAlert({ severity, category, title, message, model, confidence }) {
  return {
    alertId: uuidv4(),
    severity,
    category,
    title,
    message,
    source: { model: model || "fusion", confidence: confidence || 0 },
    ts: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  Fusion engine                                                      */
/* ------------------------------------------------------------------ */

class AlertFusionEngine {
  constructor() {
    /** @type {Map<string, number>} alertKey → last emitted timestamp */
    this.cooldowns = new Map();
  }

  /**
   * Check if a particular alert key is off cooldown.
   */
  _canEmit(key, cooldownMs = DEFAULT_COOLDOWN_MS) {
    const last = this.cooldowns.get(key) || 0;
    if (Date.now() - last < cooldownMs) return false;
    this.cooldowns.set(key, Date.now());
    return true;
  }

  /**
   * Evaluate an AI analysis result and return any alerts that should fire.
   *
   * @param {object} session  - Session object (has metrics, meetingTypeSelected, etc.)
   * @param {object} result   - AI service response (aggregated field)
   * @returns {object[]}        Array of alert objects
   */
  evaluateVisual(session, result) {
    const alerts = [];
    const agg = result?.aggregated;
    if (!agg) return alerts;

    // 1. Deepfake detection
    const authScore = agg.deepfake?.authenticityScore ?? 1;
    if (authScore <= THRESHOLDS.deepfake.high && this._canEmit("deepfake_high")) {
      alerts.push(
        buildAlert({
          severity: "critical",
          category: "deepfake",
          title: "Visual Manipulation Detected",
          message: `Deepfake authenticity score critically low: ${authScore.toFixed(2)}. Verify participant identity immediately.`,
          model: agg.deepfake?.model || "MesoNet-4",
          confidence: 1 - authScore,
        })
      );
    } else if (
      authScore <= THRESHOLDS.deepfake.medium &&
      authScore > THRESHOLDS.deepfake.high &&
      this._canEmit("deepfake_medium")
    ) {
      alerts.push(
        buildAlert({
          severity: "high",
          category: "deepfake",
          title: "Possible Visual Manipulation",
          message: `Deepfake authenticity score: ${authScore.toFixed(2)}. Consider verifying via secondary channel.`,
          model: agg.deepfake?.model || "MesoNet-4",
          confidence: 1 - authScore,
        })
      );
    }

    // 2. Identity drift
    const shift = agg.identity?.embeddingShift ?? 0;
    if (shift >= THRESHOLDS.identity.high && this._canEmit("identity_high")) {
      alerts.push(
        buildAlert({
          severity: "high",
          category: "identity",
          title: "Identity Inconsistency",
          message: `Significant embedding drift detected (${shift.toFixed(2)}). Participant may have changed.`,
          model: "identity-tracker",
          confidence: shift,
        })
      );
    } else if (
      shift >= THRESHOLDS.identity.medium &&
      shift < THRESHOLDS.identity.high &&
      this._canEmit("identity_medium")
    ) {
      alerts.push(
        buildAlert({
          severity: "medium",
          category: "identity",
          title: "Identity Drift Detected",
          message: `Embedding drift: ${shift.toFixed(2)}. Consider a liveness check.`,
          model: "identity-tracker",
          confidence: shift,
        })
      );
    }

    // 3. Emotion-based aggression
    const emotion = agg.emotion;
    if (emotion?.label === "Angry") {
      if (
        emotion.confidence > THRESHOLDS.emotion.angerHigh &&
        this._canEmit("aggression_high")
      ) {
        alerts.push(
          buildAlert({
            severity: "medium",
            category: "altercation",
            title: "Aggression Indicator",
            message: `High anger detected (confidence ${emotion.confidence.toFixed(2)}). Monitor for escalation.`,
            model: "emotion",
            confidence: emotion.confidence,
          })
        );
      } else if (
        emotion.confidence > THRESHOLDS.emotion.angerMedium &&
        this._canEmit("aggression_medium", 60_000)
      ) {
        alerts.push(
          buildAlert({
            severity: "low",
            category: "emotion",
            title: "Elevated Anger",
            message: "Moderate anger detected in participant expression.",
            model: "emotion",
            confidence: emotion.confidence,
          })
        );
      }
    }

    // 4. Fear in official meeting context
    if (
      emotion?.label === "Fear" &&
      emotion.confidence > 0.6 &&
      session.meetingTypeSelected === "official" &&
      this._canEmit("fear_official", 60_000)
    ) {
      alerts.push(
        buildAlert({
          severity: "low",
          category: "emotion",
          title: "Distress Signal",
          message: "Elevated fear detected during official meeting. Participant may be under duress.",
          model: "emotion",
          confidence: emotion.confidence,
        })
      );
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
  }
}

module.exports = {
  AlertFusionEngine,
  buildAlert,
  THRESHOLDS,
};
