const { Router } = require("express");
const { checkHealth: checkAiHealth } = require("../lib/aiClient");
const persistence = require("../lib/persistence");
const { getLatestSessionForUser } = require("../services/sessionManager");

const router = Router();

router.get("/", (req, res) => {
  res.json({ status: "RealSync backend running" });
});

router.get("/api/health", async (req, res) => {
  const checks = {};

  // Check AI service reachability
  try {
    const aiHealth = await checkAiHealth();
    checks.ai = aiHealth.ok ? "ok" : `unavailable: ${aiHealth.reason || "unknown"}`;
  } catch (err) {
    checks.ai = `error: ${err?.message ?? err}`;
  }

  // Check Supabase client exists
  checks.supabase = persistence.isAvailable?.() !== false ? "ok" : "unavailable";

  const allOk = checks.ai === "ok" && checks.supabase === "ok";

  res.status(allOk ? 200 : 503).json({
    ok: allOk,
    status: allOk ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
  });
});

router.get("/api/models", (req, res) => {
  const latestSession = getLatestSessionForUser(req.userId);
  const usingExternal = Boolean(latestSession?.source === "external");
  res.json({
    mode: usingExternal ? "external" : "simulated",
    updatedAt: latestSession?.metrics?.timestamp ?? null,
    models: {
      emotion: {
        name: "FER2013 / AffectNet CNN",
        status: usingExternal ? "external" : "simulated",
      },
      deepfake: {
        name: "XceptionNet + EfficientNet",
        status: usingExternal ? "external" : "simulated",
      },
      transcript: {
        name: "GCP Streaming Speech-to-Text",
        status: process.env.REALSYNC_USE_GCP_STT === "1" ? "external" : "stub",
      },
    },
  });
});

module.exports = router;
