/**
 * Bot Manager — Zoom Bot Adapter lifecycle management.
 *
 * Manages spawning, health checking, and teardown of headless browser
 * bot instances that join Zoom meetings as participants.
 *
 * Supports two modes:
 *   1. Real mode (REALSYNC_BOT_MODE=real) — Puppeteer headless browser
 *   2. Stub mode (default) — Simulated capture for development/testing
 *
 * Set env var REALSYNC_BOT_MODE=real to use Puppeteer.
 */

const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");
const log = require("../lib/logger");

const USE_REAL_BOT = process.env.REALSYNC_BOT_MODE === "real";

let ZoomBotAdapter = null;
if (USE_REAL_BOT) {
  try {
    ZoomBotAdapter = require("./ZoomBotAdapter").ZoomBotAdapter;
    log.info("botManager", "Real Puppeteer bot mode enabled");
  } catch (err) {
    log.warn("botManager", `Failed to load ZoomBotAdapter: ${err.message}. Falling back to stub.`);
  }
}

/* ------------------------------------------------------------------ */
/*  In-memory bot registry                                             */
/* ------------------------------------------------------------------ */

/** @type {Map<string, BotInstance>} sessionId → BotInstance */
const bots = new Map();

/** @type {Map<string, ReturnType<typeof setTimeout>>} sessionId → scheduled timer */
const scheduledTimers = new Map();

/**
 * @typedef {object} BotInstance
 * @property {string} botId
 * @property {string} sessionId
 * @property {string} meetingUrl
 * @property {string} displayName
 * @property {"idle"|"joining"|"connected"|"disconnected"} status
 * @property {object|null} adapter - ZoomBotAdapter instance (real mode)
 * @property {object|null} _stubInterval - For stub mode simulation
 */

/* ------------------------------------------------------------------ */
/*  Stub simulation helpers                                            */
/* ------------------------------------------------------------------ */

/**
 * Load a test frame (640x480 face) for stub mode.
 * Falls back to a 1x1 black JPEG if file not found.
 */
const TEST_FRAME_PATH = path.join(__dirname, "test-frame.jpg");
let _stubFrameB64 = null;
let _stubFrameWidth = 1;
let _stubFrameHeight = 1;
try {
  _stubFrameB64 = fs.readFileSync(TEST_FRAME_PATH).toString("base64");
  _stubFrameWidth = 640;
  _stubFrameHeight = 480;
  log.info("botManager", "Loaded test-frame.jpg for stub mode");
} catch {
  // Fallback: minimal valid JPEG (1x1 black pixel)
  _stubFrameB64 =
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP" +
    "//////////////////////////////////////////////////////////////////////////////////////" +
    "2wBDAf//////////////////////////////////////////////////////////////////////////////////////" +
    "wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEA" +
    "AAAAAAAAAAAAAAAAAAAAA//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKgA/9k=";
  log.warn("botManager", "test-frame.jpg not found, using 1x1 fallback");
}

function generateStubFrame() {
  return _stubFrameB64;
}

/**
 * Generates a simulated caption line.
 */
const STUB_CAPTIONS = [
  { speaker: "Alice", text: "Let's start the meeting. We need to review the project budget." },
  { speaker: "Bob", text: "Sure, I have the updated figures from last quarter." },
  { speaker: "Alice", text: "Great. Can you also share the client feedback report?" },
  { speaker: "Bob", text: "I'll send the invoice details after this call." },
  { speaker: "Charlie", text: "I noticed some unusual activity in the account." },
  { speaker: "Alice", text: "Let's investigate before we proceed with any transfers." },
  { speaker: "Bob", text: "Agreed. Security compliance is our top priority." },
  { speaker: "Charlie", text: "I'll run a quick audit on the recent transactions." },
];

/**
 * Create a per-bot caption generator so concurrent stub bots don't
 * share the same position in the caption array.
 */
function createCaptionGenerator() {
  let index = 0;
  return function getNextCaption() {
    const caption = STUB_CAPTIONS[index % STUB_CAPTIONS.length];
    index++;
    return caption;
  };
}

/* ------------------------------------------------------------------ */
/*  Stub bot implementation                                            */
/* ------------------------------------------------------------------ */

