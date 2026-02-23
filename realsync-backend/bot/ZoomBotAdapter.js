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

const DEFAULT_DISPLAY_NAME = "RealSync Bot";
const JOIN_TIMEOUT_MS = 60_000; // 60s to get into the meeting
const FRAME_INTERVAL_MS = 2000; // 1 frame every 2s (0.5 FPS)
const CAPTION_POLL_MS = 1000; // check captions every 1s
const AUDIO_CHUNK_MS = 500; // send audio chunks every 500ms
const VIEWPORT = { width: 1280, height: 720 };

// Debug screenshots directory (only used when DEBUG_SCREENSHOTS=true)
const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");

// Animated bot avatar video (Y4M) — used as fake camera feed
const AVATAR_VIDEO_PATH = path.join(__dirname, "avatar-feed.y4m");

/** Simple sleep helper (replaces deprecated page.waitForTimeout) */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── RealSync logo as a data URI (loaded once at startup) ──────────────
const LOGO_PATH = path.join(__dirname, "../../Front-End/src/assets/4401d6799dc4e6061a79080f8825d69ae920f198.png");
let LOGO_DATA_URI = "";
try {
  const logoBuffer = fs.readFileSync(LOGO_PATH);
  LOGO_DATA_URI = `data:image/png;base64,${logoBuffer.toString("base64")}`;
  console.log("[ZoomBot] Loaded RealSync logo for virtual camera avatar.");
} catch {
  console.warn("[ZoomBot] Could not load RealSync logo — avatar will render without it.");
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
      if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.zoom.us')) {
        throw new Error('Invalid host');
      }
    } catch {
      throw new Error(`[ZoomBot] Invalid meeting URL — must be a https://*.zoom.us link: ${meetingUrl}`);
    }
    this.meetingUrl = meetingUrl;
    this.displayName = displayName || DEFAULT_DISPLAY_NAME;
    this.onIngestMessage = onIngestMessage;
    this.headless = headless !== undefined ? headless : true;
    this.debugScreenshots = debugScreenshots || process.env.DEBUG_SCREENSHOTS === "true";

    this.browser = null;
    this.page = null;
    this._frameInterval = null;
    this._captionInterval = null;
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
      console.log(`[ZoomBot][debug] Screenshot: ${filename}`);
    } catch {
      // Non-critical
    }
  }

  /**
   * Inject a virtual camera that renders the animated Baymax bot avatar.
   * Overrides navigator.mediaDevices.getUserMedia so Zoom sees our avatar
   * instead of the default green fake-device feed.
   */
  async _injectVirtualCamera() {
    const page = this.page;
    const logoDataUri = LOGO_DATA_URI;

    await page.evaluateOnNewDocument((logoUri) => {
      // ── Override enumerateDevices to report a virtual camera ───────
      const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);

      navigator.mediaDevices.enumerateDevices = async function () {
        let devices = [];
        try {
          devices = await originalEnumerateDevices();
        } catch { /* empty */ }

        // Check if we already have a videoinput device listed
        const hasVideo = devices.some((d) => d.kind === "videoinput");
        if (!hasVideo) {
          // Add a fake camera entry so Zoom enables the video UI
          devices.push({
            deviceId: "realsync-virtual-cam",
            groupId: "realsync-group",
            kind: "videoinput",
            label: "RealSync Virtual Camera",
            toJSON() { return { deviceId: this.deviceId, groupId: this.groupId, kind: this.kind, label: this.label }; },
          });
        }

        // Also ensure we have an audioinput
        const hasAudio = devices.some((d) => d.kind === "audioinput");
        if (!hasAudio) {
          devices.push({
            deviceId: "realsync-virtual-mic",
            groupId: "realsync-group",
            kind: "audioinput",
            label: "RealSync Virtual Mic",
            toJSON() { return { deviceId: this.deviceId, groupId: this.groupId, kind: this.kind, label: this.label }; },
          });
        }

        return devices;
      };

      // ── Override getUserMedia to intercept video requests ──────────
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

      navigator.mediaDevices.getUserMedia = async function (constraints) {
        // Only intercept video requests
        if (!constraints || !constraints.video) {
          // For audio-only, return a silent stream instead of failing
          try {
            return await originalGetUserMedia(constraints);
          } catch {
            // Create a silent audio stream
            const audioCtx = new AudioContext();
            const dest = audioCtx.createMediaStreamDestination();
            const osc = audioCtx.createOscillator();
            osc.connect(dest);
            osc.start();
            dest.stream.getAudioTracks()[0].enabled = false;
            return dest.stream;
          }
        }

        console.log("[RealSync VirtualCam] Injecting animated bot avatar camera feed");

        // ── Create offscreen canvas for the avatar ──────────────────
        const W = 640;
        const H = 480;
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d");

        // Preload logo image
        let logoImg = null;
        if (logoUri) {
          logoImg = new Image();
          logoImg.src = logoUri;
          await new Promise((resolve) => {
            logoImg.onload = resolve;
            logoImg.onerror = resolve;
            setTimeout(resolve, 3000);
          });
        }

        // ── Animation state ─────────────────────────────────────────
        const startTime = Date.now();

        function drawFrame() {
          const t = (Date.now() - startTime) / 1000; // seconds elapsed

          // Static gradient background matching the RealSync logo colors
          // (deep purple → indigo → blue → cyan → teal)
          const bgGrad = ctx.createLinearGradient(0, 0, W, H);
          bgGrad.addColorStop(0, "#1a0a2e");    // deep purple
          bgGrad.addColorStop(0.25, "#16133a");  // indigo
          bgGrad.addColorStop(0.5, "#0d1f3c");   // dark blue
          bgGrad.addColorStop(0.75, "#0a2a3a");  // teal-blue
          bgGrad.addColorStop(1, "#0c2e2e");     // dark teal
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, W, H);

          // Subtle radial vignette overlay for depth
          const vignette = ctx.createRadialGradient(cx, cy, 50, cx, cy, Math.max(W, H) * 0.7);
          vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
          vignette.addColorStop(1, "rgba(0, 0, 0, 0.35)");
          ctx.fillStyle = vignette;
          ctx.fillRect(0, 0, W, H);

          // Center the bot
          const cx = W / 2;
          const cy = H / 2 - 10;
          const scale = 1.8; // Scale up the bot

          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(scale, scale);

          // ── Breathing animation ──────────────────────────────
          const breathe = 1 + 0.008 * Math.sin(t * Math.PI / 2);
          ctx.scale(breathe, breathe);

          // ── Glow ring (pulsing) ─────────────────────────────
          const glowOpacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI / 3));
          ctx.strokeStyle = `rgba(0, 188, 212, ${glowOpacity})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(0, 0, 68, 82, 0, 0, Math.PI * 2);
          ctx.stroke();

          // ── Arms (behind body) ──────────────────────────────
          ctx.fillStyle = "#e2e4e9";
          ctx.strokeStyle = "#d0d4db";
          ctx.lineWidth = 0.8;
          // Left arm
          ctx.beginPath();
          ctx.ellipse(-70, 8, 12, 24, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Right arm
          ctx.beginPath();
          ctx.ellipse(70, 8, 12, 24, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // ── Head ────────────────────────────────────────────
          ctx.fillStyle = "#f0f2f5";
          ctx.strokeStyle = "#d8dce3";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(0, -32, 55, 52, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // ── Chest / torso ───────────────────────────────────
          const rx = 55, ry = 32;
          ctx.beginPath();
          ctx.moveTo(-rx, -35);
          ctx.lineTo(-rx, 55 - ry);
          ctx.arcTo(-rx, 55, -rx + ry, 55, ry);
          ctx.lineTo(rx - ry, 55);
          ctx.arcTo(rx, 55, rx, 55 - ry, ry);
          ctx.lineTo(rx, -35);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Seam cover
          ctx.fillStyle = "#f0f2f5";
          ctx.fillRect(-53, -42, 106, 28);

          // ── Eyes (with blink) ───────────────────────────────
          // Blink every ~4.5 seconds
          const blinkCycle = t % 4.5;
          let eyeScaleY = 1;
          if (blinkCycle > 4.05 && blinkCycle < 4.275) {
            // Closing
            eyeScaleY = Math.max(0.08, 1 - (blinkCycle - 4.05) / 0.1);
          } else if (blinkCycle > 4.275 && blinkCycle < 4.5) {
            // Opening
            eyeScaleY = Math.min(1, 0.08 + (blinkCycle - 4.275) / 0.1);
          }

          ctx.save();
          ctx.scale(1, eyeScaleY);
          const eyeY = -28 / eyeScaleY * (eyeScaleY < 1 ? eyeScaleY : 1);

          // Eye sockets (dark)
          ctx.fillStyle = "#2a2a3e";
          ctx.beginPath();
          ctx.ellipse(-20, eyeY, 16, 14, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(20, eyeY, 16, 14, 0, 0, Math.PI * 2);
          ctx.fill();
          // Bridge
          const bridgeH = 8;
          ctx.fillRect(-20, eyeY - bridgeH / 2, 40, bridgeH);

          // Inner eyes (darker)
          ctx.fillStyle = "#1a1a2e";
          ctx.beginPath();
          ctx.ellipse(-20, eyeY, 12, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(20, eyeY, 12, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(-17, eyeY - 5, 34, 10);

          // ── Pupils (wandering) ──────────────────────────────
          const wanderT = t / 8 * Math.PI * 2; // 8-second loop
          const px = 3 * Math.sin(wanderT) + 2 * Math.sin(wanderT * 1.7);
          const py = 1.5 * Math.cos(wanderT * 0.8) + Math.cos(wanderT * 1.3);

          // Left pupil
          ctx.fillStyle = "#e0e0e0";
          ctx.beginPath();
          ctx.arc(-20 + px, eyeY + py, 4.5, 0, Math.PI * 2);
          ctx.fill();

          // Right pupil (slightly delayed)
          const px2 = 3 * Math.sin(wanderT - 0.3) + 2 * Math.sin((wanderT - 0.3) * 1.7);
          const py2 = 1.5 * Math.cos((wanderT - 0.3) * 0.8) + Math.cos((wanderT - 0.3) * 1.3);
          ctx.beginPath();
          ctx.arc(20 + px2, eyeY + py2, 4.5, 0, Math.PI * 2);
          ctx.fill();

          // Pupil highlights
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.beginPath();
          ctx.arc(-18 + px, eyeY + py - 2, 1.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(22 + px2, eyeY + py2 - 2, 1.6, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore(); // end blink scale

          // ── Chest accent line ───────────────────────────────
          ctx.strokeStyle = "rgba(0, 188, 212, 0.25)";
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(-32, 4);
          ctx.lineTo(32, 4);
          ctx.stroke();

          // ── Logo on chest ───────────────────────────────────
          if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
            ctx.globalAlpha = 0.85;
            ctx.drawImage(logoImg, -35, 8, 70, 46);
            ctx.globalAlpha = 1;
          }

          // ── Ground shadow ───────────────────────────────────
          ctx.restore(); // end main transform

          const gradient = ctx.createRadialGradient(cx, cy + 92 * scale, 0, cx, cy + 92 * scale, 45 * scale);
          gradient.addColorStop(0, "rgba(0, 0, 0, 0.15)");
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.ellipse(cx, cy + 92 * scale, 45 * scale, 6 * scale, 0, 0, Math.PI * 2);
          ctx.fill();

          // ── "RealSync Bot" label at bottom ──────────────────
          ctx.fillStyle = "rgba(0, 188, 212, 0.6)";
          ctx.font = "14px Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("RealSync Bot", cx, H - 20);
        }

        // ── Start animation loop at 24 FPS ──────────────────────────
        function animate() {
          drawFrame();
          requestAnimationFrame(animate);
        }
        animate();

        // ── Return canvas stream as camera ──────────────────────────
        const stream = canvas.captureStream(24);

        // If audio was also requested, get real audio (or silence)
        if (constraints.audio) {
          try {
            const audioStream = await originalGetUserMedia({ audio: constraints.audio });
            for (const track of audioStream.getAudioTracks()) {
              stream.addTrack(track);
            }
          } catch {
            // Create silent audio track
            const audioCtx = new AudioContext();
            const oscillator = audioCtx.createOscillator();
            const dest = audioCtx.createMediaStreamDestination();
            oscillator.connect(dest);
            oscillator.start();
            const silentTrack = dest.stream.getAudioTracks()[0];
            // Mute it
            silentTrack.enabled = false;
            stream.addTrack(silentTrack);
          }
        }

        return stream;
      };
    }, logoDataUri);

    console.log("[ZoomBot] Virtual camera override injected (animated Baymax avatar).");
  }

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
          "--disable-web-security",
          "--disable-features=IsolateOrigins",
          "--disable-site-isolation-trials",
          `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
        ],
        defaultViewport: VIEWPORT,
      });

      this.page = await this.browser.newPage();

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
      if (meetingParsed.protocol !== 'https:' || !meetingParsed.hostname.endsWith('.zoom.us')) {
        throw new Error(`[ZoomBot] Refused to navigate — not a Zoom URL: ${this.meetingUrl}`);
      }
      console.log(`[ZoomBot] Navigating to: ${this.meetingUrl}`);
      await this.page.goto(this.meetingUrl, {
        waitUntil: "networkidle2",
        timeout: JOIN_TIMEOUT_MS,
      });
      await this._debugScreenshot("01_initial_load");

      // Handle the full Zoom join flow
      await this._handleZoomJoinFlow();

      if (this._stopped) return;

      // Enable closed captions if available
      await this._enableClosedCaptions();

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
      await this._startAudioCapture();

      console.log("[ZoomBot] Successfully joined meeting and started capture (video + audio + captions).");
    } catch (err) {
      console.error(`[ZoomBot] Failed to join meeting: ${err.message}`);
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
      console.log(`[ZoomBot] Navigating directly to web client: ${directUrl}`);
      await page.goto(directUrl, { waitUntil: "networkidle2", timeout: 30000 });
    } else {
      // Fallback: try the landing page flow
      console.log("[ZoomBot] Could not extract meeting ID — trying landing page flow...");
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
    console.log("[ZoomBot] Waiting for join form to render...");
    await sleep(5000);
    await this._debugScreenshot("03_join_form");

    const currentUrl = page.url();
    console.log(`[ZoomBot] Current URL: ${currentUrl}`);

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
      console.log("[ZoomBot] Frame detached after join click (expected during navigation).");
    }

    // ─── Phase 3: Wait for meeting view ──────────────────────────────

    console.log("[ZoomBot] Waiting for meeting view...");
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
      console.log("[ZoomBot] Screenshot failed after join — retrying after wait...");
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
      console.log("[ZoomBot] Could not check join page state (frame may have changed).");
    }

    if (isStillOnJoinPage) {
      console.warn("[ZoomBot] Still on pre-join page — attempting to click Join again...");
      try {
        await this._clickJoinButton();
        await sleep(5000);
        await this._debugScreenshot("06b_retry_join");
      } catch (e) {
        console.log("[ZoomBot] Retry join click triggered navigation — continuing...");
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
        { timeout: JOIN_TIMEOUT_MS }
      );
      console.log("[ZoomBot] Meeting view detected — we're in!");
    } catch {
      // Check if we're still on a join page or if we're actually in
      let bodyText = "";
      try {
        bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
      } catch {
        console.log("[ZoomBot] Could not read page text — frame may still be transitioning.");
        await sleep(5000);
        try {
          bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
        } catch {
          console.log("[ZoomBot] Still cannot read page — continuing anyway.");
        }
      }
      console.warn(`[ZoomBot] Could not detect meeting view. Page text: ${bodyText.slice(0, 200)}`);

      // Check if we might be in a waiting room
      if (bodyText.includes("waiting") || bodyText.includes("host")) {
        console.log("[ZoomBot] Looks like we're in a waiting room — waiting for host to admit...");
        // Wait up to 2 more minutes for host to admit
        await sleep(120000);
      }
      // Continue anyway — we might be in the meeting with different DOM structure
    }
  }

  /**
   * Dismiss cookie consent banner (OneTrust or Zoom's own).
   */
  async _dismissCookieBanner() {
    const page = this.page;
    console.log("[ZoomBot] Looking for cookie consent banner...");

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
              console.log(`[ZoomBot] Clicked cookie consent button: ${sel}`);
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
        console.log(`[ZoomBot] Dismissed cookie banner via text match: "${clicked}"`);
        await sleep(1000);
      } else {
        console.log("[ZoomBot] No cookie banner found (or already dismissed).");
      }
    } catch (err) {
      console.log(`[ZoomBot] Cookie banner handling: ${err.message}`);
    }
  }

  /**
   * Click the "Join from Your Browser" button on the Zoom landing page.
   * This is a <button> element, not an <a> link.
   */
  async _clickJoinFromBrowser() {
    const page = this.page;
    console.log('[ZoomBot] Looking for "Join from Your Browser" button...');

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
      console.log(`[ZoomBot] Clicked: "${clicked}"`);
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
          console.log(`[ZoomBot] Found element with selector "${sel}" ("${text}") — clicking...`);
          await el.click();
          await sleep(2000);
          return;
        }
      } catch {
        // Try next
      }
    }

    // Strategy 3: Wait for the button to appear (it may load after a delay)
    console.log("[ZoomBot] Button not found yet — waiting for it to appear...");
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
      console.log(`[ZoomBot] Clicked (after wait): "${clickedLater}"`);
      await sleep(2000);
    } else {
      console.warn('[ZoomBot] Could not find "Join from browser" button — page may have redirected directly.');
      // Check if we're already on the web client page
      if (page.url().includes("app.zoom.us/wc/")) {
        console.log("[ZoomBot] Already on web client page — skipping.");
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
        console.log(`[ZoomBot] URL now contains "${targetSubstring}": ${url}`);
        return true;
      }
      await sleep(500);
    }
    console.log(`[ZoomBot] URL did not change to contain "${targetSubstring}" within ${timeoutMs}ms`);
    return false;
  }

  /**
   * Enter the display name on the web client join page.
   * The input field is typically labeled "Your Name" or has id "inputname".
   */
  async _enterDisplayName() {
    const page = this.page;
    console.log(`[ZoomBot] Looking for name input to enter "${this.displayName}"...`);

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
    console.log(`[ZoomBot] Found ${inputDebug.length} inputs:`, JSON.stringify(inputDebug, null, 2));

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
            console.log(`[ZoomBot] Name input value after setting: "${currentValue}"`);

            if (!currentValue || currentValue.trim() === "") {
              // Fallback: clear and type directly
              console.log("[ZoomBot] React setter failed, falling back to direct typing...");
              await input.click({ clickCount: 3 });
              await sleep(100);
              await input.type(this.displayName, { delay: 80 });
              await sleep(300);
            }

            console.log(`[ZoomBot] Entered display name via "${sel}"`);
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
      console.log(`[ZoomBot] Entered display name via fallback: ${found}`);
    } else {
      console.warn("[ZoomBot] Could not find name input field.");
    }
  }

  /**
   * Enable video on the pre-join preview page.
   * Clicks the "Start Video" button if the camera is currently off.
   */
  async _enableVideoPreview() {
    const page = this.page;
    console.log("[ZoomBot] Looking for video preview button to enable camera...");

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
        console.log("[ZoomBot] Video preview is already enabled.");
      } else if (clicked) {
        console.log(`[ZoomBot] Enabled video preview: ${clicked}`);
      } else {
        // Try clicking the video button by coordinates (it may just be an icon)
        const btn = await page.$("#preview-video-control-button");
        if (btn) {
          await btn.click();
          console.log("[ZoomBot] Clicked video preview button directly.");
        } else {
          console.log("[ZoomBot] Could not find video preview button.");
        }
      }
    } catch (err) {
      console.log(`[ZoomBot] Video preview toggle: ${err.message}`);
    }
  }

  /**
   * Click the "Join" button on the web client page.
   */
  async _clickJoinButton() {
    const page = this.page;
    console.log('[ZoomBot] Looking for "Join" button...');

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
    console.log(`[ZoomBot] Visible buttons:`, JSON.stringify(btnDebug, null, 2));

    // Wait for the Join button to become enabled (max 10 seconds)
    console.log("[ZoomBot] Waiting for Join button to become enabled...");
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
        console.log(`[ZoomBot] Join button state: disabled=${btnState.isDisabled}, classes="${btnState.classes}"`);
        if (!btnState.isDisabled) {
          console.log("[ZoomBot] Join button is enabled!");
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
            // Force-enable the button
            btn.classList.remove("disabled");
            btn.disabled = false;
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
      console.log(`[ZoomBot] Clicking Join button "${btnCoords.text}" at (${btnCoords.x}, ${btnCoords.y}) via mouse...`);

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
        console.log("[ZoomBot] Still on join page after mouse click — trying JS dispatch...");
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("button"));
          for (const btn of buttons) {
            const text = btn.textContent?.trim() || "";
            if (text === "Join" || text === "Join Meeting") {
              btn.classList.remove("disabled");
              btn.disabled = false;
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
      console.warn('[ZoomBot] Could not find "Join" button.');
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
        console.log("[ZoomBot] Enabled closed captions");
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
        console.log("[ZoomBot] Enabled CC via text search");
      } else {
        console.log("[ZoomBot] CC button not found — captions may not be available.");
      }
    } catch {
      console.log("[ZoomBot] Could not find CC button — will try DOM scraping.");
    }
  }

  /**
   * Capture screenshots at regular intervals and send as frames.
   */
  _startFrameCapture() {
    this._frameInterval = setInterval(async () => {
      if (this._stopped || !this.page) return;
      try {
        const screenshot = await this.page.screenshot({
          encoding: "base64",
          type: "jpeg",
          quality: 70,
        });

        this.onIngestMessage({
          type: "frame",
          dataB64: screenshot,
          width: VIEWPORT.width,
          height: VIEWPORT.height,
          capturedAt: new Date().toISOString(),
        });
      } catch (err) {
        // Page might have been closed
        if (!this._stopped) {
          console.warn(`[ZoomBot] Frame capture error: ${err.message}`);
        }
      }
    }, FRAME_INTERVAL_MS);
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
          console.warn(`[ZoomBot] Caption scrape error: ${err.message}`);
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
      console.warn(`[ZoomBot] exposeFunction _onAudioChunk: ${err.message}`);
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

            // Downsample from source rate to 16kHz
            const ratio = captureCtx.sampleRate / TARGET_RATE;
            const downsampled = new Float32Array(Math.floor(fullBuffer.length / ratio));
            for (let i = 0; i < downsampled.length; i++) {
              downsampled[i] = fullBuffer[Math.floor(i * ratio)];
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

        HTMLMediaElement.prototype.play = function () {
          if (!tappedElements.has(this) && this.srcObject) {
            tappedElements.add(this);
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
            if (!tappedElements.has(el) && el.srcObject) {
              tappedElements.add(el);
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

      console.log("[ZoomBot] Audio capture started (in-browser hooks installed).");
    } catch (err) {
      console.warn(`[ZoomBot] Failed to inject audio capture: ${err.message}`);
      this._audioCapturing = false;
    }
  }

  /**
   * Leave the meeting and clean up.
   */
  async leave() {
    this._stopped = true;

    // Stop capture loops
    if (this._frameInterval) {
      clearInterval(this._frameInterval);
      this._frameInterval = null;
    }
    if (this._captionInterval) {
      clearInterval(this._captionInterval);
      this._captionInterval = null;
    }
    this._audioCapturing = false;

    // Try to click "Leave Meeting" in Zoom
    try {
      if (this.page && !this.page.isClosed()) {
        // Find leave button
        const leaveBtn = await this.page.$(
          [
            'button[aria-label*="Leave" i]',
            ".footer__leave-btn",
            '[data-type="Leave"]',
          ].join(", ")
        );

        if (leaveBtn) {
          await leaveBtn.click();
          await sleep(1000);

          // Confirm leave
          const confirmClicked = await this.page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll("button"));
            for (const btn of buttons) {
              const text = btn.textContent?.trim().toLowerCase() || "";
              if (text.includes("leave meeting") || text === "leave") {
                btn.click();
                return true;
              }
            }
            return false;
          });

          if (confirmClicked) {
            console.log("[ZoomBot] Confirmed leave meeting.");
            await sleep(1000);
          }
        }
      }
    } catch {
      // Best effort
    }

    // Notify: disconnected
    this.onIngestMessage({
      type: "source_status",
      status: "disconnected",
      streams: { audio: false, video: false, captions: false },
      ts: new Date().toISOString(),
    });

    await this._cleanup();
    console.log("[ZoomBot] Left meeting and cleaned up.");
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
