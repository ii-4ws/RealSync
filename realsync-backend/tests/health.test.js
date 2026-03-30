/**
 * Health & info endpoint tests.
 *
 * Covers:
 *   GET /           — root status
 *   GET /api/health — health check (AI + Supabase status)
 *   GET /api/models — model info endpoint
 */

const request = require("supertest");
const { buildApp } = require("./testApp");

let app;

beforeAll(() => {
  app = buildApp();
});

/* ------------------------------------------------------------------ */
/*  GET /                                                              */
/* ------------------------------------------------------------------ */

describe("GET /", () => {
  it("should return 200 with status message", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toMatch(/running/i);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/health                                                    */
/* ------------------------------------------------------------------ */

describe("GET /api/health", () => {
  it("should return a JSON response with ok, timestamp, and checks fields", async () => {
    const res = await request(app).get("/api/health");
    // AI is unreachable in test, Supabase is disabled => 503
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty("ok");
    expect(typeof res.body.ok).toBe("boolean");
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("checks");
    expect(res.body.checks).toHaveProperty("ai");
    expect(res.body.checks).toHaveProperty("supabase");
  });

  it("should report supabase as unavailable when env vars are cleared", async () => {
    const res = await request(app).get("/api/health");
    // Supabase URL/key are deleted in setup.js => unavailable
    expect(res.body.checks.supabase).toBe("unavailable");
  });

  it("should report AI as unavailable when AI_SERVICE_URL is unreachable", async () => {
    const res = await request(app).get("/api/health");
    expect(res.body.checks.ai).toMatch(/unavailable|error/);
    expect(res.body.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/models                                                    */
/* ------------------------------------------------------------------ */

describe("GET /api/models", () => {
  it("should return model info in simulated mode by default", async () => {
    const res = await request(app).get("/api/models");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("mode", "simulated");
    expect(res.body).toHaveProperty("models");
    expect(res.body.models).toHaveProperty("emotion");
    expect(res.body.models).toHaveProperty("deepfake");
    expect(res.body.models).toHaveProperty("transcript");
  });

  it("should include name and status for each model", async () => {
    const res = await request(app).get("/api/models");
    const { emotion, deepfake, transcript } = res.body.models;

    expect(emotion).toHaveProperty("name");
    expect(emotion).toHaveProperty("status", "simulated");

    expect(deepfake).toHaveProperty("name");
    expect(deepfake).toHaveProperty("status", "simulated");

    expect(transcript).toHaveProperty("name");
    // GCP STT not enabled in test
    expect(transcript).toHaveProperty("status", "stub");
  });

  it("should return updatedAt as null when no session exists", async () => {
    const res = await request(app).get("/api/models");
    expect(res.body.updatedAt).toBeNull();
  });
});
