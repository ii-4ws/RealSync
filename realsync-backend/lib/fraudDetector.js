/**
 * Fraud / Scam Detection Module.
 *
 * Weighted keyword/pattern matching with context-aware scoring.
 * Designed to work alongside the existing suggestions.js (which handles
 * rule-based suggestions) — this module focuses specifically on fraud,
 * scam, impersonation, social engineering, and altercation detection.
 */

const { v4: uuidv4 } = require("uuid");

/* ------------------------------------------------------------------ */
/*  Pattern rules                                                      */
/* ------------------------------------------------------------------ */

const FRAUD_RULES = {
  FINANCIAL_FRAUD: {
    patterns: [
      { phrase: "wire transfer", weight: 0.8 },
      { phrase: "gift card", weight: 0.9 },
      { phrase: "send money", weight: 0.7 },
      { phrase: "urgent payment", weight: 0.85 },
      { phrase: "bank account", weight: 0.6 },
      { phrase: "invoice overdue", weight: 0.7 },
      { phrase: "transfer funds", weight: 0.8 },
      { phrase: "western union", weight: 0.9 },
      { phrase: "cryptocurrency", weight: 0.5 },
      { phrase: "bitcoin", weight: 0.5 },
      { phrase: "pay immediately", weight: 0.85 },
      { phrase: "money order", weight: 0.7 },
    ],
    baseSeverity: "high",
    category: "fraud",
  },
  CREDENTIAL_THEFT: {
    patterns: [
      { phrase: "otp", weight: 0.8 },
      { phrase: "verification code", weight: 0.85 },
      { phrase: "password", weight: 0.7 },
      { phrase: "two factor", weight: 0.6 },
      { phrase: "2fa code", weight: 0.8 },
      { phrase: "pin number", weight: 0.75 },
      { phrase: "security code", weight: 0.7 },
      { phrase: "login credentials", weight: 0.8 },
      { phrase: "share your code", weight: 0.9 },
    ],
    baseSeverity: "high",
    category: "scam",
  },
  IMPERSONATION: {
    patterns: [
      { phrase: "i'm from it", weight: 0.7 },
      { phrase: "this is the ceo", weight: 0.8 },
      { phrase: "i'm your manager", weight: 0.6 },
      { phrase: "tech support", weight: 0.5 },
      { phrase: "from the bank", weight: 0.8 },
      { phrase: "government agency", weight: 0.7 },
      { phrase: "irs", weight: 0.7 },
      { phrase: "tax authority", weight: 0.7 },
    ],
    baseSeverity: "medium",
    category: "scam",
  },
  SOCIAL_ENGINEERING: {
    patterns: [
      { phrase: "don't tell anyone", weight: 0.8 },
      { phrase: "keep this between us", weight: 0.75 },
      { phrase: "do it now", weight: 0.5 },
      { phrase: "act fast", weight: 0.6 },
      { phrase: "limited time", weight: 0.5 },
      { phrase: "you'll be in trouble", weight: 0.7 },
      { phrase: "don't ask questions", weight: 0.8 },
      { phrase: "no one else needs to know", weight: 0.75 },
    ],
    baseSeverity: "medium",
    category: "scam",
  },
  ALTERCATION: {
    patterns: [
      { phrase: "kill you", weight: 1.0 },
      { phrase: "hurt you", weight: 0.9 },
      { phrase: "shut up", weight: 0.5 },
      { phrase: "i'll sue", weight: 0.6 },
      { phrase: "you're fired", weight: 0.5 },
      { phrase: "watch your back", weight: 0.8 },
      { phrase: "you're dead", weight: 1.0 },
      { phrase: "i will find you", weight: 0.9 },
    ],
    baseSeverity: "high",
    category: "altercation",
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const normalize = (text) =>
  (typeof text === "string" ? text : "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Score a piece of transcript text against all fraud rule categories.
 * Returns the highest-scoring match set.
 */
function scoreTranscriptPatterns(text) {
  const hay = normalize(text);
  if (!hay) return { score: 0, matches: [], category: null, ruleName: null };

  let bestScore = 0;
  let bestMatches = [];
  let bestCategory = null;
  let bestRuleName = null;
  let bestBaseSeverity = "low";

  for (const [ruleName, rule] of Object.entries(FRAUD_RULES)) {
    let ruleScore = 0;
    const matches = [];

    for (const { phrase, weight } of rule.patterns) {
      if (hay.includes(phrase)) {
        ruleScore += weight;
        matches.push(phrase);
      }
    }

    if (ruleScore > bestScore) {
      bestScore = ruleScore;
      bestMatches = matches;
      bestCategory = rule.category;
      bestRuleName = ruleName;
      bestBaseSeverity = rule.baseSeverity;
    }
  }

  return {
    score: bestScore,
    matches: bestMatches,
    category: bestCategory,
    ruleName: bestRuleName,
    baseSeverity: bestBaseSeverity,
  };
}

/**
 * Derive severity from fused score.
 */
function deriveSeverity(fusedScore) {
  if (fusedScore >= 0.8) return "critical";
  if (fusedScore >= 0.6) return "high";
  if (fusedScore >= 0.3) return "medium";
  return "low";
}

/**
 * Get a visual risk multiplier from current session metrics.
 * Deepfake or identity risk amplifies transcript fraud signals.
 */
function getVisualRiskBoost(metrics) {
  let boost = 0;
  const deepfakeRisk = metrics?.deepfake?.riskLevel || "low";
  const identityRisk = metrics?.identity?.riskLevel || "low";

  if (deepfakeRisk === "high") boost += 0.5;
  else if (deepfakeRisk === "medium") boost += 0.25;

  if (identityRisk === "high") boost += 0.3;
  else if (identityRisk === "medium") boost += 0.15;

  return boost;
}

/* ------------------------------------------------------------------ */
/*  Rolling window for accumulation                                    */
/* ------------------------------------------------------------------ */

class FraudDetector {
  constructor() {
    /** @type {Map<string, number>} ruleKey → lastEmittedAt */
    this.cooldowns = new Map();
    /** Rolling buffer of recent transcript lines (last 60s) */
    this.recentLines = [];
  }

  /**
   * Check cooldown for a rule.
   */
  _canEmit(key, cooldownMs = 30_000) {
    const last = this.cooldowns.get(key) || 0;
    if (Date.now() - last < cooldownMs) return false;
    this.cooldowns.set(key, Date.now());
    return true;
  }

  /**
   * Add a transcript line to the rolling window.
   */
  addLine(text) {
    const now = Date.now();
    this.recentLines.push({ text, ts: now });
    // Trim lines older than 60 seconds
    this.recentLines = this.recentLines.filter((l) => now - l.ts < 60_000);
  }

  /**
   * Evaluate a transcript line for fraud/scam indicators.
   *
   * @param {string} text           - Transcript text
   * @param {object} sessionMetrics - Current session metrics for visual fusion
   * @returns {object[]}              Array of alert objects (may be empty)
   */
  evaluate(text, sessionMetrics) {
    this.addLine(text);

    const alerts = [];

    // Score the individual line
    const lineResult = scoreTranscriptPatterns(text);

    // Also score the accumulated recent context (60s window)
    const windowText = this.recentLines.map((l) => l.text).join(" ");
    const windowResult = scoreTranscriptPatterns(windowText);

    // Use the higher score between individual line and accumulated window
    const result = windowResult.score > lineResult.score ? windowResult : lineResult;

    if (result.score < 0.3) return alerts; // Below threshold

    // Apply visual risk boost
    const visualBoost = getVisualRiskBoost(sessionMetrics);
    const fusedScore = Math.min(result.score * (1 + visualBoost), 2.0);

    const severity = deriveSeverity(fusedScore);

    const alertKey = `fraud_${result.ruleName}_${severity}`;
    if (!this._canEmit(alertKey)) return alerts;

    const matchList = result.matches.join(", ");
    const titles = {
      FINANCIAL_FRAUD: "Financial Fraud Indicator",
      CREDENTIAL_THEFT: "Credential Theft Attempt",
      IMPERSONATION: "Impersonation Detected",
      SOCIAL_ENGINEERING: "Social Engineering Attempt",
      ALTERCATION: "Hostile Language Detected",
    };

    alerts.push({
      alertId: uuidv4(),
      severity,
      category: result.category,
      title: titles[result.ruleName] || "Suspicious Activity",
      message: `Detected: "${matchList}". Risk score: ${fusedScore.toFixed(2)}.`,
      source: { model: "fraudDetector", confidence: fusedScore },
      ts: new Date().toISOString(),
    });

    return alerts;
  }

  /**
   * Reset state (for new session).
   */
  reset() {
    this.cooldowns.clear();
    this.recentLines = [];
  }
}

module.exports = {
  FraudDetector,
  FRAUD_RULES,
  scoreTranscriptPatterns,
  // Exposed for testing
  _deriveSeverity: deriveSeverity,
  _getVisualRiskBoost: getVisualRiskBoost,
};
