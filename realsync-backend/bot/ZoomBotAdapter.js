/**
 * ZoomBotAdapter — Puppeteer-based headless browser that joins Zoom meetings.
 *
 * Handles the real Zoom web-client join flow:
 *   1. Navigate to Zoom invite URL (us05web.zoom.us/j/...)
 *   2. Accept cookie consent banner
 *   3. Click "Join from Your Browser" button
 *   4. Wait for redirect to app.zoom.us/wc/{meetingId}/join
 *   5. Enter display name in "Your Name" input
 *   6. Click "Join" button
 *   7. Wait for meeting view
 *   8. Enable closed captions
 *   9. Start frame capture + caption scraping
 *
 * Usage:
 *   const adapter = new ZoomBotAdapter({ meetingUrl, displayName, onIngestMessage });
 *   await adapter.join();
 *   // ... later
 *   await adapter.leave();
 */

const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const log = require("../lib/logger");

const DEFAULT_DISPLAY_NAME = "RealSync Bot";
const PUPPETEER_TIMEOUT_MS = 120_000; // I5: 120s to get into the meeting (Puppeteer+Zoom can take >60s)
const FRAME_INTERVAL_MS = 1500; // 1 frame every 1.5s (~0.67 FPS)
const CAPTION_POLL_MS = 1000; // check captions every 1s
const AUDIO_CHUNK_MS = 500; // send audio chunks every 500ms
const VIEWPORT = { width: 1920, height: 1080 };

// Debug screenshots directory (only used when DEBUG_SCREENSHOTS=true)
const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");

// Animated bot avatar video (Y4M) — used as fake camera feed
const AVATAR_VIDEO_PATH = path.join(__dirname, "avatar-feed.y4m");

