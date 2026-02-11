/**
 * Enhanced Meeting Type Detector.
 *
 * Three detection channels (priority ordered):
 *   1. Manual input (always wins if set)
 *   2. Opening statement (first 60s of transcript)
 *   3. Auto-detection from rolling transcript keywords + topic tags
 *
 * Extends the existing scoreMeetingType() from suggestions.js with
 * topic-level tags (budget, security, HR, sales, technical, casual).
 */

const { MEETING_TYPES, scoreMeetingType } = require("./suggestions");

/* ------------------------------------------------------------------ */
/*  Topic tags                                                         */
/* ------------------------------------------------------------------ */

const TOPIC_TAGS = {
  budget: {
    type: "business",
    keywords: ["budget", "revenue", "cost", "profit", "expense", "roi", "margin", "forecast"],
  },
  security: {
    type: "official",
    keywords: ["security", "breach", "vulnerability", "audit", "compliance", "firewall", "incident"],
  },
  hr: {
    type: "official",
    keywords: ["hiring", "onboarding", "termination", "performance review", "hr", "recruitment"],
  },
  sales: {
    type: "business",
    keywords: ["client", "deal", "pipeline", "proposal", "contract", "lead", "prospect", "close"],
  },
  technical: {
    type: "business",
    keywords: ["deploy", "sprint", "ticket", "pull request", "merge", "bug", "feature", "release"],
  },
  casual: {
    type: "friends",
    keywords: ["weekend", "dinner", "movie", "vacation", "birthday", "party", "game", "hangout"],
  },
};

/* ------------------------------------------------------------------ */
/*  Opening statement patterns                                         */
/* ------------------------------------------------------------------ */

const OPENING_PATTERNS = [
  { regex: /this is (?:a|an|our|the) (official|formal|board|governance)\b/i, type: "official" },
  { regex: /(?:board meeting|governance meeting|policy review)/i, type: "official" },
  { regex: /(?:standup|sprint|project|client) (?:meeting|call|sync)/i, type: "business" },
  { regex: /(?:budget|quarterly|planning) (?:meeting|review|call)/i, type: "business" },
  { regex: /(?:just catching up|hang out|let's chill|what's up everyone)/i, type: "friends" },
];

const normalize = (text) =>
  (typeof text === "string" ? text : "").toLowerCase().replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------------ */
/*  Detection functions                                                */
/* ------------------------------------------------------------------ */

/**
 * Detect meeting type from opening statements (first 60 seconds).
 *
 * @param {Array<{text: string, ts: string}>} lines - Transcript lines
 * @returns {{ label: string|null, confidence: number }}
 */
function detectFromOpening(lines) {
  if (!lines || lines.length === 0) return { label: null, confidence: 0 };

  // Consider only lines within the first 60 seconds
  const firstTs = new Date(lines[0].ts).getTime();
  const earlyLines = lines.filter(
    (l) => new Date(l.ts).getTime() - firstTs <= 60_000
  );

  const text = normalize(earlyLines.map((l) => l.text).join(" "));

  for (const { regex, type } of OPENING_PATTERNS) {
    if (regex.test(text)) {
      return { label: type, confidence: 0.85 };
    }
  }

  return { label: null, confidence: 0 };
}

/**
 * Detect meeting type from full transcript using keyword + topic scoring.
 *
 * @param {Array<{text: string}>} lines - All transcript lines
 * @returns {{ label: string, confidence: number, topics: string[] }}
 */
function detectFromTranscript(lines) {
  if (!lines || lines.length === 0) {
    return { label: "business", confidence: 0, topics: [] };
  }

  const fullText = normalize(lines.map((l) => l.text).join(" "));

  // Base score from existing keyword system
  const base = scoreMeetingType(fullText);

  // Overlay topic tag scores
  const topicHits = [];
  const typeBoosts = { official: 0, business: 0, friends: 0 };

  for (const [topic, config] of Object.entries(TOPIC_TAGS)) {
    let hits = 0;
    for (const kw of config.keywords) {
      if (fullText.includes(kw)) hits++;
    }
    if (hits > 0) {
      topicHits.push(topic);
      typeBoosts[config.type] += hits;
    }
  }

  // Combine base scores with topic boosts
  const combined = {};
  for (const type of MEETING_TYPES) {
    combined[type] = (base.scores?.[type] || 0) + (typeBoosts[type] || 0) * 0.1;
  }

  const total = Object.values(combined).reduce((s, v) => s + v, 0) || 1;
  let bestType = "business";
  let bestScore = 0;
  for (const [type, score] of Object.entries(combined)) {
    const norm = score / total;
    if (norm > bestScore) {
      bestType = type;
      bestScore = norm;
    }
  }

  return {
    label: bestType,
    confidence: Number(bestScore.toFixed(3)),
    topics: topicHits,
  };
}

/**
 * Main detection entry point. Uses three channels in priority order.
 *
 * @param {object} session - Session object
 * @returns {{ label: string, confidence: number, source: string, topics?: string[] }}
 */
function detectMeetingType(session) {
  // Priority 1: Manual selection always wins
  if (session.meetingTypeManual) {
    return {
      label: session.meetingTypeManual,
      source: "manual",
      confidence: 1.0,
    };
  }

  // Priority 2: Opening statement (first 60s)
  const openingResult = detectFromOpening(
    session.transcriptState?.lines || []
  );
  if (openingResult.label && openingResult.confidence >= 0.8) {
    return { ...openingResult, source: "opening" };
  }

  // Priority 3: Auto-detection from full transcript
  const autoResult = detectFromTranscript(
    session.transcriptState?.lines || []
  );
  return { ...autoResult, source: "auto" };
}

module.exports = {
  detectMeetingType,
  detectFromOpening,
  detectFromTranscript,
  TOPIC_TAGS,
};