function startStubBot({ sessionId, meetingUrl, displayName, onIngestMessage }) {
  const botId = uuidv4();
  const getNextCaption = createCaptionGenerator();
  const bot = {
    botId,
    sessionId,
    meetingUrl,
    displayName: displayName || "RealSync Bot",
    status: "joining",
    adapter: null,
    _stubInterval: null,
  };

  bots.set(sessionId, bot);

  // Notify: bot is joining
  onIngestMessage({
    type: "source_status",
    status: "connected",
    streams: { audio: false, video: false, captions: false },
    ts: new Date().toISOString(),
  });

  // Simulate "joining" delay then start capture
  bot._joinTimeout = setTimeout(() => {
    if (bot.status === "joining") {
      bot.status = "connected";

      // Notify: streams active
      onIngestMessage({
        type: "source_status",
        status: "connected",
        streams: { audio: true, video: true, captions: true },
        ts: new Date().toISOString(),
      });

      // Start stub capture loop
      bot._stubInterval = setInterval(() => {
        // Send a frame every 2 seconds
        onIngestMessage({
          type: "frame",
          dataB64: generateStubFrame(),
          width: _stubFrameWidth,
          height: _stubFrameHeight,
          capturedAt: new Date().toISOString(),
        });

        // Send a caption every 4 seconds (every other tick)
        if (Math.random() > 0.5) {
          const caption = getNextCaption();
          onIngestMessage({
            type: "caption",
            text: caption.text,
            speaker: caption.speaker,
            ts: new Date().toISOString(),
          });
        }
      }, 2000);
    }
  }, 2000); // 2s simulated join delay

  return { botId, status: "joining" };
}

/* ------------------------------------------------------------------ */
/*  Real Puppeteer bot implementation                                  */
/* ------------------------------------------------------------------ */

const JOIN_TIMEOUT_MS = 90_000;  // 90 seconds max for a join attempt
const MAX_JOIN_RETRIES = 2;

async function startRealBot({ sessionId, meetingUrl, displayName, onIngestMessage }) {
  if (!ZoomBotAdapter) {
    log.warn("botManager", "ZoomBotAdapter not available, falling back to stub");
    return startStubBot({ sessionId, meetingUrl, displayName, onIngestMessage });
  }

  const botId = uuidv4();
  const adapter = new ZoomBotAdapter({ meetingUrl, displayName, onIngestMessage });

  const bot = {
    botId,
    sessionId,
    meetingUrl,
    displayName: displayName || "RealSync Bot",
    status: "joining",
    adapter,
    _stubInterval: null,
    _joinTimeout: null,
  };

  bots.set(sessionId, bot);

  /**
   * Attempt to join with retry logic (H6) and join timeout (H5).
   */
  function attemptJoin(retryCount = 0) {
    // H5: Set a join timeout that forces status transition
    bot._joinTimeout = setTimeout(() => {
      if (bot.status === "joining" && !bot.cancelled) {
        log.warn("botManager", `Join timed out for ${sessionId} (attempt ${retryCount + 1}) — falling back to stub`);
        bot.status = "disconnected";
        adapter.leave().catch(() => {});
        bots.delete(sessionId);
        startStubBot({ sessionId, meetingUrl, displayName, onIngestMessage });
      }
    }, JOIN_TIMEOUT_MS);

    adapter
      .join()
      .then(() => {
        clearTimeout(bot._joinTimeout);
        bot._joinTimeout = null;
        if (bot.cancelled) return;
        bot.status = "connected";
      })
      .catch(async (err) => {
        clearTimeout(bot._joinTimeout);
        bot._joinTimeout = null;
        if (bot.cancelled) return;

        log.error("botManager", `Real bot failed for ${sessionId} (attempt ${retryCount + 1}/${MAX_JOIN_RETRIES + 1}): ${err.message}`);

        // H6: Retry with exponential backoff before falling back
        if (retryCount < MAX_JOIN_RETRIES && bots.has(sessionId) && !bot.cancelled) {
          const backoffMs = 1000 * Math.pow(2, retryCount); // 1s, 2s
          log.info("botManager", `Retrying join for ${sessionId} in ${backoffMs}ms (retry ${retryCount + 1}/${MAX_JOIN_RETRIES})`);
          bot.status = "joining";
          setTimeout(() => {
            if (bots.has(sessionId) && bot.status === "joining") {
              attemptJoin(retryCount + 1);
            }
          }, backoffMs);
          return;
        }

        // Final failure — fall back to stub
        bot.status = "disconnected";
        try { await adapter.leave(); } catch { /* best-effort cleanup */ }
        if (bots.has(sessionId)) {
          bots.delete(sessionId);
          log.info("botManager", "All retries exhausted, falling back to stub bot...");
          startStubBot({ sessionId, meetingUrl, displayName, onIngestMessage });
        }
      });
  }

  attemptJoin(0);
  return { botId, status: "joining" };
}

/* ------------------------------------------------------------------ */
/*  Bot lifecycle (public API)                                         */
/* ------------------------------------------------------------------ */

