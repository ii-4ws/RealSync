/**
 * Session endpoint tests.
 *
 * Covers:
 *   POST /api/sessions       — create session (valid, missing title,
 *                               invalid meetingType, Zoom URL validation)
 *   GET  /api/sessions       — list sessions
 *   POST /api/sessions/:id/stop — stop a session
 *   GET  /api/sessions/:id/metrics — get session metrics
 *   GET  /api/metrics         — global metrics endpoint
 */

const request = require("supertest");
const { buildApp, sessions } = require("./testApp");

let app;

beforeAll(() => {
  app = buildApp();
});

afterEach(() => {
  // Clean up sessions between tests to avoid cross-contamination
  sessions.clear();
});

/* ------------------------------------------------------------------ */
/*  POST /api/sessions                                                 */
/* ------------------------------------------------------------------ */

describe("POST /api/sessions", () => {
  describe("valid creation", () => {
    it("should create a session with valid title and meetingType", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({ title: "Test Meeting", meetingType: "business" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sessionId");
      expect(typeof res.body.sessionId).toBe("string");
      expect(res.body.sessionId.length).toBeGreaterThan(0);
      expect(res.body).toHaveProperty("ingestWsUrl");
      expect(res.body).toHaveProperty("subscribeWsUrl");
      expect(res.body.ingestWsUrl).toContain(res.body.sessionId);
      expect(res.body.subscribeWsUrl).toContain(res.body.sessionId);
    });

    it("should accept all valid meeting types", async () => {
      for (const type of ["official", "business", "friends"]) {
        const res = await request(app)
          .post("/api/sessions")
          .send({ title: `${type} meeting`, meetingType: type });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("sessionId");
      }
    });

    it("should store the session in memory", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({ title: "Stored Session", meetingType: "official" });

      expect(sessions.has(res.body.sessionId)).toBe(true);
      const session = sessions.get(res.body.sessionId);
      expect(session.title).toBe("Stored Session");
      expect(session.meetingTypeSelected).toBe("official");
      expect(session.endedAt).toBeNull();
    });

    it("should accept a valid Zoom meeting URL", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({
          title: "Zoom Call",
          meetingType: "business",
          meetingUrl: "https://us05web.zoom.us/j/1234567890",
        });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sessionId");
    });
  });

  describe("missing title", () => {
    it("should return 400 when title is missing", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({ meetingType: "business" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error).toMatch(/title/i);
    });

    it("should return 400 when title is empty string", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({ title: "", meetingType: "business" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/title/i);
    });

    it("should return 400 when title is whitespace only", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({ title: "   ", meetingType: "business" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/title/i);
    });

    it("should return 400 when title exceeds 500 characters", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({ title: "a".repeat(501), meetingType: "business" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/500/);
    });
  });

  describe("invalid meetingType", () => {
    it("should return 400 when meetingType is missing", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({ title: "My Meeting" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error).toMatch(/meetingType/i);
    });

    it("should return 400 when meetingType is invalid", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({ title: "My Meeting", meetingType: "informal" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/meetingType/i);
    });

    it("should list allowed types in error message", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({ title: "My Meeting", meetingType: "invalid" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("official");
      expect(res.body.error).toContain("business");
      expect(res.body.error).toContain("friends");
    });
  });

  describe("Zoom URL validation", () => {
    it("should reject non-Zoom URLs", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({
          title: "Bad URL",
          meetingType: "business",
          meetingUrl: "https://meet.google.com/abc-defg-hij",
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Zoom/i);
    });

    it("should reject HTTP (non-HTTPS) Zoom URLs", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({
          title: "HTTP Zoom",
          meetingType: "business",
          meetingUrl: "http://zoom.us/j/1234567890",
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Zoom/i);
    });

    it("should reject completely invalid URLs", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({
          title: "Invalid URL",
          meetingType: "business",
          meetingUrl: "not-a-url",
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Zoom/i);
    });

    it("should accept zoom.com URLs", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({
          title: "Zoom.com URL",
          meetingType: "business",
          meetingUrl: "https://zoom.com/j/1234567890",
        });
      expect(res.status).toBe(200);
    });

    it("should accept subdomain zoom.us URLs", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({
          title: "Subdomain Zoom",
          meetingType: "business",
          meetingUrl: "https://us02web.zoom.us/j/1234567890?pwd=abc123",
        });
      expect(res.status).toBe(200);
    });

    it("should allow session creation without meetingUrl", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({ title: "No URL", meetingType: "friends" });
      expect(res.status).toBe(200);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/sessions                                                  */
/* ------------------------------------------------------------------ */

describe("GET /api/sessions", () => {
  it("should return empty array when no sessions exist", async () => {
    const res = await request(app).get("/api/sessions");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("sessions");
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions).toHaveLength(0);
  });

  it("should return created sessions", async () => {
    // Create two sessions
    await request(app)
      .post("/api/sessions")
      .send({ title: "Session A", meetingType: "business" });
    await request(app)
      .post("/api/sessions")
      .send({ title: "Session B", meetingType: "official" });

    const res = await request(app).get("/api/sessions");
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(2);
  });

  it("should return sessions sorted by createdAt descending", async () => {
    await request(app)
      .post("/api/sessions")
      .send({ title: "First", meetingType: "business" });

    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));

    await request(app)
      .post("/api/sessions")
      .send({ title: "Second", meetingType: "official" });

    const res = await request(app).get("/api/sessions");
    expect(res.body.sessions[0].title).toBe("Second");
    expect(res.body.sessions[1].title).toBe("First");
  });

  it("should include expected fields in each session", async () => {
    await request(app)
      .post("/api/sessions")
      .send({ title: "Fields Check", meetingType: "friends" });

    const res = await request(app).get("/api/sessions");
    const session = res.body.sessions[0];

    expect(session).toHaveProperty("id");
    expect(session).toHaveProperty("title", "Fields Check");
    expect(session).toHaveProperty("createdAt");
    expect(session).toHaveProperty("endedAt", null);
    expect(session).toHaveProperty("meetingType", "friends");
    expect(session).toHaveProperty("botStatus", "idle");
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/sessions/:id/stop                                        */
/* ------------------------------------------------------------------ */

describe("POST /api/sessions/:id/stop", () => {
  it("should stop an active session", async () => {
    const createRes = await request(app)
      .post("/api/sessions")
      .send({ title: "To Stop", meetingType: "business" });
    const { sessionId } = createRes.body;

    const stopRes = await request(app).post(`/api/sessions/${sessionId}/stop`);
    expect(stopRes.status).toBe(200);
    expect(stopRes.body).toHaveProperty("ok", true);
    expect(stopRes.body).toHaveProperty("endedAt");
    expect(typeof stopRes.body.endedAt).toBe("string");
  });

  it("should mark session as ended in memory", async () => {
    const createRes = await request(app)
      .post("/api/sessions")
      .send({ title: "End Me", meetingType: "official" });
    const { sessionId } = createRes.body;

    await request(app).post(`/api/sessions/${sessionId}/stop`);

    const session = sessions.get(sessionId);
    expect(session.endedAt).not.toBeNull();
    expect(session.botStatus).toBe("disconnected");
  });

  it("should return 404 for nonexistent session", async () => {
    const res = await request(app).post("/api/sessions/nonexistent-id/stop");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/sessions/:id/metrics                                      */
/* ------------------------------------------------------------------ */

describe("GET /api/sessions/:id/metrics", () => {
  it("should return metrics for an active session", async () => {
    const createRes = await request(app)
      .post("/api/sessions")
      .send({ title: "Metrics Session", meetingType: "business" });
    const { sessionId } = createRes.body;

    const res = await request(app).get(`/api/sessions/${sessionId}/metrics`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("emotion");
    expect(res.body).toHaveProperty("deepfake");
    expect(res.body).toHaveProperty("trustScore");
    expect(res.body).toHaveProperty("confidenceLayers");
    expect(res.body).toHaveProperty("timestamp");
  });

  it("should include emotion label and scores", async () => {
    const createRes = await request(app)
      .post("/api/sessions")
      .send({ title: "Emotion Check", meetingType: "business" });
    const { sessionId } = createRes.body;

    const res = await request(app).get(`/api/sessions/${sessionId}/metrics`);
    expect(res.body.emotion).toHaveProperty("label");
    expect(res.body.emotion).toHaveProperty("confidence");
    expect(res.body.emotion).toHaveProperty("scores");
    expect(typeof res.body.emotion.confidence).toBe("number");
  });

  it("should include deepfake analysis fields", async () => {
    const createRes = await request(app)
      .post("/api/sessions")
      .send({ title: "Deepfake Check", meetingType: "official" });
    const { sessionId } = createRes.body;

    const res = await request(app).get(`/api/sessions/${sessionId}/metrics`);
    expect(res.body.deepfake).toHaveProperty("authenticityScore");
    expect(res.body.deepfake).toHaveProperty("riskLevel");
    expect(["low", "medium", "high"]).toContain(res.body.deepfake.riskLevel);
  });

  it("should return 404 for nonexistent session", async () => {
    const res = await request(app).get("/api/sessions/fake-id/metrics");
    expect(res.status).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/metrics (global, requires auth header)                    */
/* ------------------------------------------------------------------ */

describe("GET /api/metrics", () => {
  it("should return 401 when no user ID is provided", async () => {
    const res = await request(app).get("/api/metrics");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("should return simulated metrics when user has no sessions", async () => {
    const res = await request(app)
      .get("/api/metrics")
      .set("x-test-user-id", "test-user-123");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("emotion");
    expect(res.body).toHaveProperty("deepfake");
    expect(res.body).toHaveProperty("trustScore");
  });
});
