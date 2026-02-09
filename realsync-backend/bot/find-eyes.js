const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 480 });

  const htmlPath = path.join(__dirname, "find-eyes.html");
  await page.goto("file://" + htmlPath, { waitUntil: "domcontentloaded" });

  const imgPath = path.join(__dirname, "baymax-base.png");
  const imgB64 = fs.readFileSync(imgPath).toString("base64");
  await page.evaluate((b64) => window.loadImg(b64), imgB64);

  await page.waitForFunction(() => document.title.startsWith("{"), { timeout: 10000 });

  const result = JSON.parse(await page.title());
  console.log("Eye detection result:", JSON.stringify(result, null, 2));

  await page.screenshot({ path: "/Users/ahmed/Desktop/eye_detection.png", type: "png" });

  await browser.close();
})();
