/**
 * Quick test script to launch the real Zoom bot against a meeting URL.
 *
 * Usage:
 *   node bot/testBot.js "https://us05web.zoom.us/j/1234567890?pwd=xxx"
 *
 * This will:
 * 1. Launch the ZoomBotAdapter in HEADED mode (visible browser) for debugging
 * 2. Save debug screenshots at every step
 * 3. Log all onIngestMessage callbacks
 * 4. Keep the browser open for 120s for manual inspection
 *
 * The bot flow:
 *   us05web.zoom.us → accept cookies → "Join from browser" button
 *   → app.zoom.us/wc/{id}/join → name input → Join → meeting view
 */

const path = require("path");
const { ZoomBotAdapter } = require("./ZoomBotAdapter");

const MEETING_URL = process.argv[2];
if (!MEETING_URL) {
  console.error("Usage: node bot/testBot.js <zoom-meeting-url>");
  process.exit(1);
}

const DISPLAY_NAME = process.argv[3] || "RealSync Bot";

// Track received messages
let frameCount = 0;
let captionCount = 0;

function onIngestMessage(msg) {
  const ts = new Date().toISOString().slice(11, 19);

  switch (msg.type) {
    case "source_status":
      console.log(`[${ts}] 📡 STATUS: ${msg.status} | streams: audio=${msg.streams.audio} video=${msg.streams.video} captions=${msg.streams.captions}`);
      break;

    case "frame":
      frameCount++;
      const sizeKB = Math.round((msg.dataB64?.length || 0) * 0.75 / 1024);
      console.log(`[${ts}] 🖼  FRAME #${frameCount}: ${msg.width}x${msg.height}, ${sizeKB}KB`);
      break;

    case "caption":
      captionCount++;
      console.log(`[${ts}] 💬 CAPTION #${captionCount}: [${msg.speaker}] "${msg.text}"`);
      break;

    default:
      console.log(`[${ts}] ❓ UNKNOWN: ${JSON.stringify(msg).slice(0, 200)}`);
  }
}

(async () => {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RealSync Zoom Bot Test`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Meeting URL: ${MEETING_URL}`);
  console.log(`Display Name: ${DISPLAY_NAME}`);
  console.log(`Screenshots: bot/screenshots/`);
  console.log(`${"=".repeat(60)}\n`);

  const adapter = new ZoomBotAdapter({
    meetingUrl: MEETING_URL,
    displayName: DISPLAY_NAME,
    onIngestMessage,
    headless: false,            // VISIBLE browser for debugging
    debugScreenshots: true,     // Save screenshots at every step
  });

  // Handle Ctrl+C gracefully
  let cleaning = false;
  process.on("SIGINT", async () => {
    if (cleaning) return;
    cleaning = true;
    console.log("\n\n[Ctrl+C] Leaving meeting and cleaning up...");
    try {
      await adapter.leave();
    } catch {
      // Best effort
    }
    console.log(`\nStats: ${frameCount} frames, ${captionCount} captions received.`);
    process.exit(0);
  });

  try {
    console.log("[1/2] Joining meeting...\n");
    await adapter.join();
    console.log("\n[2/2] ✅ Bot is in the meeting! Capturing frames + captions.");
    console.log(`\nScreenshots saved to: ${path.join(__dirname, "screenshots")}`);
    console.log("Browser will stay open for 120 seconds for inspection.");
    console.log("Press Ctrl+C to leave early.\n");

    // Keep running for 120s
    await new Promise((r) => setTimeout(r, 120_000));

    console.log("\n⏰ 120s elapsed — leaving meeting...");
    await adapter.leave();
  } catch (err) {
    console.error(`\n❌ Bot failed: ${err.message}`);
    console.error(err.stack);
  }

  console.log(`\nFinal stats: ${frameCount} frames, ${captionCount} captions received.`);
  process.exit(0);
})();
