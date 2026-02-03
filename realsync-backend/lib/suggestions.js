const MEETING_TYPES = ["official", "business", "friends"];

const KEYWORDS_BY_TYPE = {
  official: [
    "agenda",
    "minutes",
    "approved",
    "approval",
    "policy",
    "compliance",
    "regulation",
    "board",
    "procedure",
    "governance",
  ],
  business: [
    "invoice",
    "client",
    "deadline",
    "budget",
    "contract",
    "deliverable",
    "proposal",
    "purchase",
    "payment",
    "meeting",
  ],
  friends: ["lol", "dude", "bro", "hangout", "party", "game", "chill", "memes", "vacation"],
};

const SUSPICIOUS = {
  money: ["wire", "bank", "transfer", "gift card", "invoice", "payment", "urgent", "asap"],
  credentials: ["otp", "password", "verification code", "2fa", "code", "pin"],
};

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(text, phrases) {
  const hay = normalize(text);
  return phrases.some((phrase) => hay.includes(normalize(phrase)));
}

function scoreMeetingType(text) {
  const hay = normalize(text);
  const scores = Object.fromEntries(MEETING_TYPES.map((t) => [t, 0]));

  for (const type of MEETING_TYPES) {
    for (const kw of KEYWORDS_BY_TYPE[type]) {
      if (hay.includes(kw)) scores[type] += 1;
    }
  }

  const total = Object.values(scores).reduce((sum, v) => sum + v, 0) || 1;
  const normalized = Object.fromEntries(
    Object.entries(scores).map(([k, v]) => [k, v / total])
  );

  let bestType = "business";
  let bestScore = 0;
  for (const [k, v] of Object.entries(normalized)) {
    if (v > bestScore) {
      bestType = k;
      bestScore = v;
    }
  }

  return { label: bestType, confidence: bestScore, scores: normalized };
}

function buildSuggestion({ severity, title, message }) {
  return {
    severity,
    title,
    message,
    ts: new Date().toISOString(),
  };
}

function generateSuggestions({
  transcriptText,
  meetingTypeSelected,
  metrics,
  fired, // Map<string, number> for cooldown/dedupe
}) {
  const suggestions = [];
  const now = Date.now();
  const text = normalize(transcriptText);

  const deepfakeRisk = metrics?.deepfake?.riskLevel || "low";
  const identityShift = Number(metrics?.identity?.embeddingShift || 0);

  const canEmit = (ruleId, cooldownMs = 60_000) => {
    const last = fired.get(ruleId) || 0;
    if (now - last < cooldownMs) return false;
    fired.set(ruleId, now);
    return true;
  };

  if (
    deepfakeRisk !== "low" &&
    containsAny(text, SUSPICIOUS.money) &&
    canEmit("money_with_visual_risk", 45_000)
  ) {
    suggestions.push(
      buildSuggestion({
        severity: "high",
        title: "Verify Before Acting",
        message: "Visual risk + money keywords detected. Verify the speaker via a secondary channel before any transfer.",
      })
    );
  }

  if (
    meetingTypeSelected === "official" &&
    identityShift > 0.25 &&
    canEmit("identity_drift_official", 45_000)
  ) {
    suggestions.push(
      buildSuggestion({
        severity: "medium",
        title: "Run a Quick Liveness Check",
        message: "Identity drift rising during an official meeting. Ask the participant to reposition the camera and repeat a random phrase.",
      })
    );
  }

  if (
    meetingTypeSelected === "friends" &&
    containsAny(text, SUSPICIOUS.credentials) &&
    canEmit("credentials_in_friends", 60_000)
  ) {
    suggestions.push(
      buildSuggestion({
        severity: "high",
        title: "Do Not Share Codes",
        message: "Credential keywords detected in a casual context. Never share OTP/passwords; confirm identity via phone.",
      })
    );
  }

  return suggestions;
}

module.exports = {
  MEETING_TYPES,
  scoreMeetingType,
  generateSuggestions,
};

