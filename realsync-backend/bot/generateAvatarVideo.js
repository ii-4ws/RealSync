/**
 * Generate a Y4M video file of the RealSync bot avatar.
 *
 * Uses the Gemini-generated Baymax image as the base, overlays the
 * RealSync eye logo on the chest, and applies subtle breathing/sway
 * animations per-frame via Puppeteer canvas rendering.
 *
 * Usage: node bot/generateAvatarVideo.js
 * Output: bot/avatar-feed.y4m
 */

const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const OUTPUT_PATH = path.join(__dirname, "avatar-feed.y4m");
const WIDTH = 640;
const HEIGHT = 480;
const FPS = 15;
const DURATION_SECONDS = 10; // 10-second loop
const TOTAL_FRAMES = FPS * DURATION_SECONDS;

// Load images as base64
const BAYMAX_PATH = path.join(__dirname, "baymax-base.png");
const LOGO_PATH = path.join(__dirname, "../../Front-End/src/assets/realsync-logo-light.png");

async function generateAvatarVideo() {
  // Ensure we have the base image — copy from Downloads if needed
  if (!fs.existsSync(BAYMAX_PATH)) {
    const downloadPath = "/Users/ahmed/Downloads/Gemini_Generated_Image_5u2fib5u2fib5u2f.png";
    if (fs.existsSync(downloadPath)) {
      fs.copyFileSync(downloadPath, BAYMAX_PATH);
      console.log("Copied Baymax base image to bot directory.");
    } else {
      console.error("Baymax base image not found. Place it at", BAYMAX_PATH);
      process.exit(1);
    }
  }

  const baymaxB64 = fs.readFileSync(BAYMAX_PATH).toString("base64");
  let logoB64 = "";
  try {
    logoB64 = fs.readFileSync(LOGO_PATH).toString("base64");
  } catch {
    console.warn("Could not load logo — avatar will render without it.");
  }

  console.log(`Generating ${DURATION_SECONDS}s avatar video at ${FPS}fps (${TOTAL_FRAMES} frames)...`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });

  // Load the HTML page
  const htmlPath = path.join(__dirname, "avatar-video.html");
  await page.goto("file://" + htmlPath, { waitUntil: "domcontentloaded" });

  // Inject the Baymax image
  await page.evaluate((b64) => window.loadBaymax(b64), baymaxB64);
  await page.waitForFunction(() => document.title === "BG_READY", { timeout: 10000 });

  // Inject the logo
  if (logoB64) {
    await page.evaluate((b64) => window.loadLogo(b64), logoB64);
    await page.waitForFunction(() => document.title === "LOGO_READY", { timeout: 5000 });
  }

  // Draw first frame to verify
  await page.evaluate((t) => window.drawFrame(t), 0);

  // ── Write Y4M header ──
  const y4mHeader = `YUV4MPEG2 W${WIDTH} H${HEIGHT} F${FPS}:1 Ip A1:1 C420jpeg\n`;
  const fd = fs.openSync(OUTPUT_PATH, "w");
  fs.writeSync(fd, y4mHeader);

  // ── Capture frames ──
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i / FPS;

    // Draw the frame
    await page.evaluate((time) => window.drawFrame(time), t);

    // Capture as PNG
    const screenshot = await page.screenshot({ encoding: "binary", type: "png" });

    // Convert PNG to raw RGBA
    const rawPixels = await page.evaluate(async (pngBase64) => {
      const img = new Image();
      img.src = "data:image/png;base64," + pngBase64;
      await new Promise((r) => { img.onload = r; });
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx2 = c.getContext("2d");
      ctx2.drawImage(img, 0, 0);
      const data = ctx2.getImageData(0, 0, c.width, c.height).data;
      return Array.from(data);
    }, screenshot.toString("base64"));

    // Convert RGBA to YUV420
    const yPlane = Buffer.alloc(WIDTH * HEIGHT);
    const uPlane = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2));
    const vPlane = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2));

    for (let row = 0; row < HEIGHT; row++) {
      for (let col = 0; col < WIDTH; col++) {
        const idx = (row * WIDTH + col) * 4;
        const r = rawPixels[idx];
        const g = rawPixels[idx + 1];
        const b = rawPixels[idx + 2];

        const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        yPlane[row * WIDTH + col] = Math.max(0, Math.min(255, y));

        if (row % 2 === 0 && col % 2 === 0) {
          const u = Math.round(-0.169 * r - 0.331 * g + 0.5 * b + 128);
          const v = Math.round(0.5 * r - 0.419 * g - 0.081 * b + 128);
          const uvIdx = (row / 2) * (WIDTH / 2) + col / 2;
          uPlane[uvIdx] = Math.max(0, Math.min(255, u));
          vPlane[uvIdx] = Math.max(0, Math.min(255, v));
        }
      }
    }

    fs.writeSync(fd, "FRAME\n");
    fs.writeSync(fd, yPlane);
    fs.writeSync(fd, uPlane);
    fs.writeSync(fd, vPlane);

    if ((i + 1) % 15 === 0) {
      process.stdout.write(`\r  Frame ${i + 1}/${TOTAL_FRAMES} (${Math.round(((i + 1) / TOTAL_FRAMES) * 100)}%)`);
    }
  }

  fs.closeSync(fd);
  await browser.close();

  const stats = fs.statSync(OUTPUT_PATH);
  console.log(`\n\nDone! Generated ${OUTPUT_PATH}`);
  console.log(`  Frames: ${TOTAL_FRAMES}`);
  console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Duration: ${DURATION_SECONDS}s at ${FPS}fps`);
}

generateAvatarVideo().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
