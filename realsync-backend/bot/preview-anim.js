const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 480 });

  const htmlPath = path.join(__dirname, "avatar-video.html");
  await page.goto("file://" + htmlPath, { waitUntil: "domcontentloaded" });

  // Load Baymax
  const baymaxB64 = fs.readFileSync(path.join(__dirname, "baymax-base.png")).toString("base64");
  await page.evaluate((b64) => window.loadBaymax(b64), baymaxB64);
  await page.waitForFunction(() => document.title === "BG_READY", { timeout: 10000 });

  // Load logo
  const logoB64 = fs.readFileSync(path.join(__dirname, "../../Front-End/src/assets/realsync-logo-light.png")).toString("base64");
  await page.evaluate((b64) => window.loadLogo(b64), logoB64);
  await page.waitForFunction(() => document.title === "LOGO_READY", { timeout: 5000 });

  // Preview at t=0 (eyes open)
  await page.evaluate((t) => window.drawFrame(t), 0);
  await page.screenshot({ path: "/Users/ahmed/Desktop/anim_t0.png" });

  // Preview at t=2 (eyes open, pupils wandered)
  await page.evaluate((t) => window.drawFrame(t), 2);
  await page.screenshot({ path: "/Users/ahmed/Desktop/anim_t2.png" });

  // Preview at t=4.15 (mid-blink)
  await page.evaluate((t) => window.drawFrame(t), 4.15);
  await page.screenshot({ path: "/Users/ahmed/Desktop/anim_blink.png" });

  await browser.close();
  console.log("Saved 3 previews: anim_t0.png, anim_t2.png, anim_blink.png");
})();
