const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 960 });

  const htmlPath = path.join(__dirname, "prepare-avatar.html");
  await page.goto("file://" + htmlPath, { waitUntil: "domcontentloaded" });

  // Load the Baymax image
  const baymaxPath = "/Users/ahmed/Downloads/Gemini_Generated_Image_5u2fib5u2fib5u2f.png";
  const baymaxB64 = fs.readFileSync(baymaxPath).toString("base64");
  await page.evaluate((b64) => window.setBaymaxSrc(b64), baymaxB64);
  await page.waitForFunction(() => document.title === "BG_DONE", { timeout: 10000 });

  // Load the eye-only logo
  const logoPath = path.join(__dirname, "../../Front-End/src/assets/realsync-eye-only.png");
  const logoB64 = fs.readFileSync(logoPath).toString("base64");
  await page.evaluate((b64) => window.drawLogo(b64), logoB64);
  await page.waitForFunction(() => document.title === "LOGO_DONE", { timeout: 5000 });

  await page.screenshot({ path: "/Users/ahmed/Desktop/bot_preview_final.png", type: "png" });
  await browser.close();
  console.log("Done - saved bot_preview_final.png (1280x960)");
})();
