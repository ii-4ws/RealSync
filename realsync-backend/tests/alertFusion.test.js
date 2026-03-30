/**
 * Alert Fusion Engine tests.
 *
 * Covers:
 *   - evaluateVisual: deepfake alerts, emotion alerts, fear in official meetings
 *   - Deduplication via cooldown
 *   - Cooldown reset
 *   - Severity levels
 *   - buildAlert helper
 *   - Consecutive-frame gating for deepfake alerts
 */

const { AlertFusionEngine, buildAlert, THRESHOLDS } = require("../lib/alertFusion");

/* ------------------------------------------------------------------ */
/*  buildAlert                                                         */
/* ------------------------------------------------------------------ */

describe("buildAlert", () => {
  it("should create an alert with all required fields", () => {
    const alert = buildAlert({
      severity: "high",
      category: "deepfake",
      title: "Test Alert",
      message: "Something suspicious happened",
      model: "TestModel",
      confidence: 0.85,
    });

    expect(alert).toHaveProperty("alertId");
    expect(typeof alert.alertId).toBe("string");
    expect(alert.alertId.length).toBeGreaterThan(0);
    expect(alert).toHaveProperty("severity", "high");
    expect(alert).toHaveProperty("category", "deepfake");
    expect(alert).toHaveProperty("title", "Test Alert");
    expect(alert).toHaveProperty("message", "Something suspicious happened");
    expect(alert).toHaveProperty("source");
    expect(alert.source.model).toBe("TestModel");
    expect(alert.source.confidence).toBe(0.85);
    expect(alert).toHaveProperty("ts");
  });

  it("should truncate long titles to 200 characters", () => {
    const alert = buildAlert({
      severity: "low",
      category: "emotion",
      title: "A".repeat(300),
      message: "test",
    });
    expect(alert.title.length).toBeLessThanOrEqual(200);
  });

  it("should truncate long messages to 1000 characters", () => {
    const alert = buildAlert({
      severity: "low",
      category: "emotion",
      title: "test",
      message: "B".repeat(1500),
    });
    expect(alert.message.length).toBeLessThanOrEqual(1000);
  });

  it("should include faceId when provided", () => {
    const alert = buildAlert({
      severity: "medium",
      category: "deepfake",
      title: "Face Alert",
      message: "test",
      faceId: 2,
    });
    expect(alert).toHaveProperty("faceId", 2);
  });

  it("should include participantName when provided", () => {
    const alert = buildAlert({
      severity: "medium",
      category: "deepfake",
      title: "Named Alert",
      message: "test",
      participantName: "Alice",
    });
    expect(alert).toHaveProperty("participantName", "Alice");
  });

  it("should default title to 'Alert' when title is not a string", () => {
    const alert = buildAlert({
      severity: "low",
      category: "emotion",
      title: 12345,
      message: "test",
    });
    expect(alert.title).toBe("Alert");
  });
});

/* ------------------------------------------------------------------ */
/*  evaluateVisual                                                     */
/* ------------------------------------------------------------------ */

