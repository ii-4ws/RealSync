/**
 * AI Client module tests.
 *
 * Covers:
 *   - analyzeFrame returns null when AI service is unreachable
 *   - analyzeAudio returns null when AI service is unreachable
 *   - analyzeText returns null when AI service is unreachable
 *   - checkHealth returns proper status when AI service is down
 */

const {
  analyzeFrame,
  analyzeAudio,
  analyzeText,
  checkHealth,
} = require("../lib/aiClient");

/* ------------------------------------------------------------------ */
/*  Fallback when AI service is unreachable                            */
/* ------------------------------------------------------------------ */

describe("analyzeFrame — AI service down", () => {
  it("should return null when AI service is unreachable", async () => {
    const result = await analyzeFrame({
      sessionId: "test-fallback",
      frameB64: "dGVzdA==",
      capturedAt: new Date().toISOString(),
    });

    expect(result).toBeNull();
  }, 20000);

  it("should not throw when AI service is down", async () => {
    await expect(
      analyzeFrame({
        sessionId: "no-throw",
        frameB64: "dGVzdA==",
      })
    ).resolves.toBeDefined();
  }, 20000);
});

describe("analyzeAudio — AI service down", () => {
  it("should return null when AI service is unreachable", async () => {
    const result = await analyzeAudio({
      sessionId: "audio-test",
      audioB64: "dGVzdA==",
      durationMs: 1000,
    });

    expect(result).toBeNull();
  }, 20000);
});

describe("analyzeText — AI service down", () => {
  it("should return null when AI service is unreachable", async () => {
    const result = await analyzeText({
      sessionId: "text-test",
      text: "Please send the wire transfer immediately",
    });

    expect(result).toBeNull();
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
