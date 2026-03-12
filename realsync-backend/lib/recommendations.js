/**
 * Maps (category, severity) to actionable recommendation strings.
 *
 * Pure function, no dependencies. Called at alert dispatch time
 * (after fusion) so the recommendation matches the final severity.
 */

const RECOMMENDATIONS = {
  deepfake: {
    critical: "Leave the meeting immediately. Strong signs of AI-generated video detected. Do not share sensitive information.",
    high: "Exercise extreme caution. Verify the participant's identity through a secondary channel before continuing.",
    medium: "Minor visual anomalies detected. Monitor the participant and consider asking them to toggle their camera.",
    low: "Slight visual irregularity noted. Likely benign, but stay aware.",
  },
  fraud: {
    critical: "Active financial fraud attempt detected. Do not make any payments or transfers. End the meeting and report through official channels.",
    high: "Do not make any payments or share financial details. Verify all requests through official channels outside this meeting.",
    medium: "Financial language detected that may indicate a fraud attempt. Proceed with caution and verify independently.",
    low: "Minor financial indicators noted. Likely routine, but stay alert.",
  },
  scam: {
    critical: "Stop sharing information immediately. Active credential theft or impersonation attempt detected. Verify through a known, separate channel.",
    high: "Possible impersonation or social engineering. Do not share credentials, codes, or personal information.",
    medium: "Some social engineering indicators detected. Be cautious about sharing sensitive information.",
    low: "Low-confidence scam indicator. Likely benign, but do not share credentials.",
  },
  altercation: {
    critical: "Hostile or threatening language detected. End the meeting immediately and report the incident.",
    high: "Aggressive language detected. De-escalate immediately. Consider ending the meeting if behaviour continues.",
    medium: "Elevated tension in the conversation. Steer toward calmer topics.",
    low: "Mild confrontational language noted. Monitor for escalation.",
  },
  emotion: {
    critical: "Extreme emotional distress detected. Consider pausing the meeting and checking on the participant's wellbeing.",
    high: "Elevated aggression or distress detected. De-escalate the conversation and avoid confrontational topics.",
    medium: "Noticeable emotional shift detected. Be mindful of the participant's state.",
    low: "Mild emotional change noted. No action required.",
  },
};

/**
 * Returns an actionable recommendation string for a given alert category and severity.
 * @param {string} category - Alert category (deepfake, identity, fraud, scam, altercation, emotion)
 * @param {string} severity - Alert severity (critical, high, medium, low)
 * @returns {string|null} Recommendation string, or null if category/severity not mapped
 */
function getRecommendation(category, severity) {
  const categoryMap = RECOMMENDATIONS[category?.toLowerCase()];
  if (!categoryMap) return null;
  return categoryMap[severity?.toLowerCase()] || null;
}

module.exports = { getRecommendation };
