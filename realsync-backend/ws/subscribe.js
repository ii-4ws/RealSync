const WebSocket = require("ws");
const { authenticateWsToken } = require("../lib/auth");
const { getSession, rehydrateSession, makeIso } = require("../services/sessionManager");

/**
 * Attach the subscribe WebSocket connection handler to wssSubscribe.
 * Clients connect here to receive real-time metrics/alerts/transcript events.
 */
function attachSubscribeHandler(wssSubscribe) {
  wssSubscribe.on("connection", async (socket, req) => {
    const url = new URL(req.url, "http://localhost");
    const sessionId = url.searchParams.get("sessionId") || null;

    // Try in-memory first, then lazy rehydrate from Supabase (Bug #5)
    let session = sessionId ? getSession(sessionId) : null;
    if (!session && sessionId) {
      session = await rehydrateSession(sessionId);
    }
    if (!session) {
      socket.send(JSON.stringify({ type: "error", message: "Session not found" }));
      socket.close(4004, "Session not found");
      return;
    }

    const addSubscriber = () => {
      session.subscribers.add(socket);
      socket.send(
        JSON.stringify({
          type: "metrics",
          sessionId: session.id,
          data: session.metrics,
        })
      );
      // Send current bot status so late-connecting clients get the right state
      if (session.botStatus && session.botStatus !== "idle") {
        socket.send(
          JSON.stringify({
            type: "sourceStatus",
            sessionId: session.id,
            status: session.botStatus,
            streams: session.botStreams || { audio: false, video: false, captions: false },
            ts: makeIso(),
          })
        );
      }
      // Push current participant list to newly connected subscriber
      if (session.participants && session.participants.size > 0) {
        const participantList = Array.from(session.participants.entries()).map(
          ([faceId, data]) => ({ faceId, name: data.name, firstSeen: data.firstSeen })
        );
        socket.send(JSON.stringify({ type: "participants", sessionId: session.id, participants: participantList, ts: makeIso() }));
      }

      // C3: Respond to client-side ping keepalive messages
      // WS rate limiting: max 60 messages per minute per connection
      let wsMsgCount = 0;
      const wsRateLimitInterval = setInterval(() => { wsMsgCount = 0; }, 60_000);
      socket.on("message", (raw) => {
        wsMsgCount++;
        if (wsMsgCount > 60) {
          socket.close(4029, "Rate limit exceeded");
          clearInterval(wsRateLimitInterval);
          return;
        }
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "ping") {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: "pong" }));
            }
          }
        } catch {
          // ignore non-JSON or malformed messages
        }
      });

      socket.on("close", () => {
        clearInterval(wsRateLimitInterval);
        session.subscribers.delete(socket);
      });
    };

    // If session does not require auth, subscribe immediately
    if (!session.userId) {
      addSubscriber();
      return;
    }

    // Session requires auth — accept token from first WS message (not URL params)
    const authTimeout = setTimeout(() => {
      socket.close(4003, "Auth timeout");
    }, 10000);

    socket.once("message", async (raw) => {
      clearTimeout(authTimeout);
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "auth" && msg.token) {
          const wsUserId = await authenticateWsToken(msg.token);
          if (wsUserId && wsUserId === session.userId) {
            if (socket.readyState === WebSocket.OPEN) {
              addSubscriber();
            }
            return;
          }
        }
      } catch {
        // ignore parse errors
      }
      socket.close(4003, "Access denied");
    });
  });
}

module.exports = { attachSubscribeHandler };