/** Simple sleep helper (replaces deprecated page.waitForTimeout) */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ZoomBotAdapter {
  /**
   * @param {object} opts
   * @param {string} opts.meetingUrl - Zoom join URL
   * @param {string} [opts.displayName]
   * @param {function} opts.onIngestMessage - (message) => void
   * @param {boolean} [opts.headless=true] - Set false for debugging
   * @param {boolean} [opts.debugScreenshots=false] - Save screenshots at each step
   */
  constructor({ meetingUrl, displayName, onIngestMessage, headless, debugScreenshots }) {
    // Validate meeting URL points to a Zoom domain
    try {
      const parsed = new URL(meetingUrl);
      if (parsed.protocol !== 'https:' || !(parsed.hostname.endsWith('.zoom.us') || parsed.hostname.endsWith('.zoom.com'))) {
        throw new Error('Invalid host');
      }
    } catch {
      throw new Error(`[ZoomBot] Invalid meeting URL — must be a https://*.zoom.us or https://*.zoom.com link: ${meetingUrl}`);
    }
    this.meetingUrl = meetingUrl;
    this.displayName = displayName || DEFAULT_DISPLAY_NAME;
    this.onIngestMessage = onIngestMessage;
    this.headless = headless !== undefined ? headless : (process.env.BOT_HEADLESS !== 'false');
    this.debugScreenshots = debugScreenshots || process.env.DEBUG_SCREENSHOTS === "true";

    this.browser = null;
    this.page = null;
    this._frameTimer = null;
    this._captionInterval = null;
    this._participantInterval = null;
    this._lastParticipantNames = [];
    this._audioCapturing = false;
    this._lastCaptionText = "";
    this._stopped = false;
    this._screenshotIndex = 0;
  }

  /**
   * Take a debug screenshot (only when debugScreenshots is enabled).
   */
  async _debugScreenshot(label) {
    if (!this.debugScreenshots || !this.page) return;
    try {
      if (!fs.existsSync(SCREENSHOTS_DIR)) {
        fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
      }
      this._screenshotIndex++;
      const filename = `${String(this._screenshotIndex).padStart(2, "0")}_${label}.png`;
      const filepath = path.join(SCREENSHOTS_DIR, filename);
      await this.page.screenshot({ path: filepath, fullPage: true });
      log.info("zoomBot", `Debug screenshot: ${filename}`);
    } catch {
      // Non-critical
    }
  }

  // 7.4: _injectVirtualCamera removed — it was dead code (never called).
  // Avatar camera is handled via --use-file-for-fake-video-capture Chromium flag.
  // The module-level readFileSync for the logo was also removed.

  /**
   * Launch browser, navigate to Zoom, and join the meeting.
   */
  async join() {
    this._stopped = false;

    // Notify: joining
    this.onIngestMessage({
      type: "source_status",
      status: "joining",
      streams: { audio: false, video: false, captions: false },
      ts: new Date().toISOString(),
    });

    try {
      this.browser = await puppeteer.launch({
        headless: this.headless ? "new" : false,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--use-fake-ui-for-media-stream", // Auto-grant mic/camera permissions
          "--use-fake-device-for-media-stream", // Use fake camera device
          `--use-file-for-fake-video-capture=${AVATAR_VIDEO_PATH}`, // Animated Baymax avatar as camera feed
          "--autoplay-policy=no-user-gesture-required",

          `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
        ],
        defaultViewport: VIEWPORT,
      });

      this.page = await this.browser.newPage();

      // Detect unexpected page close/crash so ingest WS closes and backend auto-ends session
      this.page.on("close", () => {
        if (!this._stopped) {
          log.warn("zoomBot", "Puppeteer page closed unexpectedly");
          this._stopped = true;
          this._cleanup();
        }
      });
      this.page.on("error", (err) => {
        log.error("zoomBot", `Puppeteer page error: ${err.message}`);
        if (!this._stopped) {
          this._stopped = true;
          this._cleanup();
        }
      });

      // Set user agent to look like a normal Chrome browser
      await this.page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // Avatar camera is handled via --use-file-for-fake-video-capture flag
      // (no getUserMedia override needed — Chrome's fake device uses our Y4M video)

      // Pre-inject audio stream interceptor so we catch streams created during Zoom init
      await this.page.evaluateOnNewDocument(() => {
        // Queue of MediaStreams to tap once the audio capture pipeline is ready
        window.__realsyncQueuedStreams = [];

        const OrigAC = window.AudioContext || window.webkitAudioContext;
        if (!OrigAC) return;

        const origCMSS = OrigAC.prototype.createMediaStreamSource;
        OrigAC.prototype.createMediaStreamSource = function (stream) {
          // Queue the stream for capture later
          if (stream && !window.__realsyncAudioCapture) {
            window.__realsyncQueuedStreams.push(stream);
            console.log("[RealSync] Queued audio stream for later capture");
          }
          return origCMSS.call(this, stream);
        };
      });

      // Block file downloads (prevents zoom.pkg from downloading)
      const cdpSession = await this.page.createCDPSession();
      await cdpSession.send("Page.setDownloadBehavior", {
        behavior: "deny",
      });

      // Grant permissions for media
      const context = this.browser.defaultBrowserContext();
      await context.overridePermissions("https://app.zoom.us", [
        "camera",
        "microphone",
        "notifications",
      ]);
      await context.overridePermissions("https://us05web.zoom.us", [
        "camera",
        "microphone",
        "notifications",
      ]);

      // Validate URL before navigation to prevent SSRF
      const meetingParsed = new URL(this.meetingUrl);
      if (meetingParsed.protocol !== 'https:' || !(meetingParsed.hostname.endsWith('.zoom.us') || meetingParsed.hostname.endsWith('.zoom.com'))) {
        throw new Error(`[ZoomBot] Refused to navigate — not a Zoom URL: ${this.meetingUrl}`);
      }
      log.info("zoomBot", `Navigating to: ${this.meetingUrl}`);
      await this.page.goto(this.meetingUrl, {
        waitUntil: "networkidle2",
        timeout: PUPPETEER_TIMEOUT_MS,
      });
      await this._debugScreenshot("01_initial_load");

      // Handle the full Zoom join flow
      await this._handleZoomJoinFlow();

      if (this._stopped) { await this._cleanup(); return; }

      // Enable closed captions if available
      await this._enableClosedCaptions();

      if (this._stopped) { await this._cleanup(); return; }

      // Dismiss Zoom popup dialogs that overlay the video
      await this._dismissZoomPopups();

      if (this._stopped) { await this._cleanup(); return; }

      // Hide the bot's own video tile so screenshots only contain other participants
      await this._hideSelfView();

      if (this._stopped) { await this._cleanup(); return; }

      // Notify: connected with streams
      this.onIngestMessage({
        type: "source_status",
        status: "connected",
        streams: { audio: true, video: true, captions: true },
        ts: new Date().toISOString(),
      });

      // Start capture loops
      this._startFrameCapture();
      this._startCaptionScraping();
      this._startParticipantScraping();
      await this._startAudioCapture();

      log.info("zoomBot", "Successfully joined meeting and started capture (video + audio + captions).");
    } catch (err) {
      log.error("zoomBot", `Failed to join meeting: ${err.message}`);
      await this._debugScreenshot("error_state");

      this.onIngestMessage({
        type: "source_status",
        status: "disconnected",
        streams: { audio: false, video: false, captions: false },
        ts: new Date().toISOString(),
      });

      await this._cleanup();
      throw err;
    }
  }

  /**
   * Handle the Zoom web client join flow:
   *
   * Phase 1: Landing page (us05web.zoom.us/j/...)
   *   - Accept/dismiss cookie consent banner
   *   - Click "Join from Your Browser" button
   *
   * Phase 2: Web client join page (app.zoom.us/wc/{meetingId}/join)
   *   - Enter display name
   *   - Click "Join" button
   *
   * Phase 3: Wait for meeting view to load
   */
  async _handleZoomJoinFlow() {
    const page = this.page;

    // ─── Strategy: Navigate directly to the web client URL ───────────
    //
    // Clicking "Join from browser" on the landing page is unreliable:
    // - Sometimes triggers a protocol handler dialog
    // - Sometimes doesn't redirect in headless mode
    //
    // Instead, we construct the web client URL directly:
    //   https://app.zoom.us/wc/{meetingId}/join?pwd={password}
    //
    // This is the same URL you land on when clicking "Join from browser"
    // in a regular browser.

    const meetingIdMatch = this.meetingUrl.match(/\/j\/(\d+)/);
    const pwdMatch = this.meetingUrl.match(/[?&]pwd=([^&#]+)/);

    if (meetingIdMatch) {
      const meetingId = meetingIdMatch[1];
      const directUrl = `https://app.zoom.us/wc/${meetingId}/join${pwdMatch ? "?pwd=" + pwdMatch[1] : ""}`;
      // Validate constructed URL to prevent SSRF
      const parsedUrl = new URL(directUrl);
      if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'app.zoom.us') {
        throw new Error(`[ZoomBot] Refused to navigate — URL does not point to app.zoom.us: ${directUrl}`);
      }
      log.info("zoomBot", `Navigating directly to web client: ${directUrl}`);
      await page.goto(directUrl, { waitUntil: "networkidle2", timeout: 30000 });
    } else {
      // Fallback: try the landing page flow
      log.info("zoomBot", "Could not extract meeting ID — trying landing page flow...");
      await sleep(3000);
      await this._dismissCookieBanner();
      await this._clickJoinFromBrowser();

      // Wait for redirect
      const redirected = await this._waitForUrlChange("app.zoom.us/wc/", 15000);
      if (!redirected) {
        throw new Error("Could not navigate to Zoom web client. Meeting URL may be invalid.");
      }
    }

    await this._debugScreenshot("02_web_client_loaded");

    // Wait for the React SPA to fully mount the join form
    log.info("zoomBot", "Waiting for join form to render...");
    await sleep(5000);
    await this._debugScreenshot("03_join_form");

    const currentUrl = page.url();
    log.info("zoomBot", `Current URL: ${currentUrl}`);

    // Accept cookies on app.zoom.us (if banner appears here too)
    await this._dismissCookieBanner();

    // ─── Phase 2: Fill in name and click Join ─────────────────────────

    // Step 2A: Enter display name
    await this._enterDisplayName();
    await this._debugScreenshot("04_after_name_input");

    // Step 2A.5: Enable video (click "Start Video" if video is off)
    await this._enableVideoPreview();
    await sleep(1000);
    await this._debugScreenshot("04b_after_video_enable");

    // Step 2B: Click the "Join" button
    await this._clickJoinButton();

    // After clicking Join, Zoom may navigate to a new page/frame which
    // detaches the current execution context. Wrap everything in try-catch.
    try {
      await this._debugScreenshot("05_after_join_click");
    } catch (e) {
      log.info("zoomBot", "Frame detached after join click (expected during navigation).");
    }

    // ─── Phase 3: Wait for meeting view ──────────────────────────────

    log.info("zoomBot", "Waiting for meeting view...");
    // Wait for navigation to settle — Zoom transitions between pages
    try {
      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    } catch {
      // Navigation may have already completed
    }
    await sleep(8000);

    try {
      await this._debugScreenshot("06_meeting_view");
    } catch (e) {
      log.info("zoomBot", "Screenshot failed after join — retrying after wait...");
      await sleep(3000);
      try { await this._debugScreenshot("06_meeting_view"); } catch {}
    }

    // Check if we're still on the pre-join page vs actually in the meeting
    let isStillOnJoinPage = false;
    try {
      isStillOnJoinPage = await page.evaluate(() => {
        // If we can still see "Enter Meeting Info" or "Your Name" label, we're not in yet
        const bodyText = document.body.innerText || "";
        return bodyText.includes("Enter Meeting Info") || bodyText.includes("Your Name");
      });
    } catch {
      log.info("zoomBot", "Could not check join page state (frame may have changed).");
    }

    if (isStillOnJoinPage) {
      log.warn("zoomBot", "Still on pre-join page — attempting to click Join again...");
      try {
        await this._clickJoinButton();
        await sleep(5000);
        await this._debugScreenshot("06b_retry_join");
      } catch (e) {
        log.info("zoomBot", "Retry join click triggered navigation — continuing...");
        await sleep(5000);
      }
    }

    // Try to detect meeting view (excluding pre-join selectors)
    try {
      await page.waitForSelector(
        [
          "#wc-container-left",
          ".meeting-app",
          ".gallery-video-container",
          "#meeting-content",
          ".video-avatar",
          "#wc-content",
          ".meeting-client",
          ".meeting-info-container",
          '[class*="active-video"]',
          ".footer-button-base__button",
        ].join(", "),
        { timeout: PUPPETEER_TIMEOUT_MS }
      );
      log.info("zoomBot", "Meeting view detected — we're in!");
    } catch {
      // Check if we're still on a join page or if we're actually in
      let bodyText = "";
      try {
        bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
      } catch {
        log.info("zoomBot", "Could not read page text — frame may still be transitioning.");
        await sleep(5000);
        try {
          bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
        } catch {
          log.info("zoomBot", "Still cannot read page — continuing anyway.");
        }
      }
      log.warn("zoomBot", `Could not detect meeting view. Page text: ${bodyText.slice(0, 200)}`);

      // Check if we might be in a waiting room
      if (bodyText.includes("waiting") || bodyText.includes("host")) {
        log.info("zoomBot", "Looks like we're in a waiting room — waiting for host to admit...");
        // Wait up to 2 more minutes for host to admit (cancellable by leave())
        await this._interruptibleSleep(120000);
      }
      // Continue anyway — we might be in the meeting with different DOM structure
    }
  }

  /**
   * Dismiss cookie consent banner (OneTrust or Zoom's own).
   */
  async _dismissCookieBanner() {
    const page = this.page;
    log.info("zoomBot", "Looking for cookie consent banner...");

    try {
      // Try OneTrust "Accept All Cookies" button (Zoom uses OneTrust)
      const cookieSelectors = [
        "#onetrust-accept-btn-handler",   // OneTrust accept button
        "#onetrust-close-btn-container button", // OneTrust close button
        'button[id*="accept"]',
        'button[class*="cookie"]',
        '.cookie-banner button',
        'button:has-text("Accept")',
      ];

      for (const sel of cookieSelectors) {
        try {
          const btn = await page.$(sel);
          if (btn) {
            const isVisible = await page.evaluate((el) => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            }, btn);

            if (isVisible) {
              await btn.click();
              log.info("zoomBot", `Clicked cookie consent button: ${sel}`);
              await sleep(1000);
              return;
            }
          }
        } catch {
          // Try next selector
        }
      }

      // Fallback: try to find any visible "Accept" button by text
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        for (const btn of buttons) {
          const text = btn.textContent?.trim().toLowerCase() || "";
          if (
            (text.includes("accept") || text.includes("got it") || text.includes("agree")) &&
            btn.offsetParent !== null
          ) {
            btn.click();
            return text;
          }
        }
        return null;
      });

      if (clicked) {
        log.info("zoomBot", `Dismissed cookie banner via text match: "${clicked}"`);
        await sleep(1000);
      } else {
        log.info("zoomBot", "No cookie banner found (or already dismissed).");
      }
    } catch (err) {
      log.info("zoomBot", `Cookie banner handling: ${err.message}`);
    }
  }

  /**
   * Click the "Join from Your Browser" button on the Zoom landing page.
   * This is a <button> element, not an <a> link.
   */
  async _clickJoinFromBrowser() {
    const page = this.page;
    log.info("zoomBot", 'Looking for "Join from Your Browser" button...');

    // Strategy 1: Find button by text content (most reliable)
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, a"));
      for (const el of buttons) {
        const text = el.textContent?.trim().toLowerCase() || "";
        if (
          text.includes("join from your browser") ||
          text.includes("join from browser") ||
          text.includes("join from web")
        ) {
          el.click();
          return text;
        }
      }
      return null;
    });

    if (clicked) {
      log.info("zoomBot", `Clicked: "${clicked}"`);
      await sleep(2000);
      return;
    }

    // Strategy 2: Try known IDs / selectors
    const fallbackSelectors = [
      "#wc_join1",
      "#joinFromBrowser",
      'a[href*="/wc/"]',
      'a[href*="fromPWA"]',
    ];

    for (const sel of fallbackSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const text = await page.evaluate((e) => e.textContent?.trim(), el);
          log.info("zoomBot", `Found element with selector "${sel}" ("${text}") — clicking...`);
          await el.click();
          await sleep(2000);
          return;
        }
      } catch {
        // Try next
      }
    }

    // Strategy 3: Wait for the button to appear (it may load after a delay)
    log.info("zoomBot", "Button not found yet — waiting for it to appear...");
    await sleep(5000);
    await this._debugScreenshot("02b_waiting_for_join_button");

    const clickedLater = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, a"));
      for (const el of buttons) {
        const text = el.textContent?.trim().toLowerCase() || "";
        if (
          text.includes("join from your browser") ||
          text.includes("join from browser") ||
          text.includes("join from web")
        ) {
          el.click();
          return text;
        }
      }
      return null;
    });

    if (clickedLater) {
      log.info("zoomBot", `Clicked (after wait): "${clickedLater}"`);
      await sleep(2000);
    } else {
      log.warn("zoomBot", 'Could not find "Join from browser" button — page may have redirected directly.');
      // Check if we're already on the web client page
      if (page.url().includes("app.zoom.us/wc/")) {
        log.info("zoomBot", "Already on web client page — skipping.");
      }
    }
  }

  /**
   * Wait for the page URL to contain a target string (polling).
   * Returns true if URL changed within timeout, false otherwise.
   */
  async _waitForUrlChange(targetSubstring, timeoutMs = 20000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const url = this.page.url();
      if (url.includes(targetSubstring)) {
        log.info("zoomBot", `URL now contains "${targetSubstring}": ${url}`);
        return true;
      }
      await sleep(500);
    }
    log.info("zoomBot", `URL did not change to contain "${targetSubstring}" within ${timeoutMs}ms`);
    return false;
  }

  /**
   * Enter the display name on the web client join page.
   * The input field is typically labeled "Your Name" or has id "inputname".
   */
  async _enterDisplayName() {
    const page = this.page;
    log.info("zoomBot", `Looking for name input to enter "${this.displayName}"...`);

    // Log all inputs on the page for debugging
    const inputDebug = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      return inputs.map((el) => ({
        id: el.id,
        name: el.name,
        type: el.type,
        placeholder: el.placeholder,
        ariaLabel: el.getAttribute("aria-label") || "",
        className: el.className?.toString().slice(0, 80) || "",
        visible: el.getBoundingClientRect().width > 0,
      }));
    });
    log.info("zoomBot", `Found ${inputDebug.length} inputs: ${JSON.stringify(inputDebug, null, 2)}`);

    // Primary selectors for the name input
    const nameSelectors = [
      "#input-for-name",
      "#inputname",
      'input[name="inputname"]',
      'input[placeholder*="name" i]',
      'input[placeholder*="Name"]',
      "#join-confName",
    ];

    for (const sel of nameSelectors) {
      try {
        const input = await page.$(sel);
        if (input) {
          const isVisible = await page.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }, input);

          if (isVisible) {
            // Use React-compatible value setter to trigger state update
            await page.evaluate((el, name) => {
              el.focus();
              // Use the native setter to bypass React's synthetic event system
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, "value"
              ).set;
              nativeInputValueSetter.call(el, name);
              // Dispatch all events React might listen for
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
              // Also dispatch keyboard event to ensure React picks it up
              el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
              el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
            }, input, this.displayName);

            // Also type a character then backspace to trigger React onChange
            await sleep(200);
            await input.type("X", { delay: 50 });
            await sleep(100);
            await page.keyboard.press("Backspace");
            await sleep(200);

            // Verify the value was set
            const currentValue = await page.evaluate((el) => el.value, input);
            log.info("zoomBot", `Name input value after setting: "${currentValue}"`);

            if (!currentValue || currentValue.trim() === "") {
              // Fallback: clear and type directly
              log.info("zoomBot", "React setter failed, falling back to direct typing...");
              await input.click({ clickCount: 3 });
              await sleep(100);
              await input.type(this.displayName, { delay: 80 });
              await sleep(300);
            }

            log.info("zoomBot", `Entered display name via "${sel}"`);
            return;
          }
        }
      } catch {
        // Try next
      }
    }

    // Fallback: find first visible non-hidden text input
    const found = await page.evaluate((name) => {
      const inputs = Array.from(document.querySelectorAll("input"));
      for (const input of inputs) {
        const type = input.type?.toLowerCase() || "text";
        if (type !== "text" && type !== "" && type !== "search") continue;
        const rect = input.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (input.className?.includes("hideme")) continue;
        if (input.id?.includes("ot-") || input.id?.includes("onetrust")) continue;
        if (input.id?.includes("cdn_")) continue;

        input.focus();
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, "value"
        ).set;
        nativeInputValueSetter.call(input, name);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return "first-visible-input";
      }

      return null;
    }, this.displayName);

    if (found) {
      log.info("zoomBot", `Entered display name via fallback: ${found}`);
    } else {
      log.warn("zoomBot", "Could not find name input field.");
    }
  }

  /**
   * Enable video on the pre-join preview page.
   * Clicks the "Start Video" button if the camera is currently off.
   */
  async _enableVideoPreview() {
    const page = this.page;
    log.info("zoomBot", "Looking for video preview button to enable camera...");

    try {
      // The video button on the preview page has id "preview-video-control-button"
      // or shows "Stop Video" (already on) / camera icon with slash (off)
      const clicked = await page.evaluate(() => {
        // Check if there's a "Start Video" button or a video button that's off
        const videoBtn = document.querySelector("#preview-video-control-button");
        if (videoBtn) {
          // Check the button text or icon state
          const text = videoBtn.textContent?.trim() || "";
          const ariaLabel = videoBtn.getAttribute("aria-label") || "";
          const isOff = text.includes("Start") || ariaLabel.toLowerCase().includes("start");
          const isStopped = text.includes("Stop") || ariaLabel.toLowerCase().includes("stop");

          // If it says "Stop Video", the camera is already on
          if (isStopped) {
            return "already-on";
          }

          // Click to start video
          videoBtn.click();
          return "clicked-start";
        }

        // Fallback: find any button with video/camera text
        const buttons = Array.from(document.querySelectorAll("button"));
        for (const btn of buttons) {
          const text = btn.textContent?.trim().toLowerCase() || "";
          const ariaLabel = btn.getAttribute("aria-label")?.toLowerCase() || "";
          if (text.includes("start video") || ariaLabel.includes("start video")) {
            btn.click();
            return "clicked-start-text";
          }
        }

        return null;
      });

      if (clicked === "already-on") {
        log.info("zoomBot", "Video preview is already enabled.");
      } else if (clicked) {
        log.info("zoomBot", `Enabled video preview: ${clicked}`);
      } else {
        // Try clicking the video button by coordinates (it may just be an icon)
        const btn = await page.$("#preview-video-control-button");
        if (btn) {
          await btn.click();
          log.info("zoomBot", "Clicked video preview button directly.");
        } else {
          log.info("zoomBot", "Could not find video preview button.");
        }
      }
    } catch (err) {
      log.info("zoomBot", `Video preview toggle: ${err.message}`);
    }
  }

  /**
   * Click the "Join" button on the web client page.
   */
  async _clickJoinButton() {
    const page = this.page;
    log.info("zoomBot", 'Looking for "Join" button...');

    // Log all buttons for debugging
    const btnDebug = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons
        .filter((b) => b.getBoundingClientRect().width > 0)
        .map((b) => ({
          id: b.id,
          text: b.textContent?.trim().slice(0, 50),
          class: b.className?.toString().slice(0, 60),
          disabled: b.disabled,
          rect: b.getBoundingClientRect(),
        }));
    });
    log.info("zoomBot", `Visible buttons: ${JSON.stringify(btnDebug, null, 2)}`);

    // Wait for the Join button to become enabled (max 10 seconds)
    log.info("zoomBot", "Waiting for Join button to become enabled...");
    for (let attempt = 0; attempt < 20; attempt++) {
      const btnState = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        for (const btn of buttons) {
          const text = btn.textContent?.trim() || "";
          if (text === "Join" || text === "Join Meeting") {
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const classes = btn.className?.toString() || "";
              const isDisabled = btn.disabled || classes.includes("disabled");
              return { text, isDisabled, classes };
            }
          }
        }
        return null;
      });

      if (btnState) {
        log.info("zoomBot", `Join button state: disabled=${btnState.isDisabled}, classes="${btnState.classes}"`);
        if (!btnState.isDisabled) {
          log.info("zoomBot", "Join button is enabled!");
          break;
        }
      }

      await sleep(500);
    }

    // Get the Join button's coordinates and click via mouse.click at center
    const btnCoords = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      for (const btn of buttons) {
        const text = btn.textContent?.trim() || "";
        if (text === "Join" || text === "Join Meeting") {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            // 7.5: Removed btn.disabled=false — force-enabling a disabled Join
            // button can break Zoom's flow if it was intentionally disabled
            // (e.g. waiting for name input or media permissions).
            return {
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
              text,
            };
          }
        }
      }
      return null;
    });

    if (btnCoords) {
      log.info("zoomBot", `Clicking Join button "${btnCoords.text}" at (${btnCoords.x}, ${btnCoords.y}) via mouse...`);

      // Use page.mouse.click for a real mouse event (better React compatibility)
      await page.mouse.click(btnCoords.x, btnCoords.y);
      await sleep(1000);

      // Double-check: click again with a slight delay in case the first was swallowed
      await page.mouse.click(btnCoords.x, btnCoords.y);
      await sleep(3000);

      // If still on the page, try dispatching the click event directly on the element
      const stillOnJoin = await page.evaluate(() => {
        return document.body.innerText.includes("Enter Meeting Info");
      });

      if (stillOnJoin) {
        log.info("zoomBot", "Still on join page after mouse click — trying JS dispatch...");
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("button"));
          for (const btn of buttons) {
            const text = btn.textContent?.trim() || "";
            if (text === "Join" || text === "Join Meeting") {
              // 7.5: Removed btn.disabled=false — see note above
              // Dispatch a full set of mouse events
              const rect = btn.getBoundingClientRect();
              const x = rect.x + rect.width / 2;
              const y = rect.y + rect.height / 2;
              for (const eventType of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
                btn.dispatchEvent(new PointerEvent(eventType, {
                  bubbles: true,
                  cancelable: true,
                  clientX: x,
                  clientY: y,
                  pointerId: 1,
                  pointerType: "mouse",
                  button: 0,
                  view: window,
                }));
              }
              return true;
            }
          }
          return false;
        });
        await sleep(3000);
      }
    } else {
      log.warn("zoomBot", 'Could not find "Join" button.');
    }
  }

  /**
   * Dismiss Zoom popup dialogs / banners that overlay the video feed.
   * These popups (e.g. "Floating reactions", "meeting chats") obscure faces
   * and prevent the AI face detector from working.
   */
  async _dismissZoomPopups() {
    try {
      log.info("zoomBot", "Dismissing Zoom popups...");

      // Give popups a moment to appear
      await sleep(1500);

      // Strategy: click any visible OK/Got it/Close/Dismiss/X buttons in popup dialogs
      const dismissed = await this.page.evaluate(() => {
        let count = 0;

        // 1. Click OK / Got it / Dismiss buttons
        const buttons = Array.from(document.querySelectorAll("button"));
        for (const btn of buttons) {
          const text = (btn.textContent || "").trim().toLowerCase();
          const rect = btn.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          if (
            text === "ok" ||
            text === "got it" ||
            text === "dismiss" ||
            text === "close" ||
            text === "later" ||
            text === "not now" ||
            text === "maybe later" ||
            text === "skip"
          ) {
            // Don't click Leave/End/Stop buttons
            const dangerWords = ["leave", "end", "stop video", "mute"];
            if (dangerWords.some((w) => text.includes(w))) continue;

            btn.click();
            count++;
          }
        }

        // 2. Close notification banners (Low Network Bandwidth, etc.)
        const closeIcons = document.querySelectorAll(
          '[aria-label="Close"], [aria-label="close"], .zm-modal-close, .notification-close, .banner-close, .toast-close'
        );
        for (const el of closeIcons) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            el.click();
            count++;
          }
        }

        // 3. Remove any remaining overlay/modal elements by class patterns
        const overlays = document.querySelectorAll(
          '.zm-modal-mask, .zm-notification, [class*="tippy"], [class*="tooltip"], [class*="popover"], [class*="notification-container"]'
        );
        for (const el of overlays) {
          el.remove();
          count++;
        }

        return count;
      });

      if (dismissed > 0) {
        log.info("zoomBot", `Dismissed ${dismissed} popup(s)/overlay(s).`);
        await sleep(500);

        // Second pass — some popups appear in sequence
        const dismissed2 = await this.page.evaluate(() => {
          let count = 0;
          const buttons = Array.from(document.querySelectorAll("button"));
          for (const btn of buttons) {
            const text = (btn.textContent || "").trim().toLowerCase();
            const rect = btn.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (text === "ok" || text === "got it" || text === "dismiss" || text === "later") {
              const dangerWords = ["leave", "end", "stop video", "mute"];
              if (dangerWords.some((w) => text.includes(w))) continue;
              btn.click();
              count++;
            }
          }
          return count;
        });
        if (dismissed2 > 0) {
          log.info("zoomBot", `Dismissed ${dismissed2} more popup(s) on second pass.`);
        }
      } else {
        log.info("zoomBot", "No popups found to dismiss.");
      }
    } catch (err) {
      log.warn("zoomBot", `Popup dismissal error (non-fatal): ${err.message}`);
    }
  }

  /**
   * Hide the bot's own video tile ("Hide Self View") so screenshots
   * only contain other participants' faces. Works in both gallery and
   * speaker view. Falls back gracefully — capture still works if this fails.
   */
  async _hideSelfView() {
    try {
      log.info("zoomBot", "Attempting to hide self-view...");
      await sleep(1000);

      const hidden = await this.page.evaluate(() => {
        // Strategy 1: Right-click on the bot's own video tile to get context menu
        // Zoom Web SDK labels the self-view tile with the user's name or "You"
        const tiles = Array.from(document.querySelectorAll(
          '[class*="video-avatar"], [class*="participant-tile"], [class*="gallery-video-container"]'
        ));

        // Strategy 2: Use the View menu / "Hide Self View" option
        // Try clicking View button in the toolbar
        const viewBtns = Array.from(document.querySelectorAll("button"));
        for (const btn of viewBtns) {
          const text = (btn.textContent || "").trim().toLowerCase();
          if (text === "view") {
            btn.click();
            // Look for "Hide Self View" menu item after a tick
            return "clicked-view";
          }
        }

        // Strategy 3: CSS-based hiding — find and hide the self-view container
        // The self-view tile often has a "mute" indicator or the bot's own name
        const selfIndicators = document.querySelectorAll(
          '[class*="self-video"], [class*="active-speaker-myself"], [data-self="true"]'
        );
        for (const el of selfIndicators) {
          const tile = el.closest('[class*="video"]') || el.parentElement;
          if (tile) {
            tile.style.display = "none";
            return "css-hidden";
          }
        }

        return "no-match";
      });

      if (hidden === "clicked-view") {
        // Wait for menu to appear, then click "Hide Self View"
        await sleep(500);
        const menuClicked = await this.page.evaluate(() => {
          const items = Array.from(document.querySelectorAll(
            '[role="menuitem"], [role="option"], li, a, button, span'
          ));
          for (const item of items) {
            const text = (item.textContent || "").trim().toLowerCase();
            if (text.includes("hide self view") || text.includes("hide self")) {
              item.click();
              return true;
            }
          }
          // Close the menu if we didn't find the option
          document.body.click();
          return false;
        });
        log.info("zoomBot", menuClicked ? "Self-view hidden via View menu." : "Hide Self View option not found in menu.");
      } else {
        log.info("zoomBot", `Self-view hide result: ${hidden}`);
      }
    } catch (err) {
      log.warn("zoomBot", `Hide self-view failed (non-fatal): ${err.message}`);
    }
  }

  /**
   * Try to enable Zoom's built-in closed captions / live transcript.
   */
  async _enableClosedCaptions() {
    try {
      // Wait a moment for toolbar to render
      await sleep(2000);

      // Look for CC button in toolbar
      const ccButton = await this.page.$(
        [
          'button[aria-label*="caption" i]',
          'button[aria-label*="transcript" i]',
          'button[aria-label*="subtitle" i]',
          ".footer-button__cc-icon",
          '[data-type="ClosedCaption"]',
        ].join(", ")
      );

      if (ccButton) {
        await ccButton.click();
        log.info("zoomBot", "Enabled closed captions");
        await sleep(1000);
        return;
      }

      // Fallback: find button with CC/subtitle text
      const clicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        for (const btn of buttons) {
          const text = btn.textContent?.trim().toLowerCase() || "";
          const label = btn.getAttribute("aria-label")?.toLowerCase() || "";
          if (
            text.includes("caption") ||
            text.includes("transcript") ||
            text.includes("subtitle") ||
            label.includes("caption") ||
            label.includes("transcript")
          ) {
            btn.click();
            return true;
          }
        }
        return false;
      });

      if (clicked) {
        log.info("zoomBot", "Enabled CC via text search");
      } else {
        log.info("zoomBot", "CC button not found — captions may not be available.");
      }
    } catch {
      log.info("zoomBot", "Could not find CC button — will try DOM scraping.");
    }
  }

  /**
   * Capture screenshots at regular intervals and send as frames.
   * Uses recursive setTimeout instead of setInterval to prevent
   * overlapping captures when a frame takes longer than the interval.
   */
  _startFrameCapture() {
    let frameCount = 0;

    const captureLoop = async () => {
      if (this._stopped || !this.page) return;
      try {
        // Every 15 frames (~30s at 2fps), dismiss any new popups/overlays
        frameCount++;
        if (frameCount % 15 === 1) {
          await this.page.evaluate(() => {
            // Quick popup dismissal — click OK/Got it buttons and remove overlays
            const buttons = Array.from(document.querySelectorAll("button"));
            for (const btn of buttons) {
              const text = (btn.textContent || "").trim().toLowerCase();
              const rect = btn.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) continue;
              if (text === "ok" || text === "got it" || text === "dismiss" || text === "later") {
                if (["leave", "end", "stop video", "mute"].some((w) => text.includes(w))) continue;
                btn.click();
              }
            }
            // Remove overlay elements
            const overlays = document.querySelectorAll(
              '.zm-modal-mask, .zm-notification, [class*="notification-container"]'
            );
            for (const el of overlays) el.remove();
          }).catch(() => {});
        }

        // One-time DOM dump to discover Zoom's CSS class names for speaker detection
        if (!this._domDumped) {
          this._domDumped = true;
          const domInfo = await this.page.evaluate(() => {
            const matches = [];
            for (const el of document.querySelectorAll("*")) {
              const cls = el.className?.toString() || "";
              if (cls.match(/name|speaker|avatar|video-info|footer/i)) {
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) continue;
                matches.push({
                  tag: el.tagName,
                  cls: cls.slice(0, 200),
                  text: (el.textContent || "").trim().slice(0, 50),
                  rect: { x: Math.round(rect.x), y: Math.round(rect.y) },
                });
              }
            }
            return matches;
          }).catch(() => []);
          if (domInfo.length > 0) {
            log.info("zoomBot", `DOM dump (speaker/name elements): ${JSON.stringify(domInfo)}`);
          }
        }

        // Detect active speaker from Zoom DOM before capturing the frame
        const activeSpeaker = await this.page.evaluate((myName) => {
          const myLower = myName.toLowerCase();

          // Helper: extract participant name from a container element
          function extractName(container) {
            // Try specific name selectors first, then fall back to text content
            const selectors = [
              '.video-avatar__avatar-footer',
              '[class*="display-name"]',
              '[class*="attendee-name"]',
              '[class*="avatar-name"]',
            ];
            for (const sel of selectors) {
              const el = container.querySelector(sel);
              if (el) {
                const name = el.textContent?.trim();
                if (name && name.length > 1 && name.length < 50 && name.toLowerCase() !== myLower) {
                  return name;
                }
              }
            }
            return null;
          }

          // Strategy 1 (primary): Zoom's active speaker large view
          // The speaker-active-container__video-frame holds the main/active speaker
          const activeFrame = document.querySelector('.speaker-active-container__video-frame');
          if (activeFrame) {
            const name = extractName(activeFrame);
            if (name) return name;
          }

          // Strategy 2: Zoom's speaker bar active tile (has --active suffix)
          const activeTile = document.querySelector('.speaker-bar-container__video-frame--active');
          if (activeTile) {
            const name = extractName(activeTile);
            if (name) return name;
          }

          // Strategy 3: Generic speaking indicators (for other Zoom layouts/versions)
          const speakingSelectors = [
            '[class*="speaking"]:not([class*="non-speaking"])',
            '[class*="active-speaker"]',
            '[class*="active_speaker"]',
            '[aria-label*="speaking" i]',
          ];
          for (const sel of speakingSelectors) {
            const tiles = document.querySelectorAll(sel);
            for (const tile of tiles) {
              const name = extractName(tile) || tile.textContent?.trim();
              if (name && name.length > 1 && name.length < 50 && name.toLowerCase() !== myLower) {
                return name;
              }
              const parent = tile.closest('[class*="video"], [class*="participant"], [class*="tile"]');
              if (parent) {
                const parentName = extractName(parent);
                if (parentName) return parentName;
              }
            }
          }

          // Strategy 4 (last resort): Name in the largest video area by Y position
          const nameSelectors = [
            '[class*="display-name"]',
            '[class*="video-avatar"] [class*="name"]',
            '[class*="avatar-footer"] [class*="name"]',
          ];
          let speaker = null;
          let bestY = 0;
          for (const sel of nameSelectors) {
            const elements = document.querySelectorAll(sel);
            for (const el of elements) {
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) continue;
              const name = el.textContent?.trim();
              if (!name || name.length > 50 || name.toLowerCase() === myLower) continue;
              if (rect.y > 200 && rect.y > bestY) {
                bestY = rect.y;
                speaker = name;
              }
            }
          }
          return speaker || null;
        }, this.displayName || "RealSync Bot").catch(() => null);

        const screenshot = await this.page.screenshot({
          encoding: "base64",
          type: "jpeg",
          quality: 95,
        });

        this.onIngestMessage({
          type: "frame",
          dataB64: screenshot,
          activeSpeaker: activeSpeaker || null,
          width: VIEWPORT.width,
          height: VIEWPORT.height,
          capturedAt: new Date().toISOString(),
        });
      } catch (err) {
        // Page might have been closed
        if (!this._stopped) {
          log.warn("zoomBot", `Frame capture error: ${err.message}`);
        }
      }

      // Schedule next capture only if still active
      if (!this._stopped) {
        this._frameTimer = setTimeout(captureLoop, FRAME_INTERVAL_MS);
      }
    };

    captureLoop();
  }

  /**
   * Scrape caption/transcript text from the Zoom web client DOM.
   */
  _startCaptionScraping() {
    this._captionInterval = setInterval(async () => {
      if (this._stopped || !this.page) return;
      try {
        const captionData = await this.page.evaluate(() => {
          // Zoom web client caption containers (various versions)
          const selectors = [
            ".closed-caption-content",
            ".caption-text",
            '[class*="caption"]',
            ".live-transcript-container",
            '[class*="transcript"]',
            ".subtitle-content",
          ];

          for (const sel of selectors) {
            const elements = document.querySelectorAll(sel);
            if (elements.length > 0) {
              const lastEl = elements[elements.length - 1];
              const text = lastEl?.textContent?.trim() || "";
              if (!text) continue;
              // Try to extract speaker name
              const speakerEl = lastEl?.querySelector('[class*="speaker"], [class*="name"]');
              const speaker = speakerEl?.textContent?.trim() || null;
              return { text, speaker };
            }
          }
          return null;
        });

        if (captionData && captionData.text && captionData.text !== this._lastCaptionText) {
          this._lastCaptionText = captionData.text;
          this.onIngestMessage({
            type: "caption",
            text: captionData.text,
            speaker: captionData.speaker || "unknown",
            ts: new Date().toISOString(),
          });
        }
      } catch (err) {
        if (!this._stopped) {
          log.warn("zoomBot", `Caption scrape error: ${err.message}`);
        }
      }
    }, CAPTION_POLL_MS);
  }

  /**
   * Capture audio from the Zoom meeting by intercepting AudioContext output.
   *
   * Strategy:
   * - Expose a Node.js callback (`_onAudioChunk`) to the browser page
   * - Override `AudioContext.prototype.createMediaStreamSource` to tap into
   *   any audio streams Zoom creates (remote participant audio)
   * - Also hook `HTMLMediaElement.prototype.play` to capture <audio>/<video> elements
   * - Use a ScriptProcessorNode to read raw PCM samples
   * - Downsample from the AudioContext sample rate (typically 48kHz) to 16kHz mono
   * - Base64-encode the PCM16 buffer and send via the exposed callback
   */

  /**
   * Scrape participant names from Zoom's participant panel or video tile labels.
   * Polls every 10s and sends a "participants" ingest message when names change.
   */
  _startParticipantScraping() {
    const PARTICIPANT_POLL_MS = 10_000;

    // Try to open participant panel once
    this._openParticipantPanel().catch(() => {});

    this._participantInterval = setInterval(async () => {
      if (this._stopped || !this.page) return;
      try {
        const names = await this.page.evaluate(() => {
          const panelSelectors = [
            '[class*="participants-item__display-name"]',
            '[class*="participant-item__display-name"]',
            '[class*="participantItem__name"]',
            '[class*="participant-name"]',
            '[class*="participants-panel"] li [class*="name"]',
          ];
          for (const sel of panelSelectors) {
            const elements = document.querySelectorAll(sel);
            if (elements.length > 0) {
              return Array.from(elements)
                .map((el) => el.textContent?.trim() || "")
                .filter((n) => n.length > 0 && n.length <= 100)
                .slice(0, 20);
            }
          }
          // Fallback: video tile name labels
          const tileSelectors = [
            '[class*="video-avatar__display-name"]',
            '[class*="video-tile"] [class*="name"]',
            '[class*="attendee-name"]',
          ];
          for (const sel of tileSelectors) {
            const elements = document.querySelectorAll(sel);
            if (elements.length > 0) {
              return Array.from(elements)
                .map((el) => el.textContent?.trim() || "")
                .filter((n) => n.length > 0 && n.length <= 100)
                .slice(0, 20);
            }
          }
          return [];
        });

        if (!names || names.length === 0) return;

        // Filter out the bot's own name so it never appears in participant list
        const botName = (this.displayName || "RealSync Bot").toLowerCase();
        const filtered = names.filter((n) => {
          const lower = n.toLowerCase();
          return lower !== botName && !lower.includes("realsync bot");
        });
        if (filtered.length === 0) return;

        const namesKey = filtered.join("|");
        if (namesKey === this._lastParticipantNames.join("|")) return;

        this._lastParticipantNames = filtered;
        this.onIngestMessage({
          type: "participants",
          names: filtered,
          participants: names.map((name) => ({ name })),
          ts: new Date().toISOString(),
        });
      } catch (err) {
        if (!this._stopped) {
          log.warn("zoomBot", `Participant scrape error: ${err.message}`);
        }
      }
    }, PARTICIPANT_POLL_MS);
  }

  /**
   * Try to open the Zoom participant panel by clicking the Participants toolbar button.
   */
  async _openParticipantPanel() {
    if (!this.page) return;
    try {
      const clicked = await this.page.evaluate(() => {
        const selectors = [
          'button[aria-label*="participant" i]',
          'button[aria-label*="Participants" i]',
          '[data-type="Participants"]',
        ];
        for (const sel of selectors) {
          const btn = document.querySelector(sel);
          if (btn) {
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) { btn.click(); return true; }
          }
        }
        const buttons = Array.from(document.querySelectorAll("button"));
        for (const btn of buttons) {
          const text = (btn.textContent || "").trim().toLowerCase();
          if (text === "participants") {
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) { btn.click(); return true; }
          }
        }
        return false;
      });
      if (clicked) log.info("zoomBot", "Opened participant panel.");
    } catch (err) {
      log.warn("zoomBot", `_openParticipantPanel error: ${err.message}`);
    }
  }

  async _startAudioCapture() {
    if (this._audioCapturing || !this.page) return;
    this._audioCapturing = true;

    const chunkMs = AUDIO_CHUNK_MS;

    // Expose a function that the browser page can call to send audio data back to Node
    try {
      await this.page.exposeFunction("_onAudioChunk", (dataB64) => {
        if (this._stopped || !dataB64) return;
        this.onIngestMessage({
          type: "audio_pcm",
          sampleRate: 16000,
          channels: 1,
          dataB64,
          sourceParticipant: "meeting_audio",
        });
      });
    } catch (err) {
      // exposeFunction may fail if already exposed (page navigated)
      log.warn("zoomBot", `exposeFunction _onAudioChunk: ${err.message}`);
    }

    // Inject audio capture script into the page
    try {
      await this.page.evaluate((chunkInterval) => {
        // Avoid double-injection
        if (window.__realsyncAudioCapture) return;
        window.__realsyncAudioCapture = true;

        console.log("[RealSync AudioCapture] Initializing audio capture...");

        // Create a dedicated AudioContext for capturing
        const captureCtx = new AudioContext({ sampleRate: 48000 });
        window.__realsyncAudioContext = captureCtx;
        const TARGET_RATE = 16000;

        // Merger node: all tapped audio sources connect here
        const merger = captureCtx.createGain();
        merger.gain.value = 1.0;

        // ScriptProcessorNode for reading raw PCM (4096 samples per buffer)
        const processor = captureCtx.createScriptProcessor(4096, 1, 1);
        let audioBuffer = [];
        const samplesPerChunk = Math.floor((captureCtx.sampleRate * chunkInterval) / 1000);

        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          // Copy samples (input buffer is reused)
          audioBuffer.push(new Float32Array(input));

          // Check if we have enough samples for a chunk
          const totalSamples = audioBuffer.reduce((sum, arr) => sum + arr.length, 0);
          if (totalSamples >= samplesPerChunk) {
            // Concatenate all buffered samples
            const fullBuffer = new Float32Array(totalSamples);
            let offset = 0;
            for (const chunk of audioBuffer) {
              fullBuffer.set(chunk, offset);
              offset += chunk.length;
            }
            audioBuffer = [];

            // Downsample from source rate to 16kHz using linear interpolation
            const ratio = captureCtx.sampleRate / TARGET_RATE;
            const outLen = Math.floor(fullBuffer.length / ratio);
            const downsampled = new Float32Array(outLen);
            for (let i = 0; i < outLen; i++) {
              const srcIdx = i * ratio;
              const lo = Math.floor(srcIdx);
              const hi = Math.min(lo + 1, fullBuffer.length - 1);
              const frac = srcIdx - lo;
              downsampled[i] = fullBuffer[lo] * (1 - frac) + fullBuffer[hi] * frac;
            }

            // Convert float32 [-1, 1] → PCM16 (int16)
            const pcm16 = new Int16Array(downsampled.length);
            for (let i = 0; i < downsampled.length; i++) {
              const s = Math.max(-1, Math.min(1, downsampled[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            // Convert to base64
            const bytes = new Uint8Array(pcm16.buffer);
            let binary = "";
            for (let i = 0; i < bytes.length; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const b64 = btoa(binary);

            // Send to Node.js
            if (typeof window._onAudioChunk === "function") {
              window._onAudioChunk(b64);
            }
          }
        };

        merger.connect(processor);
        processor.connect(captureCtx.destination);

        // ── Hook 1: Intercept AudioContext.createMediaStreamSource ────
        // When Zoom creates a media stream source (for remote audio), tap into it
        const OrigAudioContext = window.AudioContext || window.webkitAudioContext;
        const origCreateMediaStreamSource = OrigAudioContext.prototype.createMediaStreamSource;

        OrigAudioContext.prototype.createMediaStreamSource = function (stream) {
          const source = origCreateMediaStreamSource.call(this, stream);
          console.log("[RealSync AudioCapture] Tapped createMediaStreamSource");

          try {
            // Create a source in our capture context from the same stream
            const captureSource = captureCtx.createMediaStreamSource(stream);
            captureSource.connect(merger);
          } catch (err) {
            console.warn("[RealSync AudioCapture] Could not tap stream:", err.message);
          }

          return source;
        };

        // ── Hook 2: Intercept HTMLMediaElement.play ───────────────────
        // Zoom may use <audio> or <video> elements for remote audio
        const origPlay = HTMLMediaElement.prototype.play;
        const tappedElements = new WeakSet();
        const tappedStreams = new WeakSet();

        HTMLMediaElement.prototype.play = function () {
          if (this.srcObject && !tappedStreams.has(this.srcObject)) {
            tappedElements.add(this);
            tappedStreams.add(this.srcObject);
            console.log("[RealSync AudioCapture] Tapped media element play()");
            try {
              const captureSource = captureCtx.createMediaStreamSource(this.srcObject);
              captureSource.connect(merger);
            } catch (err) {
              console.warn("[RealSync AudioCapture] Could not tap media element:", err.message);
            }
          }
          return origPlay.call(this);
        };

        // ── Hook 3: Monitor for new <audio>/<video> elements ─────────
        // Periodically check for any audio/video elements with srcObject
        setInterval(() => {
          const mediaEls = document.querySelectorAll("audio, video");
          mediaEls.forEach((el) => {
            if (el.srcObject && !tappedStreams.has(el.srcObject)) {
              tappedElements.add(el);
              tappedStreams.add(el.srcObject);
              console.log("[RealSync AudioCapture] Tapped existing media element");
              try {
                const captureSource = captureCtx.createMediaStreamSource(el.srcObject);
                captureSource.connect(merger);
              } catch (err) {
                // May fail if srcObject doesn't have audio tracks
              }
            }
          });
        }, 2000);

        // ── Hook 4: Process queued streams from early injection ────────
        if (window.__realsyncQueuedStreams && window.__realsyncQueuedStreams.length > 0) {
          console.log(`[RealSync AudioCapture] Processing ${window.__realsyncQueuedStreams.length} queued streams`);
          for (const stream of window.__realsyncQueuedStreams) {
            try {
              const captureSource = captureCtx.createMediaStreamSource(stream);
              captureSource.connect(merger);
              console.log("[RealSync AudioCapture] Connected queued stream");
            } catch (err) {
              console.warn("[RealSync AudioCapture] Could not connect queued stream:", err.message);
            }
          }
          window.__realsyncQueuedStreams = [];
        }

        console.log("[RealSync AudioCapture] Audio capture hooks installed.");
      }, chunkMs);

      log.info("zoomBot", "Audio capture started (in-browser hooks installed).");
    } catch (err) {
      log.warn("zoomBot", `Failed to inject audio capture: ${err.message}`);
      this._audioCapturing = false;
    }

    // PulseAudio fallback: capture system audio via parec
    try {
      const { spawn } = require("child_process");
      const monitorSource = "alsa_output.pci-0000_04_00.6.analog-stereo.monitor";
      this._parecProc = spawn("parec", [
        "--device=" + monitorSource,
        "--rate=16000", "--channels=1", "--format=s16le", "--raw"
      ]);

      let pcmBuffer = Buffer.alloc(0);
      const CHUNK_BYTES = 16000; // 500ms at 16kHz mono PCM16 = 16000 bytes

      this._parecProc.stdout.on("data", (data) => {
        pcmBuffer = Buffer.concat([pcmBuffer, data]);
        while (pcmBuffer.length >= CHUNK_BYTES) {
          const chunk = pcmBuffer.subarray(0, CHUNK_BYTES);
          pcmBuffer = pcmBuffer.subarray(CHUNK_BYTES);
          this.onIngestMessage({
            type: "audio_pcm",
            sampleRate: 16000,
            channels: 1,
            dataB64: chunk.toString("base64"),
            sourceParticipant: "meeting_audio",
          });
        }
      });

      this._parecProc.stderr.on("data", (data) => {
        const msg = data.toString().trim();
        if (msg) log.warn("zoomBot", `parec stderr: ${msg}`);
      });

      this._parecProc.on("error", (err) => {
        log.warn("zoomBot", `parec failed: ${err.message} — audio capture via PulseAudio unavailable`);
        this._parecProc = null;
      });

      this._parecProc.on("exit", (code) => {
        if (code !== null && code !== 0) {
          log.warn("zoomBot", `parec exited with code ${code}`);
        }
        this._parecProc = null;
      });

      log.info("zoomBot", "Audio capture started (PulseAudio loopback via parec).");
    } catch (err) {
      log.warn("zoomBot", `PulseAudio audio capture failed: ${err.message}`);
    }
  }

  /**
   * Cancellable sleep — resolves after ms, but can be interrupted by leave().
   */
  _interruptibleSleep(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this._sleepTimers = this._sleepTimers || [];
      this._sleepResolvers = this._sleepResolvers || [];
      this._sleepTimers.push(timer);
      this._sleepResolvers.push(resolve);
    });
  }

  async leave() {
    this._stopped = true;

    // Cancel any interruptible sleeps (e.g. waiting room timeout)
    if (this._sleepTimers) {
      this._sleepTimers.forEach(t => clearTimeout(t));
      this._sleepTimers = [];
    }
    if (this._sleepResolvers) {
      this._sleepResolvers.forEach(r => r());
      this._sleepResolvers = [];
    }

    // Stop capture loops
    if (this._frameTimer) {
      clearTimeout(this._frameTimer);
      this._frameTimer = null;
    }
    if (this._captionInterval) {
      clearInterval(this._captionInterval);
      this._captionInterval = null;
    }
    if (this._participantInterval) {
      clearInterval(this._participantInterval);
      this._participantInterval = null;
    }
    this._audioCapturing = false;

    // Kill parec if running
    if (this._parecProc) {
      this._parecProc.kill();
      this._parecProc = null;
    }

    // Try to click "Leave Meeting" in Zoom (best-effort, don't wait long)
    try {
      if (this.page && !this.page.isClosed()) {
        const leaveBtn = await Promise.race([
          this.page.$(
            [
              'button[aria-label*="Leave" i]',
              ".footer__leave-btn",
              '[data-type="Leave"]',
              'button[aria-label*="leave" i]',
            ].join(", ")
          ),
          sleep(2000).then(() => null),
        ]);

        if (leaveBtn) {
          await leaveBtn.click();
          await sleep(500);
          // Confirm leave dialog
          await this.page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll("button"));
            for (const btn of buttons) {
              const text = btn.textContent?.trim().toLowerCase() || "";
              if (text.includes("leave meeting") || text === "leave") {
                btn.click();
                return;
              }
            }
          }).catch(() => {});
          await sleep(500);
        }
      }
    } catch {
      // Best effort — browser.close() below will force-disconnect anyway
    }

    // Notify: disconnected
    this.onIngestMessage({
      type: "source_status",
      status: "disconnected",
      streams: { audio: false, video: false, captions: false },
      ts: new Date().toISOString(),
    });

    // Clean up in-page AudioContext and OscillatorNode
    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.evaluate(() => {
          if (window.__realsyncAudioContext) {
            window.__realsyncAudioContext.close().catch(() => {});
          }
          if (window.__realsyncOscillator) {
            try { window.__realsyncOscillator.stop(); } catch(e) {}
          }
        });
      }
    } catch { /* best effort */ }

    await this._cleanup();
    log.info("zoomBot", "Left meeting and cleaned up.");
  }

  async _cleanup() {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }
    } catch {
      // Best effort
    }
  }
}

module.exports = { ZoomBotAdapter };
