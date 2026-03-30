const { analyzeAudio, transcribeAudio } = require("../lib/aiClient");
const { createSttStream } = require("../lib/gcpStt");
const { broadcastToSession, makeIso } = require("./sessionManager");
const { handleTranscript } = require("./transcriptHandler");
const log = require("../lib/logger");

const MAX_AUDIO_BUFFER_CHUNKS = 128;
const AUDIO_ANALYSIS_INTERVAL_MS = 3_000;
const AUDIO_DEEPFAKE_ENABLED = process.env.AUDIO_DEEPFAKE_ENABLED !== "false";

/**
 * Combine base64 audio chunks into a single base64 string.
 */
function combineAudioChunks(chunks) {
  return Buffer.concat(chunks.map(b64 => Buffer.from(b64, "base64"))).toString("base64");
}

/**
 * Process a single base64 PCM chunk:
 *  - feeds it to the GCP STT stream
 *  - accumulates it for periodic AI deepfake + Whisper analysis
 */
function processAudioChunk(session, dataB64) {
  if (!session.stt) {
    session.stt = createSttStream({
      onTranscript: (t) => handleTranscript(session, t),
      onError: (err) => {
        log.warn("stt", `STT error for session ${session.id}: ${err?.message ?? err}`);
        session.stt = null;
      },
    });
  }

  const audioBuffer = Buffer.from(dataB64, "base64");
  session.stt.write(audioBuffer);

  // Accumulate audio for AI deepfake analysis (H3: cap buffer at 128 chunks)
  session.audioAnalysisBuffer.push(dataB64);
  if (session.audioAnalysisBuffer.length > MAX_AUDIO_BUFFER_CHUNKS) session.audioAnalysisBuffer.shift();

  const now = Date.now();
  if (
    AUDIO_DEEPFAKE_ENABLED &&
    !session.audioAnalysisInFlight &&
    session.audioAnalysisBuffer.length >= 8 &&
    now - session.lastAudioAnalysisAt >= AUDIO_ANALYSIS_INTERVAL_MS
  ) {
    session.audioAnalysisInFlight = true;
    // 7.12: Only splice 8 chunks at a time to prevent silent data loss
    // when audio accumulates faster than analysis can process it.
    const chunks = session.audioAnalysisBuffer.splice(0, 8);
    const combinedAudioB64 = combineAudioChunks(chunks);
    session.lastAudioAnalysisAt = now;

    analyzeAudio({ sessionId: session.id, audioB64: combinedAudioB64, durationMs: 4000 })
      .then((res) => {
        session.audioAnalysisInFlight = false;
        if (res?.audio?.authenticityScore != null) {
          session.audioAuthenticityScore = res.audio.authenticityScore;
          if (session.metrics) {
            session.metrics.confidenceLayers = session.metrics.confidenceLayers || {};
            session.metrics.confidenceLayers.audio = res.audio.authenticityScore;
          }
          // Fix 2: Recompute trust and broadcast so frontend sees audio updates
          // C5 fix: Use raw deepfake authenticityScore (not composite trustScore) to avoid double-counting
          if (session.metrics?.trustScore != null) {
            const behaviorConf = session.metrics.confidenceLayers?.behavior || 0.55;
            const videoSignal = session.metrics.deepfake?.authenticityScore
              ?? session.metrics.confidenceLayers?.video ?? 0.5;
            const audioScore = res.audio.authenticityScore;
            const finalTrust = 0.45 * videoSignal + 0.35 * audioScore + 0.20 * behaviorConf;
            session.metrics.trustScore = Math.max(0, Math.min(1, parseFloat(finalTrust.toFixed(4))));
          }
          session.metrics.timestamp = makeIso();
          broadcastToSession(session.id, { type: "metrics", data: session.metrics });
        }
      })
      .catch((err) => {
        session.audioAnalysisInFlight = false;
        log.error("server", `audio-analysis error: ${err.message}`);
      });

    // Whisper transcription — runs in parallel with audio deepfake analysis
    transcribeAudio({ sessionId: session.id, audioB64: combinedAudioB64, durationMs: 4000 })
      .then((res) => {
        if (res?.transcript?.text) {
          handleTranscript(session, {
            text: res.transcript.text,
            isFinal: true,
            confidence: 0.9,
            ts: res.processedAt || new Date().toISOString(),
            source: "whisper",
          });
        }
      })
      .catch(() => {});
  }
}

module.exports = { combineAudioChunks, processAudioChunk };
