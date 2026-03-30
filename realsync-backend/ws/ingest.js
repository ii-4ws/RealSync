const WebSocket = require("ws");
const { authenticateWsToken } = require("../lib/auth");
const { MEETING_TYPES } = require("../lib/suggestions");
const persistence = require("../lib/persistence");
const log = require("../lib/logger");
const { getSession, broadcastToSession, makeIso } = require("../services/sessionManager");
const { handleFrame } = require("../services/frameHandler");
const { handleTranscript } = require("../services/transcriptHandler");
const { processAudioChunk } = require("../services/audioHandler");

/* ------------------------------------------------------------------ */
/*  Shared ingest message processor                                     */
/*  Used by both the WS handler and bot callback (scheduleBot).        */
/* ------------------------------------------------------------------ */

/**
 * Process a single ingest message for a session.
 * Handles: frame, caption, source_status, participants, bot_fallback, audio_pcm.
 */
function processIngestMessage(session, message) {
  // I4: Ignore messages for ended sessions
  if (session.endedAt) return;

  if (message.type === "frame") {
    // Validate frame size (same as WS ingest handler)
    if (typeof message.dataB64 === "string" && message.dataB64.length > 2 * 1024 * 1024) return;
    handleFrame(session, message).catch((err) => {
      log.warn("ingest", `Frame analysis error for session ${session.id}: ${err?.message ?? err}`);
    });

  } else if (message.type === "caption") {
    const text = typeof message.text === "string" ? message.text : "";
    if (!text.trim() || text.length > 1000) return;
    const speaker = typeof message.speaker === "string" ? message.speaker.trim().slice(0, 100) : "unknown";
    handleTranscript(session, {
      text,
      isFinal: true,
      confidence: 0.95,
      ts: message.ts || makeIso(),
      speaker,
      source: "caption",
    });

  } else if (message.type === "source_status") {
    session.botStatus = message.status || "connected";
    session.botStreams = message.streams || { audio: false, video: false, captions: false };
    // Mark source as external when bot connects
    if (session.botStatus === "connected" || session.botStatus === "joining") {
      session.source = "external";
    }
    broadcastToSession(session.id, {
      type: "sourceStatus",
      status: session.botStatus,
      streams: session.botStreams,
      ts: message.ts || makeIso(),
    });
    persistence.updateBotStatus(session.id, session.botStatus).catch((err) => {
      log.warn("persistence", `updateBotStatus failed: ${err?.message ?? err}`);
    });

  } else if (message.type === "participants") {
    // Feature #16: Participant names from bot's panel scraper
    // Support both contract-compliant `participants` array and legacy `names` array
    const rawNames = Array.isArray(message.participants)
      ? message.participants.map((p) => (typeof p === "string" ? p : p?.name)).filter(Boolean)
      : message.names;
    if (!Array.isArray(rawNames)) return;
    const names = rawNames
      .slice(0, 20)
      .filter((n) => typeof n === "string" && n.trim().length > 0)
      .map((n) => n.trim().slice(0, 100));
    if (names.length === 0) return;

    const now = makeIso();
    names.forEach((name, index) => {
      const existing = session.participants.get(index);
      session.participants.set(index, { name, firstSeen: existing?.firstSeen || now });
    });

    const participantList = Array.from(session.participants.entries()).map(
      ([faceId, data]) => ({ faceId, name: data.name, firstSeen: data.firstSeen })
    );
    broadcastToSession(session.id, { type: "participants", participants: participantList, ts: now });

  } else if (message.type === "bot_fallback") {
    log.warn("ingest", `Bot fallback for session ${session.id}: ${message.reason} — ${message.message}`);
    session.source = "simulated";
    broadcastToSession(session.id, {
      type: "alert",
      alertId: `bot-fallback-${Date.now()}`,
      severity: "high",
      category: "system",
      title: "Bot Connection Failed",
      message: String(message.message || "Real bot could not join. Using simulated data — captions and analysis are NOT from the actual meeting.").slice(0, 500),
      recommendation: "Check the Zoom meeting URL and try again.",
      source: "system",
      ts: message.ts || makeIso(),
      sessionId: session.id,
    });

  } else if (message.type === "audio_pcm") {
    // Validate audio format (same strict check as WS ingest handler)
    if (message.sampleRate !== 16000 || message.channels !== 1) return;
    const dataB64 = message.dataB64;
    // #14: Validate audio payload size to prevent DoS via oversized chunks
    if (typeof dataB64 === "string" && dataB64.length > 512 * 1024) return;
    if (typeof dataB64 === "string" && dataB64) {
      processAudioChunk(session, dataB64);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  WebSocket ingest connection handler                                 */
/* ------------------------------------------------------------------ */

/**
 * Attach the ingest WebSocket connection handler to wssIngest.
 * The bot and other data sources connect here to push frames/audio/captions.
 */
function attachIngestHandler(wssIngest) {
  wssIngest.on("connection", async (socket, req) => {
    const url = new URL(req.url, "http://localhost");
    const sessionId = url.searchParams.get("sessionId");
    const session = getSession(sessionId);

    if (!session) {
      socket.close(1008, "Unknown session");
      return;
    }

    // M13: Reuse already-parsed URL instead of parsing again
    const ingestToken = url.searchParams.get("token");
    if (session.userId) {
      // C2: Auth timeout — prevent hanging if token validation stalls
      let wsUserId;
      try {
        wsUserId = await Promise.race([
          authenticateWsToken(ingestToken),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Auth timeout")), 10_000)),
        ]);
      } catch {
        socket.close(4003, "Access denied");
        return;
      }
      if (!wsUserId || wsUserId !== session.userId) {
        socket.close(4003, "Access denied");
        return;
      }
    }

    // B4: Reject second ingest socket if one is already OPEN for this session
    if (session._ingestSocket && session._ingestSocket.readyState === WebSocket.OPEN) {
      socket.close(4009, "Ingest socket already connected");
      return;
    }
    session._ingestSocket = socket;

    socket.on("close", () => {
      if (session._ingestSocket !== socket) return;
      session._ingestSocket = null;

      // Only act if session is still active (not already ended by user)
      if (session.endedAt) return;

      log.info("server", `Bot ingest socket closed for session ${session.id} — auto-ending session`);

      // Update bot status
      session.botStatus = "disconnected";
      session.botStreams = { audio: false, video: false, captions: false };

      // Broadcast status change
      broadcastToSession(session.id, {
        type: "sourceStatus",
        status: "disconnected",
        streams: session.botStreams,
        ts: makeIso(),
      });

      // Push alert notification
      const alertPayload = {
        type: "alert",
        alertId: `bot-disconnected-${Date.now()}`,
        severity: "high",
        category: "system",
        title: "Bot Disconnected",
        message: "The RealSync bot was disconnected from the Zoom meeting. The session has been automatically ended.",
        recommendation: "Start a new session if the meeting is still ongoing.",
        ts: makeIso(),
      };
      broadcastToSession(session.id, alertPayload);
      session.alerts.push(alertPayload);

      // Auto-end the session
      session.endedAt = makeIso();
      session.stt?.end?.();
      persistence.endSession(session.id).catch((err) => {
        log.warn("persistence", `endSession failed: ${err?.message ?? err}`);
      });
      persistence.generateReport(session.id).catch((err) => {
        log.warn("persistence", `generateReport failed: ${err?.message ?? err}`);
      });
    });

    // Ingest WS rate limiting: max 500 messages per 10-second window
    let ingestMsgCount = 0;
    const ingestRateLimitInterval = setInterval(() => { ingestMsgCount = 0; }, 10_000);
    socket.on("close", () => { clearInterval(ingestRateLimitInterval); });

    socket.on("message", (raw) => {
      ingestMsgCount++;
      if (ingestMsgCount > 500) {
        log.warn("ws-ingest", `Rate limit exceeded for session ${sessionId}`);
        return; // Silently drop excess messages (don't close — bot recovery is expensive)
      }

      let message;
      try {
        message = JSON.parse(raw.toString("utf-8"));
      } catch (err) {
        return;
      }

      if (!message || typeof message !== "object") return;

      if (message.type === "start") {
        if (MEETING_TYPES.includes(message.meetingType)) {
          session.meetingTypeSelected = message.meetingType;
        }
        return;
      }

      if (message.type === "stop") {
        session.stt?.end?.();
        session.stt = null;
        return;
      }

      if (message.type === "audio_pcm") {
        if (message.sampleRate !== 16000 || message.channels !== 1) {
          return;
        }

        const dataB64 = message.dataB64;
        if (typeof dataB64 !== "string" || !dataB64) return;
        // Reject oversized audio chunks (matches processIngestMessage validation)
        if (dataB64.length > 512 * 1024) return;

        processAudioChunk(session, dataB64);
        return;
      }

      // Video frame: forward to AI Inference Service for analysis
      if (message.type === "frame") {
        // Reject oversized frames (>2MB base64)
        if (typeof message.dataB64 === "string" && message.dataB64.length > 2 * 1024 * 1024) {
          return;
        }
        handleFrame(session, message).catch((err) => {
          log.warn("ingest", `Frame analysis error for session ${session.id}: ${err?.message ?? err}`);
        });
        return;
      }

      // Captions from Zoom CC or similar source
      if (message.type === "caption") {
        const text = typeof message.text === "string" ? message.text : "";
        if (!text.trim()) return;
        // Reject oversized captions
        if (text.length > 1000) return;
        const speaker = typeof message.speaker === "string" ? message.speaker.trim().slice(0, 100) : "unknown";

        handleTranscript(session, {
          text,
          isFinal: true,
          confidence: 0.95, // Captions are high-confidence
          ts: message.ts || makeIso(),
          speaker,
          source: "caption",
        });
        return;
      }

      // Participants list from bot panel scraper (same logic as processIngestMessage)
      if (message.type === "participants") {
        const rawNames = Array.isArray(message.participants)
          ? message.participants.map((p) => (typeof p === "string" ? p : p?.name)).filter(Boolean)
          : message.names;
        if (!Array.isArray(rawNames)) return;
        const names = rawNames
          .slice(0, 20)
          .filter((n) => typeof n === "string" && n.trim().length > 0)
          .map((n) => n.trim().slice(0, 100));
        if (names.length === 0) return;

        const now = makeIso();
        names.forEach((name, index) => {
          const existing = session.participants.get(index);
          session.participants.set(index, { name, firstSeen: existing?.firstSeen || now });
        });

        const participantList = Array.from(session.participants.entries()).map(
          ([faceId, data]) => ({ faceId, name: data.name, firstSeen: data.firstSeen })
        );
        broadcastToSession(session.id, { type: "participants", participants: participantList, ts: now });
        return;
      }

      // Bot fallback notification — real bot failed, now using stub
      if (message.type === "bot_fallback") {
        log.warn("ingest", `Bot fallback for session ${session.id}: ${message.reason} — ${message.message}`);
        session.source = "simulated";
        broadcastToSession(session.id, {
          type: "alert",
          alertId: `bot-fallback-${Date.now()}`,
          severity: "high",
          category: "system",
          title: "Bot Connection Failed",
          // I9: Truncate user-facing fallback message to prevent oversized broadcasts
          message: String(message.message || "Real bot could not join. Using simulated data — captions and analysis are NOT from the actual meeting.").slice(0, 500),
          recommendation: "Check the Zoom meeting URL and try again.",
          source: "system",
          ts: message.ts || makeIso(),
          sessionId: session.id,
        });
        return;
      }

      // Source status heartbeat from bot adapter
      if (message.type === "source_status") {
        session.botStatus = message.status || "connected";
        session.botStreams = message.streams || { audio: false, video: false, captions: false };

        // Mark source as external when bot connects so broadcast loop
        // stops overwriting real data with simulated metrics
        if (session.botStatus === "connected" || session.botStatus === "joining") {
          session.source = "external";
        }

        broadcastToSession(session.id, {
          type: "sourceStatus",
          status: session.botStatus,
          streams: session.botStreams,
          ts: message.ts || makeIso(),
        });

        persistence.updateBotStatus(session.id, session.botStatus).catch((err) => { log.warn("persistence", `operation failed: ${err?.message ?? err}`); });
        return;
      }
    });

    socket.on("close", () => {
      // If client disconnects, keep session alive; stop STT stream to avoid leaks.
      session.stt?.end?.();
      session.stt = null;
    });
  });
}

module.exports = { attachIngestHandler, processIngestMessage };
