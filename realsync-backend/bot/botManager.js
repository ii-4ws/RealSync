/**
 * Bot Manager — Zoom Bot Adapter lifecycle management.
 *
 * Manages spawning, health checking, and teardown of headless browser
 * bot instances that join Zoom meetings as participants.
 *
 * Real Puppeteer bot mode only — no stub/simulated fallback.
 */

const { v4: uuidv4 } = require("uuid");
const log = require("../lib/logger");

let ZoomBotAdapter = null;
try {
  ZoomBotAdapter = require("./ZoomBotAdapter").ZoomBotAdapter;
  log.info("botManager", "Puppeteer bot loaded");
} catch (err) {
  log.error("botManager", `Failed to load ZoomBotAdapter: ${err.message}. Bot will not work.`);
}

/* ------------------------------------------------------------------ */
/*  In-memory bot registry                                             */
/* ------------------------------------------------------------------ */

const bots = new Map();
const scheduledTimers = new Map();

/* ------------------------------------------------------------------ */
/*  Real Puppeteer bot implementation                                  */
/* ------------------------------------------------------------------ */

const JOIN_TIMEOUT_MS = 150_000;
const MAX_JOIN_RETRIES = 2;

function startRealBot({ sessionId, meetingUrl, displayName, onIngestMessage }) {
  if (!ZoomBotAdapter) {
    log.error("botManager", "ZoomBotAdapter not available. Cannot join meeting.");
    onIngestMessage({
      type: "bot_fallback",
      reason: "adapter_missing",
      message: "Bot adapter not available. Install Puppeteer dependencies and restart.",
      ts: new Date().toISOString(),
    });
    return { botId: null, status: "error" };
  }

  const botId = uuidv4();
  let adapter = new ZoomBotAdapter({ meetingUrl, displayName, onIngestMessage });

  const bot = {
    botId,
    sessionId,
    meetingUrl,
    displayName: displayName || "RealSync Bot",
    status: "joining",
    adapter,
    _joinTimeout: null,
  };

  bots.set(sessionId, bot);

  function attemptJoin(retryCount = 0) {
    bot._joinTimeout = setTimeout(() => {
      if (bot.status === "joining" && !bot.cancelled) {
        log.error("botManager", `Join timed out for ${sessionId} (attempt ${retryCount + 1})`);
        bot.status = "disconnected";
        bot.cancelled = true;
        adapter.leave().catch(() => {});
        bots.delete(sessionId);
        onIngestMessage({
          type: "bot_fallback",
          reason: "join_timeout",
          message: "Bot could not join the meeting within the timeout period.",
          ts: new Date().toISOString(),
        });
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

        log.error("botManager", `Bot failed for ${sessionId} (attempt ${retryCount + 1}/${MAX_JOIN_RETRIES + 1}): ${err.message}`);

        if (retryCount < MAX_JOIN_RETRIES && bots.has(sessionId) && !bot.cancelled) {
          const backoffMs = 1000 * Math.pow(2, retryCount);
          log.info("botManager", `Retrying join for ${sessionId} in ${backoffMs}ms (retry ${retryCount + 1}/${MAX_JOIN_RETRIES})`);
          adapter.leave().catch(() => {});
          bot.adapter = new ZoomBotAdapter({ meetingUrl, displayName, onIngestMessage });
          adapter = bot.adapter;
          bot.status = "joining";
          setTimeout(() => {
            if (bots.has(sessionId) && bot.status === "joining") {
              attemptJoin(retryCount + 1);
            }
          }, backoffMs);
          return;
        }

        // Final failure — no fallback
        bot.status = "disconnected";
        try { await adapter.leave(); } catch { /* best-effort cleanup */ }
        if (bots.has(sessionId)) {
          bots.delete(sessionId);
          log.error("botManager", `All retries exhausted for ${sessionId}. No fallback.`);
          onIngestMessage({
            type: "bot_fallback",
            reason: "join_failed",
            message: `Bot failed after ${MAX_JOIN_RETRIES + 1} attempts: ${err.message}`,
            ts: new Date().toISOString(),
          });
        }
      });
  }

  attemptJoin(0);
  return { botId, status: "joining" };
}

/* ------------------------------------------------------------------ */
/*  Bot lifecycle (public API)                                         */
/* ------------------------------------------------------------------ */

function startBot({ sessionId, meetingUrl, displayName, onIngestMessage }) {
  if (bots.has(sessionId)) {
    const existing = bots.get(sessionId);
    if (existing.status === "connected" || existing.status === "joining") {
      return { botId: existing.botId, status: existing.status, error: "Bot already active" };
    }
  }

  return startRealBot({ sessionId, meetingUrl, displayName, onIngestMessage });
}

function scheduleBot({ sessionId, meetingUrl, scheduledAt, displayName, onIngestMessage }) {
  const ts = new Date(scheduledAt).getTime();
  if (!Number.isFinite(ts)) {
    return { scheduled: false, error: "Invalid scheduledAt date" };
  }
  const delayMs = ts - Date.now();
  const MAX_SCHEDULE_MS = 7 * 24 * 60 * 60 * 1000;
  if (delayMs > MAX_SCHEDULE_MS) {
    return { scheduled: false, error: "Cannot schedule more than 7 days ahead" };
  }

  if (delayMs <= 0) {
    try {
      return startBot({ sessionId, meetingUrl, displayName, onIngestMessage });
    } catch (err) {
      log.error("botManager", `scheduleBot immediate start failed for ${sessionId}: ${err.message}`);
      return { botId: null, status: "error" };
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

function cancelScheduled(sessionId) {
  const timer = scheduledTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    scheduledTimers.delete(sessionId);
    return { ok: true };
  }
  return { ok: false, error: "No scheduled bot for session" };
}

function stopBot(sessionId, onIngestMessage) {
  cancelScheduled(sessionId);

  const bot = bots.get(sessionId);
  if (!bot) return { ok: false, error: "No bot for session" };

  if (bot._joinTimeout) {
    clearTimeout(bot._joinTimeout);
    bot._joinTimeout = null;
  }

  if (bot.adapter) {
    bot.adapter.leave().catch((err) => {
      log.warn("botManager", `Error leaving meeting: ${err.message}`);
    });
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
