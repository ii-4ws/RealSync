const { Router } = require("express");
const { requireSessionOwner } = require("../lib/auth");
const botManager = require("../bot/botManager");
const log = require("../lib/logger");
const { getSession, rehydrateSession, broadcastToSession, makeIso } = require("../services/sessionManager");
const { processIngestMessage } = require("../ws/ingest");

const router = Router();

/* ------------------------------------------------------------------ */
/*  POST /api/sessions/:id/join — start bot in meeting                 */
/* ------------------------------------------------------------------ */

router.post("/api/sessions/:id/join", requireSessionOwner(getSession, rehydrateSession), (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.endedAt) return res.status(410).json({ error: "Session has ended" });

  const { meetingUrl } = req.body ?? {};
  const displayName = typeof req.body.displayName === "string" ? req.body.displayName.trim().slice(0, 100) : "RealSync Bot";
  if (!meetingUrl || typeof meetingUrl !== "string") {
    return res.status(400).json({ error: "meetingUrl is required" });
  }

  // H4: Validate URL — allow https://*.zoom.us and https://*.zoom.com
  try {
    const u = new URL(meetingUrl);
    const isZoom = u.hostname.endsWith(".zoom.us") || u.hostname.endsWith(".zoom.com")
      || u.hostname === "zoom.us" || u.hostname === "zoom.com";
    if (u.protocol !== "https:" || !isZoom) throw new Error("Not a Zoom URL");
  } catch {
    return res.status(400).json({ error: "meetingUrl must be a valid Zoom URL (https://...zoom.us or zoom.com)" });
  }

  session.meetingUrl = meetingUrl;
  session.botStatus = "joining";
  session.source = "external"; // prevent simulated metrics from overwriting real bot data
  session.botDisplayName = displayName || "RealSync Bot";

  const result = botManager.startBot({
    sessionId: session.id,
    meetingUrl,
    displayName: displayName || "RealSync Bot",
    onIngestMessage: (message) => {
      processIngestMessage(session, message);
    },
  });

  // Broadcast joining status to any connected subscribers
  broadcastToSession(session.id, {
    type: "sourceStatus",
    status: "joining",
    streams: { audio: false, video: false, captions: false },
    ts: makeIso(),
  });

  return res.json({
    status: result.status,
    botId: result.botId,
    sessionId: session.id,
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/sessions/:id/leave — stop bot                            */
/* ------------------------------------------------------------------ */

router.post("/api/sessions/:id/leave", requireSessionOwner(getSession, rehydrateSession), (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const result = botManager.stopBot(session.id, (message) => {
    if (message.type === "source_status") {
      session.botStatus = message.status;
      session.botStreams = message.streams || {};
      broadcastToSession(session.id, {
        type: "sourceStatus",
        status: session.botStatus,
        streams: session.botStreams,
        ts: message.ts || makeIso(),
      });
    }
  });

  session.botStatus = "disconnected";
  return res.json({ ok: result.ok, sessionId: session.id });
});

module.exports = router;
