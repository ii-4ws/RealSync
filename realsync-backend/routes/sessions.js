const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { MEETING_TYPES } = require("../lib/suggestions");
const { requireSessionOwner } = require("../lib/auth");
const persistence = require("../lib/persistence");
const log = require("../lib/logger");
const botManager = require("../bot/botManager");
const {
  sessions,
  createSession,
  getSession,
  rehydrateSession,
  broadcastToSession,
  deriveMetrics,
  generateSimulatedMetrics,
  getLatestSessionForUser,
  makeIso,
} = require("../services/sessionManager");
const { frameInFlight } = require("../services/frameHandler");
const { processIngestMessage } = require("../ws/ingest");

const router = Router();

/* ------------------------------------------------------------------ */
/*  Per-route rate limiters                                             */
/* ------------------------------------------------------------------ */

const sessionCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many session creation requests." },
});

/* ------------------------------------------------------------------ */
/*  POST /api/sessions — create a session                              */
/* ------------------------------------------------------------------ */

router.post("/api/sessions", sessionCreateLimiter, (req, res) => {
  const { title, meetingType, meetingUrl, scheduledAt, displayName } = req.body ?? {};
  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  if (title.length > 500) {
    return res.status(400).json({ error: "title must be 500 characters or fewer" });
  }
  if (!meetingType || typeof meetingType !== "string" || !MEETING_TYPES.includes(meetingType)) {
    return res.status(400).json({ error: `meetingType must be one of: ${MEETING_TYPES.join(", ")}` });
  }
  // C1: Validate meeting URL — only allow Zoom domains (matches /join endpoint)
  if (meetingUrl) {
    try {
      const u = new URL(meetingUrl);
      const isZoom = u.hostname.endsWith(".zoom.us") || u.hostname.endsWith(".zoom.com")
        || u.hostname === "zoom.us" || u.hostname === "zoom.com";
      if (u.protocol !== "https:" || !isZoom) throw new Error("Not a Zoom URL");
    } catch {
      return res.status(400).json({ error: "meetingUrl must be a valid Zoom URL (https://...zoom.us or zoom.com)" });
    }
  }

  const session = createSession({ title, meetingType, meetingUrl: meetingUrl || null, userId: req.userId || null });

  // Validate and store scheduledAt if provided
  if (scheduledAt !== undefined) {
    if (typeof scheduledAt !== "string") {
      return res.status(400).json({ error: "scheduledAt must be an ISO date string" });
    }
    const ts = new Date(scheduledAt).getTime();
    if (!Number.isFinite(ts)) {
      return res.status(400).json({ error: "scheduledAt is not a valid date" });
    }
    session.scheduledAt = scheduledAt;
  }

  // I6: Wire up backend-side bot scheduling if scheduledAt is in the future
  if (scheduledAt && session.meetingUrl) {
    const delay = new Date(scheduledAt).getTime() - Date.now();
    if (delay > 0) {
      botManager.scheduleBot({
        sessionId: session.id,
        meetingUrl: session.meetingUrl,
        displayName: typeof displayName === "string" ? displayName.slice(0, 100) : undefined,
        scheduledAt,
        onIngestMessage: (message) => {
          processIngestMessage(session, message);
        },
      });
    }
  }

  return res.json({
    sessionId: session.id,
    ingestWsUrl: `/ws/ingest?sessionId=${session.id}`,
    subscribeWsUrl: `/ws?sessionId=${session.id}`,
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/sessions — list sessions                                  */
/* ------------------------------------------------------------------ */

router.get("/api/sessions", async (req, res) => {
  // In-memory sessions (currently active)
  const allSessions = Array.from(sessions.values());
  const filtered = req.userId
    ? allSessions.filter((s) => s.userId === req.userId)
    : allSessions.filter((s) => !s.userId);

  const inMemoryList = filtered.map((s) => ({
    id: s.id,
    title: s.title,
    createdAt: s.createdAt,
    endedAt: s.endedAt,
    meetingType: s.meetingTypeSelected,
    meetingUrl: s.meetingUrl || null,
    scheduledAt: s.scheduledAt || null,
    botStatus: s.botStatus || "idle",
  }));

  // Bug #5: Also fetch historical sessions from Supabase so sessions
  // survive backend restarts. Merge, deduplicating by ID.
  let dbSessions = [];
  if (req.userId) {
    dbSessions = await persistence.getUserSessions(req.userId);
  }

  const inMemoryIds = new Set(inMemoryList.map((s) => s.id));
  const dbList = dbSessions
    .filter((s) => !inMemoryIds.has(s.id))
    .map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: s.created_at,
      endedAt: s.ended_at || null,
      meetingType: s.meeting_type,
      meetingUrl: s.meeting_url || null,
      scheduledAt: null,
      botStatus: s.bot_status || "idle",
    }));

  const merged = [...inMemoryList, ...dbList].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  res.json({ sessions: merged });
});

/* ------------------------------------------------------------------ */
/*  GET /api/sessions/:id/metrics                                      */
/* ------------------------------------------------------------------ */

router.get("/api/sessions/:id/metrics", requireSessionOwner(getSession, rehydrateSession), (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "not found" });
  return res.json(session.metrics);
});

