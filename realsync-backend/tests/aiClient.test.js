/**
 * AI Client module tests.
 *
 * Covers:
 *   - Mock response format and structure
 *   - Fallback behavior when AI service is unreachable
 *   - checkHealth returns proper status
 *   - analyzeFrame falls back to mock gracefully
 *   - analyzeAudio returns mock when service is down
 *   - analyzeText returns mock when service is down
 */

const {
  analyzeFrame,
  analyzeAudio,
  analyzeText,
  checkHealth,
  _generateMockResponse,
} = require("../lib/aiClient");
const { EMOTIONS } = require("../lib/constants");

/* ------------------------------------------------------------------ */
/*  Mock response format                                               */
/* ------------------------------------------------------------------ */

describe("_generateMockResponse", () => {
  it("should return an object with required top-level fields", () => {
    const result = _generateMockResponse("test-session-1");

    expect(result).toHaveProperty("sessionId", "test-session-1");
    expect(result).toHaveProperty("capturedAt");
    expect(result).toHaveProperty("processedAt");
    expect(result).toHaveProperty("source", "mock");
    expect(result).toHaveProperty("faces");
    expect(result).toHaveProperty("aggregated");
  });

  it("should contain exactly one face in the faces array", () => {
    const result = _generateMockResponse("s1");
    expect(Array.isArray(result.faces)).toBe(true);
    expect(result.faces).toHaveLength(1);
  });

  it("should have valid face structure with bbox, emotion, deepfake", () => {
    const result = _generateMockResponse("s1");
    const face = result.faces[0];

    expect(face).toHaveProperty("faceId", 0);
    expect(face).toHaveProperty("bbox");
    expect(face.bbox).toHaveProperty("x");
    expect(face.bbox).toHaveProperty("y");
    expect(face.bbox).toHaveProperty("w");
    expect(face.bbox).toHaveProperty("h");
    expect(face).toHaveProperty("confidence");
    expect(typeof face.confidence).toBe("number");
    expect(face.confidence).toBeGreaterThanOrEqual(0);
    expect(face.confidence).toBeLessThanOrEqual(1);
  });

  it("should have emotion scores for all defined emotions", () => {
    const result = _generateMockResponse("s1");
    const scores = result.faces[0].emotion.scores;

    for (const emotion of EMOTIONS) {
      expect(scores).toHaveProperty(emotion);
      expect(typeof scores[emotion]).toBe("number");
    }
  });

  it("should have emotion scores that approximately sum to 1", () => {
    const result = _generateMockResponse("s1");
    const scores = result.faces[0].emotion.scores;
    const sum = Object.values(scores).reduce((s, v) => s + v, 0);
    // Allow small floating point deviation
    expect(sum).toBeGreaterThan(0.95);
    expect(sum).toBeLessThan(1.05);
  });

  it("should set dominant emotion label correctly", () => {
    const result = _generateMockResponse("s1");
    const face = result.faces[0];
    const scores = face.emotion.scores;
    const label = face.emotion.label;

    // The label should correspond to the highest score
    expect(EMOTIONS).toContain(label);
    const maxScore = Math.max(...Object.values(scores));
    expect(scores[label]).toBe(maxScore);
  });

  it("should have deepfake fields in face and aggregated", () => {
    const result = _generateMockResponse("s1");
    const face = result.faces[0];

    expect(face.deepfake).toHaveProperty("authenticityScore");
    expect(face.deepfake).toHaveProperty("riskLevel");
    expect(face.deepfake).toHaveProperty("model");
    expect(["low", "medium", "high"]).toContain(face.deepfake.riskLevel);
    expect(typeof face.deepfake.authenticityScore).toBe("number");
  });

  it("should have aggregated trust score and confidence layers", () => {
    const result = _generateMockResponse("s1");
    const agg = result.aggregated;

    expect(agg).toHaveProperty("trustScore");
    expect(typeof agg.trustScore).toBe("number");
    expect(agg.trustScore).toBeGreaterThanOrEqual(0);
    expect(agg.trustScore).toBeLessThanOrEqual(1);

    expect(agg).toHaveProperty("confidenceLayers");
    expect(agg.confidenceLayers).toHaveProperty("audio");
    expect(agg.confidenceLayers).toHaveProperty("video");
    expect(agg.confidenceLayers).toHaveProperty("behavior");

    // Audio should be null in mock (no audio signal fabricated)
    expect(agg.confidenceLayers.audio).toBeNull();
  });

  it("should use provided capturedAt timestamp when given", () => {
    const ts = "2026-01-15T10:00:00.000Z";
    const result = _generateMockResponse("s1", ts);
    expect(result.capturedAt).toBe(ts);
  });

  it("should generate current timestamp for capturedAt when not provided", () => {
    const before = new Date().toISOString();
    const result = _generateMockResponse("s1");
    const after = new Date().toISOString();

    expect(result.capturedAt >= before).toBe(true);
    expect(result.capturedAt <= after).toBe(true);
  });

  it("should derive riskLevel from authenticityScore correctly", () => {
    // Run multiple times to get different random values
    for (let i = 0; i < 20; i++) {
      const result = _generateMockResponse(`s${i}`);
      const { authenticityScore, riskLevel } = result.faces[0].deepfake;

      if (authenticityScore > 0.85) {
        expect(riskLevel).toBe("low");
      } else if (authenticityScore > 0.7) {
        expect(riskLevel).toBe("medium");
      } else {
        expect(riskLevel).toBe("high");
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Fallback when AI service is unreachable                            */
/* ------------------------------------------------------------------ */

describe("analyzeFrame — fallback to mock", () => {
  it("should return a mock response when AI service is unreachable", async () => {
    const result = await analyzeFrame({
      sessionId: "test-fallback",
      frameB64: "dGVzdA==", // "test" in base64
      capturedAt: new Date().toISOString(),
    });

    // Should fall back to mock instead of throwing
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("source", "mock");
    expect(result).toHaveProperty("sessionId", "test-fallback");
    expect(result).toHaveProperty("faces");
    expect(result).toHaveProperty("aggregated");
  }, 20000); // Extended timeout since it tries to connect first

  it("should not throw when AI service is down", async () => {
    await expect(
      analyzeFrame({
        sessionId: "no-throw",
        frameB64: "dGVzdA==",
      })
    ).resolves.toBeDefined();
  }, 20000);
});

describe("analyzeAudio — fallback to mock", () => {
  it("should return a mock audio response when AI is unreachable", async () => {
    const result = await analyzeAudio({
      sessionId: "audio-test",
      audioB64: "dGVzdA==",
      durationMs: 1000,
    });

    expect(result).not.toBeNull();
    expect(result).toHaveProperty("sessionId", "audio-test");
    expect(result).toHaveProperty("audio");
    expect(result.audio).toHaveProperty("authenticityScore");
    expect(result.audio).toHaveProperty("riskLevel", "low");
    expect(result.audio).toHaveProperty("model", "AASIST");
  }, 20000);
});

describe("analyzeText — fallback to mock", () => {
  it("should return a mock behavioral response when AI is unreachable", async () => {
    const result = await analyzeText({
      sessionId: "text-test",
      text: "Please send the wire transfer immediately",
    });

    expect(result).not.toBeNull();
    expect(result).toHaveProperty("sessionId", "text-test");
    expect(result).toHaveProperty("behavioral");
    expect(result.behavioral).toHaveProperty("signals");
    expect(Array.isArray(result.behavioral.signals)).toBe(true);
    expect(result.behavioral).toHaveProperty("model", "DeBERTa-v3-NLI");
  }, 20000);
});

/* ------------------------------------------------------------------ */
/*  checkHealth                                                        */
/* ------------------------------------------------------------------ */

describe("checkHealth", () => {
  it("should return an object with ok: false when AI is unreachable", async () => {
    const result = await checkHealth();

    expect(result).toHaveProperty("ok", false);
    expect(result).toHaveProperty("reason");
    expect(typeof result.reason).toBe("string");
    expect(result.reason.length).toBeGreaterThan(0);
  }, 10000);

  it("should not throw even when the service is completely down", async () => {
    await expect(checkHealth()).resolves.toBeDefined();
  }, 10000);
});
