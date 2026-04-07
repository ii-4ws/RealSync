const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const http = require("http");
const WebSocket = require("ws");
const { execFileSync } = require("child_process");
require("dotenv").config();

// Production startup guard — refuse to start without Supabase in production
if (process.env.NODE_ENV === "production" && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)) {
  console.error("FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY are required in production. Exiting.");
  process.exit(1);
}

const { authenticate } = require("./lib/auth");
const botManager = require("./bot/botManager");
const log = require("./lib/logger");
const { sessions, broadcastToSession, makeIso } = require("./services/sessionManager");
const { frameInFlight } = require("./services/frameHandler");
const { attachSubscribeHandler } = require("./ws/subscribe");
const { attachIngestHandler } = require("./ws/ingest");
const healthRouter = require("./routes/health");
const sessionsRouter = require("./routes/sessions");
const botRouter = require("./routes/bot");
const dataRouter = require("./routes/data");

/* ------------------------------------------------------------------ */
/*  Stale bot cleanup on startup (Bug #10)                             */
/* ------------------------------------------------------------------ */
// Kill orphaned Chromium processes from previous runs (handles kill -9 case)
try {
  const pgrepOut = execFileSync("pgrep", ["-f", "chromium.*--remote-debugging"], {
    encoding: "utf-8",
    timeout: 5000,
  }).trim();
  if (pgrepOut) {
    const pids = pgrepOut.split("\n").filter(Boolean);
    log.info("startup", `Found ${pids.length} orphaned Chromium process(es) — cleaning up`);
    for (const pid of pids) {
      try {
        const n = parseInt(pid.trim(), 10);
        if (Number.isInteger(n) && n > 1) {
          process.kill(n, "SIGTERM");
        }
      } catch {
        // Process may have already exited
      }
    }
  }
} catch {
  // pgrep not available or no processes found — safe to ignore
}

/* ------------------------------------------------------------------ */
/*  Express app setup                                                   */
/* ------------------------------------------------------------------ */

const app = express();

// Security headers
app.use(helmet());

// CORS — supports comma-separated ALLOWED_ORIGIN for multiple origins
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS: origin not allowed"));
    }
  },
  credentials: true,
}));

// Rate limiting on API routes: 100 requests per minute per IP (global safety net)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", apiLimiter);

app.use(express.json({ limit: "2mb" }));
app.use(authenticate);

/* ------------------------------------------------------------------ */
/*  Mount routers                                                       */
/* ------------------------------------------------------------------ */

app.use(healthRouter);
app.use(sessionsRouter);
app.use(botRouter);
app.use(dataRouter);

// Global error handler (Express 5 requires 4-arg signature)
app.use((err, req, res, _next) => {
  log.error("server", `Unhandled error: ${err?.message ?? err}`);
  res.status(500).json({ error: "Internal server error" });
});

/* ------------------------------------------------------------------ */
/*  HTTP + WebSocket servers                                            */
/* ------------------------------------------------------------------ */

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);
const wssSubscribe = new WebSocket.Server({ noServer: true, maxPayload: 256 * 1024 });
const wssIngest = new WebSocket.Server({ noServer: true, maxPayload: 2 * 1024 * 1024 });

// Manual upgrade routing: two WS servers on one HTTP server require noServer
// mode so they don't race to abort each other's connections.
server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url, "http://localhost");
  if (pathname === "/ws") {
    wssSubscribe.handleUpgrade(req, socket, head, (ws) => {
      wssSubscribe.emit("connection", ws, req);
    });
  } else if (pathname === "/ws/ingest") {
    wssIngest.handleUpgrade(req, socket, head, (ws) => {
      wssIngest.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// Attach WebSocket connection handlers
attachSubscribeHandler(wssSubscribe);
attachIngestHandler(wssIngest);

/* ------------------------------------------------------------------ */
/*  Simulated metrics broadcast loop                                    */
/* ------------------------------------------------------------------ */

let broadcastInterval = null;

const ensureBroadcastLoop = () => {
  if (broadcastInterval) return;
  broadcastInterval = setInterval(() => {
    sessions.forEach((session) => {
      if (session.endedAt) return;
      // Only broadcast real metrics — never generate simulated data
      if (session.metrics) {
        broadcastToSession(session.id, {
          type: "metrics",
          data: session.metrics,
        });
      }
    });
  }, 1500);
};

ensureBroadcastLoop();

/* ------------------------------------------------------------------ */
/*  WebSocket keepalive — ping/pong heartbeat (C3)                     */
/* ------------------------------------------------------------------ */

const WS_PING_INTERVAL_MS = 30_000; // 30 seconds

function setupWsPingPong(wss, label) {
  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });
  });

  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        log.debug("ws-keepalive", `Terminating dead ${label} connection`);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, WS_PING_INTERVAL_MS);
}

setupWsPingPong(wssSubscribe, "subscribe");
setupWsPingPong(wssIngest, "ingest");

/* ------------------------------------------------------------------ */
/*  Session garbage collection                                         */
/* ------------------------------------------------------------------ */

const SESSION_GC_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const SESSION_GC_MAX_AGE_MS = 60 * 60 * 1000;  // 1 hour after ended

const sessionGcInterval = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (!session.endedAt) continue;
    const endedMs = new Date(session.endedAt).getTime();
    if (now - endedMs > SESSION_GC_MAX_AGE_MS) {
      // Clean up resources
      session.stt?.end?.();
      // Close lingering subscriber WebSocket connections before clearing
      session.subscribers.forEach((client) => {
        try { client.close(1000, "Session expired"); } catch { /* best effort */ }
      });
      session.subscribers.clear();
      frameInFlight.delete(id);
      sessions.delete(id);
      log.info("gc", `Garbage-collected session ${id}`);
    }
  }

  // Clean up orphaned frameInFlight entries for sessions that no longer exist
  for (const id of frameInFlight.keys()) {
    if (!sessions.has(id)) {
      frameInFlight.delete(id);
    }
  }
}, SESSION_GC_INTERVAL_MS);

/* ------------------------------------------------------------------ */
/*  Graceful shutdown                                                   */
/* ------------------------------------------------------------------ */

let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log.info("server", `${signal} received — shutting down gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    log.info("server", "HTTP server closed");
  });

  // Stop broadcast loop and GC
  if (broadcastInterval) clearInterval(broadcastInterval);
  clearInterval(sessionGcInterval);

  // Close all WebSocket clients
  for (const client of wssSubscribe.clients) {
    client.close(1001, "Server shutting down");
  }
  for (const client of wssIngest.clients) {
    client.close(1001, "Server shutting down");
  }

  // End all STT streams and clean up bots
  for (const [, session] of sessions) {
    session.stt?.end?.();
    session.stt = null;
  }
  botManager.cleanupAll?.();

  // Force exit after 10s if cleanup hasn't finished
  setTimeout(() => {
    log.warn("server", "Forced exit after 10s timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  log.error("uncaught", `Uncaught exception: ${err.message}`, { stack: err.stack });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  log.error("unhandled-rejection", `Unhandled rejection: ${reason}`, { stack: reason?.stack });
});

/* ------------------------------------------------------------------ */
/*  Start server                                                        */
/* ------------------------------------------------------------------ */

server.listen(PORT, () => {
  log.info("server", `Backend listening on port ${PORT}`);
});
