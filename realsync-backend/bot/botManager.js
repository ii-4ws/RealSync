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

const USE_REAL_BOT = process.env.REALSYNC_BOT_MODE === "real";

let ZoomBotAdapter = null;
if (USE_REAL_BOT) {
  try {
    ZoomBotAdapter = require("./ZoomBotAdapter").ZoomBotAdapter;
    console.log("[botManager] Real Puppeteer bot mode enabled");
  } catch (err) {
    console.warn(`[botManager] Failed to load ZoomBotAdapter: ${err.message}. Falling back to stub.`);
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
 * Generates a simulated video frame (1x1 black JPEG as base64).
 * In production this will be a real Puppeteer screenshot.
 */
function generateStubFrame() {
  // Minimal valid JPEG (1x1 black pixel)
  const jpegBytes = Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP" +
      "//////////////////////////////////////////////////////////////////////////////////////" +
      "2wBDAf//////////////////////////////////////////////////////////////////////////////////////" +
      "wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEA" +
      "AAAAAAAAAAAAAAAAAAAAA//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKgA/9k=",
    "base64"
  );
  return jpegBytes.toString("base64");
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

let stubCaptionIndex = 0;
function getNextStubCaption() {
  const caption = STUB_CAPTIONS[stubCaptionIndex % STUB_CAPTIONS.length];
  stubCaptionIndex++;
  return caption;
}

/* ------------------------------------------------------------------ */
/*  Stub bot implementation                                            */
/* ------------------------------------------------------------------ */

function startStubBot({ sessionId, meetingUrl, displayName, onIngestMessage }) {
  const botId = uuidv4();
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
  setTimeout(() => {
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
          width: 1280,
          height: 720,
          capturedAt: new Date().toISOString(),
        });

        // Send a caption every 4 seconds (every other tick)
        if (Math.random() > 0.5) {
          const caption = getNextStubCaption();
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

async function startRealBot({ sessionId, meetingUrl, displayName, onIngestMessage }) {
  if (!ZoomBotAdapter) {
    console.warn("[botManager] ZoomBotAdapter not available, falling back to stub");
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
  };

  bots.set(sessionId, bot);

  // Start join in background (don't await — let it happen async)
  adapter
    .join()
    .then(() => {
      bot.status = "connected";
    })
    .catch((err) => {
      console.error(`[botManager] Real bot failed for ${sessionId}: ${err.message}`);
      bot.status = "disconnected";
      // Fall back to stub mode for this session
      console.log("[botManager] Falling back to stub bot...");
      bots.delete(sessionId);
      startStubBot({ sessionId, meetingUrl, displayName, onIngestMessage });
    });

  return { botId, status: "joining" };
}

/* ------------------------------------------------------------------ */
/*  Bot lifecycle (public API)                                         */
/* ------------------------------------------------------------------ */

/**
 * Start a bot to join a Zoom meeting.
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
  const delayMs = new Date(scheduledAt).getTime() - Date.now();

  if (delayMs <= 0) {
    // Already past — join now
    startBot({ sessionId, meetingUrl, displayName, onIngestMessage });
    return { scheduled: false, delayMs: 0 };
  }

  const timer = setTimeout(() => {
    scheduledTimers.delete(sessionId);
    startBot({ sessionId, meetingUrl, displayName, onIngestMessage });
  }, delayMs);

  scheduledTimers.set(sessionId, timer);
  console.log(`[botManager] Scheduled bot for session ${sessionId} in ${Math.round(delayMs / 1000)}s`);
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

  // Real bot: call adapter.leave()
  if (bot.adapter) {
    bot.adapter.leave().catch((err) => {
      console.warn(`[botManager] Error leaving meeting: ${err.message}`);
    });
  }

  // Stub bot: clear interval
  if (bot._stubInterval) {
    clearInterval(bot._stubInterval);
    bot._stubInterval = null;
  }

  bot.status = "disconnected";

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
  for (const [sessionId] of bots) {
    stopBot(sessionId);
  }
  for (const [sessionId] of scheduledTimers) {
    cancelScheduled(sessionId);
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
