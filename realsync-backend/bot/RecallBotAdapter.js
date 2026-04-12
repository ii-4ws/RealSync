/**
 * RecallBotAdapter — Recall.ai API-based meeting bot.
 *
 * Replaces ZoomBotAdapter (Puppeteer). Uses Recall.ai's native meeting SDKs
 * to get per-participant video frames (PNG 360p ~2fps) and audio (PCM 16kHz
 * mono S16LE) via WebSocket. Supports Zoom, Google Meet, and Microsoft Teams.
 *
 * Same interface as ZoomBotAdapter:
 *   const adapter = new RecallBotAdapter({ meetingUrl, displayName, onIngestMessage });
 *   await adapter.join();
 *   await adapter.leave();
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const log = require("../lib/logger");
const { registerAdapter, unregisterAdapter } = require("../ws/recallWs");

const DEFAULT_DISPLAY_NAME = "RealSync Bot";

// Bot avatar — shown as the bot's camera tile in Zoom
const AVATAR_B64_PATH = path.join(__dirname, "realsync-bot-avatar-b64.txt");
let BOT_AVATAR_B64 = null;
try { BOT_AVATAR_B64 = fs.readFileSync(AVATAR_B64_PATH, "utf-8").trim(); } catch { /* no avatar */ }
const STATUS_POLL_MS = 3000;
const STATUS_POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 min max polling

const RECALL_API_KEY = process.env.RECALL_API_KEY;
const RECALL_REGION = process.env.RECALL_REGION || "us-west-2";
const RECALL_WS_BASE_URL = process.env.RECALL_WS_BASE_URL || "wss://api.real-sync.app";
const RECALL_API_BASE = `https://${RECALL_REGION}.recall.ai/api/v1`;

class RecallBotAdapter {
  /**
   * @param {object} opts
   * @param {string} opts.meetingUrl - Meeting URL (Zoom, Meet, or Teams)
   * @param {string} [opts.displayName]
   * @param {function} opts.onIngestMessage - (message) => void
   */
  constructor({ meetingUrl, displayName, onIngestMessage }) {
    if (!meetingUrl) {
      throw new Error("[RecallBot] meetingUrl is required");
    }
    if (!RECALL_API_KEY) {
      throw new Error("[RecallBot] RECALL_API_KEY environment variable is required");
    }

    this.meetingUrl = meetingUrl;
    this.displayName = displayName || DEFAULT_DISPLAY_NAME;
    this.onIngestMessage = onIngestMessage;

    this._recallBotId = null;
    this._wsToken = crypto.randomUUID();
    this._currentSpeakerId = null;
    this._participants = new Map(); // participantId → { id, name, isSpeaking }
    this._stopped = false;
    this._statusPollInterval = null;
    this._statusPollStartedAt = null;
    this._recordingRequested = false;
    this._audioDiagDone = false;
    this._wsConnection = null; // set by recallWs.js
  }

  /* ------------------------------------------------------------------ */
  /*  join / leave                                                       */
  /* ------------------------------------------------------------------ */