/**
 * Start a bot to join a Zoom meeting.
 *
 * NOTE: In real mode (USE_REAL_BOT), this returns a Promise because
 * startRealBot is async. In stub mode, it returns synchronously.
 * The actual Zoom join is fire-and-forget (the .then/.catch in
 * startRealBot handles success/failure in the background). Callers
 * should not rely on awaiting the return value for join completion.
 *
 * @param {object} opts
 * @param {string} opts.sessionId
 * @param {string} opts.meetingUrl
 * @param {string} [opts.displayName]
 * @param {function} opts.onIngestMessage - Callback: (message) => void
 * @returns {{ botId: string, status: string }}
 */
function startBot({ sessionId, meetingUrl, displayName, onIngestMessage }) {
  if (bots.has(sessionId)) {
    const existing = bots.get(sessionId);
    if (existing.status === "connected" || existing.status === "joining") {
      return { botId: existing.botId, status: existing.status, error: "Bot already active" };
    }
  }

  if (USE_REAL_BOT && ZoomBotAdapter) {
    return startRealBot({ sessionId, meetingUrl, displayName, onIngestMessage });
  }
  return startStubBot({ sessionId, meetingUrl, displayName, onIngestMessage });
}

/**
 * Schedule a bot to join at a future time.
 *
 * @param {object} opts
 * @param {string} opts.sessionId
 * @param {string} opts.meetingUrl
 * @param {string} opts.scheduledAt - ISO datetime string
 * @param {string} [opts.displayName]
 * @param {function} opts.onIngestMessage
 * @returns {{ scheduled: boolean, delayMs: number }}
 */
function scheduleBot({ sessionId, meetingUrl, scheduledAt, displayName, onIngestMessage }) {
  const ts = new Date(scheduledAt).getTime();
  if (!Number.isFinite(ts)) {
    return { scheduled: false, error: "Invalid scheduledAt date" };
  }
  const delayMs = ts - Date.now();
  const MAX_SCHEDULE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  if (delayMs > MAX_SCHEDULE_MS) {
    return { scheduled: false, error: "Cannot schedule more than 7 days ahead" };
  }

  if (delayMs <= 0) {
    // Already past — join now
    try {
      return startBot({ sessionId, meetingUrl, displayName, onIngestMessage });
    } catch (err) {
      log.error("botManager", `scheduleBot immediate start failed for ${sessionId}: ${err.message}`);
      return { botId: sessionId, status: "error" };
    }
  }

  const timer = setTimeout(() => {
    scheduledTimers.delete(sessionId);
    startBot({ sessionId, meetingUrl, displayName, onIngestMessage });
  }, delayMs);

  scheduledTimers.set(sessionId, timer);
  log.info("botManager", `Scheduled bot for session ${sessionId} in ${Math.round(delayMs / 1000)}s`);
  return { scheduled: true, delayMs };
}

/**
 * Cancel a scheduled bot join.
 */
function cancelScheduled(sessionId) {
  const timer = scheduledTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    scheduledTimers.delete(sessionId);
    return { ok: true };
  }
  return { ok: false, error: "No scheduled bot for session" };
}

/**
 * Stop a bot and clean up.
 *
 * @param {string} sessionId
 * @param {function} [onIngestMessage] - Optional callback for final status
 */
function stopBot(sessionId, onIngestMessage) {
  // Cancel any scheduled join
  cancelScheduled(sessionId);

  const bot = bots.get(sessionId);
  if (!bot) return { ok: false, error: "No bot for session" };

  // Clear stub join timeout if still pending
  if (bot._joinTimeout) {
    clearTimeout(bot._joinTimeout);
    bot._joinTimeout = null;
  }

  // Real bot: call adapter.leave()
  if (bot.adapter) {
    bot.adapter.leave().catch((err) => {
      log.warn("botManager", `Error leaving meeting: ${err.message}`);
    });
  }

  // Stub bot: clear interval
  if (bot._stubInterval) {
    clearInterval(bot._stubInterval);
    bot._stubInterval = null;
  }

  bot.status = "disconnected";
  bot.cancelled = true;

  if (onIngestMessage) {
    onIngestMessage({
      type: "source_status",
      status: "disconnected",
      streams: { audio: false, video: false, captions: false },
      ts: new Date().toISOString(),
    });
  }

  bots.delete(sessionId);
  return { ok: true };
}

/**
 * Get status of a bot for a session.
 */
function getBotStatus(sessionId) {
  const bot = bots.get(sessionId);
  if (!bot) return { status: "idle" };
  return {
    botId: bot.botId,
    status: bot.status,
    meetingUrl: bot.meetingUrl,
    displayName: bot.displayName,
  };
}

/**
 * Clean up all bots (e.g. on server shutdown).
 */
function cleanupAll() {
  for (const id of [...bots.keys()]) {
    stopBot(id);
  }
  for (const id of [...scheduledTimers.keys()]) {
    cancelScheduled(id);
  }
}

module.exports = {
  startBot,
  stopBot,
  scheduleBot,
  cancelScheduled,
  getBotStatus,
  cleanupAll,
};
