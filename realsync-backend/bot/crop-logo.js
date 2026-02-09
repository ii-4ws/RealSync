const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 300 });

  // Read logo as base64
  const logoPath = path.join(__dirname, "../../Front-End/src/assets/4401d6799dc4e6061a79080f8825d69ae920f198.png");
  const logoB64 = fs.readFileSync(logoPath).toString("base64");

  // Set up a simple page with canvas
  await page.setContent("<html><body><canvas id='c'></canvas></body></html>");

  // Do the crop in evaluate
  const croppedB64 = await page.evaluate(async (b64) => {
    return new Promise((resolve) => {
      var img = new Image();
      img.onload = function() {
        var cropH = 161;
        var c = document.getElementById("c");
        c.width = img.width;
        c.height = cropH;
        var ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, img.width, cropH, 0, 0, img.width, cropH);
        resolve(c.toDataURL("image/png").replace("data:image/png;base64,", ""));
      };
      img.src = "data:image/png;base64," + b64;
    });
  }, logoB64);

  const outputPath = path.join(__dirname, "../../Front-End/src/assets/realsync-eye-only.png");
  fs.writeFileSync(outputPath, Buffer.from(croppedB64, "base64"));

  await browser.close();
  console.log("Cropped logo saved to", outputPath);
})();