describe("AlertFusionEngine.evaluateVisual", () => {
  let engine;

  beforeEach(() => {
    engine = new AlertFusionEngine();
  });

  const makeSession = (overrides = {}) => ({
    sessionId: "test-session",
    meetingTypeSelected: "business",
    metrics: {},
    ...overrides,
  });

  const makeResult = (overrides = {}) => ({
    aggregated: {
      deepfake: {
        authenticityScore: 0.95,
        model: "TestModel",
        riskLevel: "low",
      },
      emotion: {
        label: "Neutral",
        confidence: 0.7,
        scores: { Neutral: 0.7, Happy: 0.1, Angry: 0.05, Fear: 0.05, Surprise: 0.05, Sad: 0.05 },
      },
      trustScore: 0.9,
      ...overrides,
    },
  });

  it("should return empty array for a normal (safe) result", () => {
    const alerts = engine.evaluateVisual(makeSession(), makeResult());
    expect(alerts).toEqual([]);
  });

  it("should return empty array when aggregated is missing", () => {
    const alerts = engine.evaluateVisual(makeSession(), {});
    expect(alerts).toEqual([]);
  });

  it("should return empty array when result is null", () => {
    const alerts = engine.evaluateVisual(makeSession(), null);
    expect(alerts).toEqual([]);
  });

  describe("deepfake detection with consecutive-frame gating", () => {
    it("should NOT alert on a single low-score frame (consecutive gate)", () => {
      const session = makeSession();
      const result = makeResult({
        deepfake: { authenticityScore: 0.30, model: "TestModel", riskLevel: "high" },
      });

      // Only 1 frame — below the MIN_CONSECUTIVE_LOW (3) threshold
      const alerts = engine.evaluateVisual(session, result);
      expect(alerts).toHaveLength(0);
    });

    it("should alert after 3+ consecutive low-score frames (critical deepfake)", () => {
      const session = makeSession();
      const result = makeResult({
        deepfake: { authenticityScore: 0.30, model: "TestModel", riskLevel: "high" },
      });

      // Feed 3 consecutive low frames
      engine.evaluateVisual(session, result);
      engine.evaluateVisual(session, result);
      const alerts = engine.evaluateVisual(session, result);

      expect(alerts.length).toBeGreaterThanOrEqual(1);
      const deepfakeAlert = alerts.find((a) => a.category === "deepfake");
      expect(deepfakeAlert).toBeDefined();
      expect(deepfakeAlert.severity).toBe("critical");
      expect(deepfakeAlert.title).toMatch(/manipulation/i);
    });

    it("should emit high-severity alert for medium deepfake risk after consecutive frames", () => {
      const session = makeSession();
      // Score between high threshold (0.40) and medium threshold (0.70)
      const result = makeResult({
        deepfake: { authenticityScore: 0.55, model: "TestModel", riskLevel: "medium" },
      });

      engine.evaluateVisual(session, result);
      engine.evaluateVisual(session, result);
      const alerts = engine.evaluateVisual(session, result);

      expect(alerts.length).toBeGreaterThanOrEqual(1);
      const deepfakeAlert = alerts.find((a) => a.category === "deepfake");
      expect(deepfakeAlert).toBeDefined();
      expect(deepfakeAlert.severity).toBe("high");
    });

    it("should reset consecutive counter when a high-score frame arrives", () => {
      const session = makeSession();
      const lowResult = makeResult({
        deepfake: { authenticityScore: 0.30, model: "TestModel", riskLevel: "high" },
      });
      const goodResult = makeResult({
        deepfake: { authenticityScore: 0.95, model: "TestModel", riskLevel: "low" },
      });

      // Two low frames then one good frame resets counter
      engine.evaluateVisual(session, lowResult);
      engine.evaluateVisual(session, lowResult);
      engine.evaluateVisual(session, goodResult); // resets
      const alerts = engine.evaluateVisual(session, lowResult); // only 1 consecutive now
      expect(alerts).toHaveLength(0);
    });
  });

  describe("emotion-based alerts", () => {
    it("should alert on high anger (confidence > angerHigh threshold)", () => {
      const session = makeSession();
      const result = makeResult({
        emotion: { label: "Angry", confidence: 0.92, scores: { Angry: 0.92 } },
      });

      const alerts = engine.evaluateVisual(session, result);
      const angerAlert = alerts.find((a) => a.category === "altercation");
      expect(angerAlert).toBeDefined();
      expect(angerAlert.severity).toBe("medium");
      expect(angerAlert.title).toMatch(/aggression/i);
    });

    it("should emit low-severity for moderate anger (between angerMedium and angerHigh)", () => {
      const session = makeSession();
      const result = makeResult({
        emotion: { label: "Angry", confidence: 0.85, scores: { Angry: 0.85 } },
      });

      const alerts = engine.evaluateVisual(session, result);
      const angerAlert = alerts.find((a) => a.category === "emotion");
      expect(angerAlert).toBeDefined();
      expect(angerAlert.severity).toBe("low");
    });

    it("should NOT alert on anger below angerMedium threshold", () => {
      const session = makeSession();
      const result = makeResult({
        emotion: { label: "Angry", confidence: 0.50, scores: { Angry: 0.50 } },
      });

      const alerts = engine.evaluateVisual(session, result);
      const angerAlert = alerts.find(
        (a) => a.category === "altercation" || a.category === "emotion"
      );
      expect(angerAlert).toBeUndefined();
    });

    it("should NOT alert on anger with confidence below 0.40 (noise filter)", () => {
      const session = makeSession();
      const result = makeResult({
        emotion: { label: "Angry", confidence: 0.35, scores: { Angry: 0.35 } },
      });

      const alerts = engine.evaluateVisual(session, result);
      expect(alerts).toHaveLength(0);
    });
  });

  describe("fear in official meeting", () => {
    it("should alert on fear with high confidence in official meetings", () => {
      const session = makeSession({ meetingTypeSelected: "official" });
      const result = makeResult({
        emotion: { label: "Fear", confidence: 0.75, scores: { Fear: 0.75 } },
      });

      const alerts = engine.evaluateVisual(session, result);
      const fearAlert = alerts.find(
        (a) => a.category === "emotion" && a.title.match(/distress/i)
      );
      expect(fearAlert).toBeDefined();
      expect(fearAlert.severity).toBe("low");
    });

    it("should NOT alert on fear in non-official meetings", () => {
      const session = makeSession({ meetingTypeSelected: "friends" });
      const result = makeResult({
        emotion: { label: "Fear", confidence: 0.75, scores: { Fear: 0.75 } },
      });

      const alerts = engine.evaluateVisual(session, result);
      const fearAlert = alerts.find(
        (a) => a.category === "emotion" && a.title.match(/distress/i)
      );
      expect(fearAlert).toBeUndefined();
    });

    it("should NOT alert on low-confidence fear in official meetings", () => {
      const session = makeSession({ meetingTypeSelected: "official" });
      const result = makeResult({
        emotion: { label: "Fear", confidence: 0.45, scores: { Fear: 0.45 } },
      });

      const alerts = engine.evaluateVisual(session, result);
      const fearAlert = alerts.find(
        (a) => a.category === "emotion" && a.title.match(/distress/i)
      );
      expect(fearAlert).toBeUndefined();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Deduplication via cooldown                                         */
/* ------------------------------------------------------------------ */

describe("AlertFusionEngine — cooldown / deduplication", () => {
  let engine;

  beforeEach(() => {
    engine = new AlertFusionEngine();
  });

  it("should suppress duplicate alerts within the cooldown window", () => {
    const session = {
      sessionId: "s1",
      meetingTypeSelected: "business",
      metrics: {},
    };
    const result = {
      aggregated: {
        emotion: { label: "Angry", confidence: 0.95, scores: { Angry: 0.95 } },
        deepfake: { authenticityScore: 0.95, riskLevel: "low" },
      },
    };

    const first = engine.evaluateVisual(session, result);
    const second = engine.evaluateVisual(session, result);

    expect(first.length).toBeGreaterThanOrEqual(1);
    // Second call should be suppressed by cooldown
    expect(second).toHaveLength(0);
  });

  it("should allow alerts again after cooldown reset", () => {
    const session = {
      sessionId: "s2",
      meetingTypeSelected: "business",
      metrics: {},
    };
    const result = {
      aggregated: {
        emotion: { label: "Angry", confidence: 0.95, scores: { Angry: 0.95 } },
        deepfake: { authenticityScore: 0.95, riskLevel: "low" },
      },
    };

    const first = engine.evaluateVisual(session, result);
    expect(first.length).toBeGreaterThanOrEqual(1);

    engine.reset();

    const afterReset = engine.evaluateVisual(session, result);
    expect(afterReset.length).toBeGreaterThanOrEqual(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Severity mapping                                                   */
/* ------------------------------------------------------------------ */

describe("AlertFusionEngine — severity levels", () => {
  it("should use correct threshold values", () => {
    expect(THRESHOLDS.deepfake.medium).toBe(0.70);
    expect(THRESHOLDS.deepfake.high).toBe(0.40);
    expect(THRESHOLDS.emotion.angerMedium).toBe(0.80);
    expect(THRESHOLDS.emotion.angerHigh).toBe(0.90);
  });
});

/* ------------------------------------------------------------------ */
/*  fuseWithTranscript                                                 */
/* ------------------------------------------------------------------ */

describe("AlertFusionEngine.fuseWithTranscript", () => {
  let engine;

  beforeEach(() => {
    engine = new AlertFusionEngine();
  });

  it("should escalate fraud alerts when deepfake risk is elevated", () => {
    const session = {
      metrics: { deepfake: { riskLevel: "high" } },
    };
    const fraudAlerts = [
      {
        alertId: "a1",
        severity: "high",
        category: "fraud",
        title: "Financial Fraud Indicator",
        message: "Detected wire transfer keywords",
        source: { model: "fraudDetector", confidence: 0.8 },
        ts: new Date().toISOString(),
      },
    ];

    const fused = engine.fuseWithTranscript(session, fraudAlerts);
    expect(fused).toHaveLength(1);
    expect(fused[0].severity).toBe("critical");
    expect(fused[0].message).toMatch(/escalated/i);
  });

  it("should NOT escalate when deepfake risk is low", () => {
    const session = {
      metrics: { deepfake: { riskLevel: "low" } },
    };
    const fraudAlerts = [
      {
        alertId: "a2",
        severity: "high",
        category: "fraud",
        title: "Test",
        message: "test",
        source: { model: "fraudDetector", confidence: 0.8 },
        ts: new Date().toISOString(),
      },
    ];

    const fused = engine.fuseWithTranscript(session, fraudAlerts);
    expect(fused[0].severity).toBe("high"); // unchanged
  });

  it("should NOT escalate alerts that are already critical", () => {
    const session = {
      metrics: { deepfake: { riskLevel: "high" } },
    };
    const fraudAlerts = [
      {
        alertId: "a3",
        severity: "critical",
        category: "fraud",
        title: "Already Critical",
        message: "test",
        source: { model: "fraudDetector", confidence: 0.9 },
        ts: new Date().toISOString(),
      },
    ];

    const fused = engine.fuseWithTranscript(session, fraudAlerts);
    expect(fused[0].severity).toBe("critical"); // stays critical, not double-escalated
  });
});