/* ------------------------------------------------------------------ */
/*  POST /api/sessions/:id/metrics                                     */
/* ------------------------------------------------------------------ */

router.post("/api/sessions/:id/metrics", requireSessionOwner(getSession, rehydrateSession), (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "not found" });
  if (session.endedAt) return res.status(410).json({ error: "Session has ended" });

  const payload = req.body;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid payload." });
  }

  const requiredFields = ["emotion", "deepfake"];
  const missing = requiredFields.filter((field) => !payload[field]);
  if (missing.length > 0) {
    return res.status(400).json({
      error: `Missing required fields: ${missing.join(", ")}`,
    });
  }

  session.metrics = {
    ...deriveMetrics(payload),
    timestamp: payload.timestamp ?? makeIso(),
    source: "external",
  };
  session.source = "external";

  broadcastToSession(session.id, { type: "metrics", data: session.metrics });
  return res.json({ status: "ok", storedAt: session.metrics.timestamp });
});

/* ------------------------------------------------------------------ */
/*  POST /api/sessions/:id/stop                                        */
/* ------------------------------------------------------------------ */

router.post("/api/sessions/:id/stop", requireSessionOwner(getSession, rehydrateSession), async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "not found" });

  session.endedAt = makeIso();
  session.stt?.end?.();
  session.stt = null;
  frameInFlight.delete(session.id);

  // Stop bot if running
  botManager.stopBot(session.id);
  session.botStatus = "disconnected";

  // Persist session end
  persistence.endSession(session.id).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });

  // Generate post-meeting report (non-blocking)
  persistence.generateReport(session.id).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });

  return res.json({ ok: true, endedAt: session.endedAt });
});

/* ------------------------------------------------------------------ */
/*  GET /api/metrics (global, user-scoped)                             */
/* ------------------------------------------------------------------ */

router.get("/api/metrics", (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const latestSession = getLatestSessionForUser(req.userId);
  if (latestSession) {
    return res.json(latestSession.metrics);
  }
  return res.json(generateSimulatedMetrics());
});

/* ------------------------------------------------------------------ */
/*  POST /api/metrics (global, user-scoped)                            */
/* ------------------------------------------------------------------ */

router.post("/api/metrics", (req, res) => {
  // H1: Require authentication
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const payload = req.body;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid payload." });
  }

  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : null;

  const requiredFields = ["emotion", "deepfake"];
  const missing = requiredFields.filter((field) => !payload[field]);
  if (missing.length > 0) {
    return res.status(400).json({
      error: `Missing required fields: ${missing.join(", ")}`,
    });
  }

  // Backwards-compat: update a specific session if provided, else use latest for this user.
  const session =
    (sessionId && sessions.get(sessionId)) ||
    getLatestSessionForUser(req.userId);

  if (!session) {
    return res.status(404).json({ error: "No active session. Create one first via POST /api/sessions." });
  }
  if (session.endedAt) return res.status(410).json({ error: "Session has ended" });

  // Verify ownership — always check, no null-bypass
  if (session.userId !== req.userId) {
    return res.status(403).json({ error: "Access denied" });
  }

  session.metrics = {
    ...deriveMetrics(payload),
    timestamp: payload.timestamp ?? makeIso(),
    source: "external",
  };
  session.source = "external";

  broadcastToSession(session.id, { type: "metrics", data: session.metrics });
  return res.json({ status: "ok", storedAt: session.metrics.timestamp });
});

module.exports = router;