  async join() {
    this._stopped = false;

    // Register in the adapter registry so recallWs.js can route WS messages
    registerAdapter(this._wsToken, this);

    const wsEndpointUrl = `${RECALL_WS_BASE_URL}/ws/recall?token=${this._wsToken}`;

    const body = {
      meeting_url: this.meetingUrl,
      bot_name: this.displayName,
      ...(BOT_AVATAR_B64 && {
        automatic_video_output: {
          in_call_recording: { kind: "jpeg", b64_data: BOT_AVATAR_B64 },
        },
      }),
      recording_config: {
        video_separate_png: {},
        audio_separate_raw: {},
        transcript: {
          provider: { meeting_captions: {} },
        },
        realtime_endpoints: [
          {
            type: "websocket",
            url: wsEndpointUrl,
            events: [
              "video_separate_png.data",
              "audio_separate_raw.data",
              "participant_events.join",
              "participant_events.leave",
              "participant_events.speech_on",
              "participant_events.speech_off",
              "transcript.data",
            ],
          },
        ],
      },
    };

    log.info("recallBot", `Creating bot for ${this.meetingUrl} (WS: ${wsEndpointUrl})`);

    // Emit joining status
    this.onIngestMessage({
      type: "source_status",
      status: "joining",
      streams: { audio: false, video: false, captions: false },
      ts: new Date().toISOString(),
    });

    try {
      const res = await fetch(`${RECALL_API_BASE}/bot/`, {
        method: "POST",
        headers: {
          Authorization: `Token ${RECALL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Recall API ${res.status}: ${errText}`);
      }

      const data = await res.json();
      this._recallBotId = data.id;
      log.info("recallBot", `Bot created: ${this._recallBotId}`);
    } catch (err) {
      log.error("recallBot", `Failed to create bot: ${err.message}`);
      this.onIngestMessage({
        type: "source_status",
        status: "error",
        streams: { audio: false, video: false, captions: false },
        ts: new Date().toISOString(),
      });
      this.onIngestMessage({
        type: "bot_fallback",
        reason: "recall_api_error",
        message: `Failed to create Recall.ai bot: ${err.message}`,
        ts: new Date().toISOString(),
      });
      unregisterAdapter(this._wsToken);
      throw err;
    }

    // Poll bot status until it's in the call
    this._startStatusPolling();
  }

  async leave() {
    this._stopped = true;

    if (this._statusPollInterval) {
      clearInterval(this._statusPollInterval);
      this._statusPollInterval = null;
    }

    if (this._recallBotId) {
      try {
        const res = await fetch(`${RECALL_API_BASE}/bot/${this._recallBotId}/leave_call/`, {
          method: "POST",
          headers: { Authorization: `Token ${RECALL_API_KEY}` },
        });
        if (res.ok) {
          log.info("recallBot", `Bot ${this._recallBotId} left the call`);
        } else {
          log.warn("recallBot", `Leave call returned ${res.status}`);
        }
      } catch (err) {
        log.warn("recallBot", `Error leaving call: ${err.message}`);
      }
    }

    if (this._wsConnection) {
      try { this._wsConnection.close(); } catch { /* ignore */ }
      this._wsConnection = null;
    }

    unregisterAdapter(this._wsToken);

    this.onIngestMessage({
      type: "source_status",
      status: "disconnected",
      streams: { audio: false, video: false, captions: false },
      ts: new Date().toISOString(),
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Status polling                                                     */
  /* ------------------------------------------------------------------ */

  _startStatusPolling() {
    this._statusPollStartedAt = Date.now();

    this._statusPollInterval = setInterval(async () => {
      if (this._stopped) {
        clearInterval(this._statusPollInterval);
        return;
      }

      // Timeout safety
      if (Date.now() - this._statusPollStartedAt > STATUS_POLL_TIMEOUT_MS) {
        log.error("recallBot", "Status polling timed out after 5 minutes");
        clearInterval(this._statusPollInterval);
        this.onIngestMessage({
          type: "bot_fallback",
          reason: "poll_timeout",
          message: "Bot failed to join the meeting within 5 minutes.",
          ts: new Date().toISOString(),
        });
        return;
      }

      try {
        const res = await fetch(`${RECALL_API_BASE}/bot/${this._recallBotId}/`, {
          headers: { Authorization: `Token ${RECALL_API_KEY}` },
        });

        if (!res.ok) return;

        const data = await res.json();
        const status = data.status_changes?.[data.status_changes.length - 1]?.code;

        if (status === "in_waiting_room") {
          log.info("recallBot", "Bot is in waiting room — host must admit");
          this.onIngestMessage({
            type: "source_status",
            status: "waiting_room",
            streams: { audio: false, video: false, captions: false },
            ts: new Date().toISOString(),
          });
        } else if (status === "in_call_not_recording") {
          // Bot is in the call but hasn't received recording permission yet.
          // Request it — Zoom will prompt the host to allow recording.
          if (!this._recordingRequested) {
            this._recordingRequested = true;
            log.info("recallBot", "Requesting recording permission from host...");
            fetch(`${RECALL_API_BASE}/bot/${this._recallBotId}/request_recording_permission/`, {
              method: "POST",
              headers: { Authorization: `Token ${RECALL_API_KEY}` },
            }).catch((err) => log.warn("recallBot", `Recording permission request failed: ${err.message}`));
          }
          this.onIngestMessage({
            type: "source_status",
            status: "connected",
            streams: { audio: false, video: true, captions: false },
            ts: new Date().toISOString(),
          });
        } else if (status === "in_call_recording" || status === "recording_permission_allowed") {
          log.info("recallBot", `Bot is recording (${status})`);
          clearInterval(this._statusPollInterval);
          this._statusPollInterval = null;
          this.onIngestMessage({
            type: "source_status",
            status: "connected",
            streams: { audio: true, video: true, captions: true },
            ts: new Date().toISOString(),
          });
        } else if (status === "fatal" || status === "done") {
          log.error("recallBot", `Bot reached terminal status: ${status}`);
          clearInterval(this._statusPollInterval);
          this._statusPollInterval = null;
          const sub = data.status_changes?.[data.status_changes.length - 1]?.sub_code || "unknown";
          this.onIngestMessage({
            type: "bot_fallback",
            reason: `recall_${status}`,
            message: `Recall.ai bot ${status}: ${sub}`,
            ts: new Date().toISOString(),
          });
        }
      } catch (err) {
        log.warn("recallBot", `Status poll error: ${err.message}`);
      }
    }, STATUS_POLL_MS);
  }

  /* ------------------------------------------------------------------ */
  /*  WebSocket message handling (called by recallWs.js)                 */
  /* ------------------------------------------------------------------ */

  _handleRecallMessage(msg) {
    if (this._stopped) return;

    try {
      const event = msg.event;
      const payload = msg.data?.data;

      if (!event || !payload) {
        log.warn("recallBot", `Malformed message: missing event or data.data`);
        return;
      }

      switch (event) {
        case "video_separate_png.data":
          this._handleVideoFrame(payload);
          break;
        case "audio_separate_raw.data":
        case "audio_mixed_raw.data":
          this._handleAudioChunk(payload);
          break;
        case "participant_events.join":
          this._handleParticipantJoin(payload);
          break;
        case "participant_events.leave":
          this._handleParticipantLeave(payload);
          break;
        case "participant_events.speech_on":
          this._handleSpeechOn(payload);
          break;
        case "participant_events.speech_off":
          this._handleSpeechOff(payload);
          break;
        case "transcript.data":
          this._handleTranscript(payload);
          break;
        default:
          // Ignore unknown events silently
          break;
      }
    } catch (err) {
      log.error("recallBot", `Error handling message: ${err.message}`);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Event handlers                                                     */
  /* ------------------------------------------------------------------ */

  _handleVideoFrame(payload) {
    const participant = payload.participant;
    if (!participant) return;

    // Only forward frames from the active speaker (or all if none tracked yet)
    if (this._currentSpeakerId !== null && participant.id !== this._currentSpeakerId) {
      return;
    }

    this.onIngestMessage({
      type: "frame",
      dataB64: payload.buffer,
      activeSpeaker: participant.name || null,
      width: 640,
      height: 360,
      capturedAt: payload.timestamp?.absolute || new Date().toISOString(),
    });
  }

  _handleAudioChunk(payload) {
    this.onIngestMessage({
      type: "audio_pcm",
      sampleRate: 16000,
      channels: 1,
      dataB64: payload.buffer,
      sourceParticipant: payload.participant?.name || "meeting_audio",
    });
  }

  _handleParticipantJoin(payload) {
    const p = payload.participant;
    if (!p) return;

    this._participants.set(p.id, { id: p.id, name: p.name, isSpeaking: false });
    log.info("recallBot", `Participant joined: ${p.name || p.id}`);
    this._emitParticipants();
  }

  _handleParticipantLeave(payload) {
    const p = payload.participant;
    if (!p) return;

    this._participants.delete(p.id);
    log.info("recallBot", `Participant left: ${p.name || p.id}`);

    // If the leaving participant was the speaker, clear
    if (this._currentSpeakerId === p.id) {
      this._currentSpeakerId = null;
    }

    this._emitParticipants();
  }

  _handleSpeechOn(payload) {
    const p = payload.participant;
    if (!p) return;

    this._currentSpeakerId = p.id;
    const entry = this._participants.get(p.id);
    if (entry) entry.isSpeaking = true;
  }

  _handleSpeechOff(payload) {
    const p = payload.participant;
    if (!p) return;

    if (this._currentSpeakerId === p.id) {
      this._currentSpeakerId = null;
    }
    const entry = this._participants.get(p.id);
    if (entry) entry.isSpeaking = false;
  }

  _handleTranscript(payload) {
    // transcript.data may have words array or text field
    let text = "";
    if (payload.words && Array.isArray(payload.words)) {
      text = payload.words.map((w) => w.text).join(" ");
    } else if (payload.text) {
      text = payload.text;
    }

    if (!text) return;

    this.onIngestMessage({
      type: "caption",
      text,
      speaker: payload.participant?.name || "unknown",
      ts: new Date().toISOString(),
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

  _emitParticipants() {
    const names = [...this._participants.values()].map((p) => p.name).filter(Boolean);
    this.onIngestMessage({
      type: "participants",
      names,
      participants: names.map((name) => ({ name })),
      ts: new Date().toISOString(),
    });
  }
}

module.exports = { RecallBotAdapter };
