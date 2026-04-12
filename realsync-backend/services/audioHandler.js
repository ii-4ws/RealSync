const { analyzeAudio, transcribeAudio } = require("../lib/aiClient");
const { createSttStream } = require("../lib/gcpStt");
const { broadcastToSession, makeIso, sessions } = require("./sessionManager");
const { handleTranscript } = require("./transcriptHandler");
const log = require("../lib/logger");

const MAX_AUDIO_BUFFER_CHUNKS = 128;
const AUDIO_ANALYSIS_INTERVAL_MS = 3_000;
const AUDIO_DEEPFAKE_ENABLED = process.env.AUDIO_DEEPFAKE_ENABLED !== "false";
// PCM16 range -32768..32767. Recall.ai per-participant audio peaks ~50-400 for speech,
// 1-15 for silence. Old PulseAudio loopback was 10x louder (threshold was 500).
const RMS_SILENCE_THRESHOLD = parseInt(process.env.RMS_SILENCE_THRESHOLD, 10) || 0;

// Audio EMA smoothing + extended hold: keep audio visible between analysis windows
const _smoothedAudio = new Map(); // sessionId → { score: number, ts: number }
const AUDIO_EMA_ALPHA = 0.3;
const AUDIO_HOLD_S = 15;  // Hold score for 15s before decaying
const AUDIO_DECAY_S = 15; // Decay to 0 over 15s after hold

/**
 * Returns an effective audio authenticity score with EMA smoothing and hold/decay.
 * New scores are EMA-smoothed with previous. Score holds for 60s then decays over 30s.
 */
function getEffectiveAudioScore(sessionId, currentScore) {
  const now = Date.now();
  const prev = _smoothedAudio.get(sessionId);

  if (currentScore > 0.05) {
    // EMA smooth with previous score
    const smoothed = prev
      ? AUDIO_EMA_ALPHA * currentScore + (1 - AUDIO_EMA_ALPHA) * prev.score
      : currentScore;
    _smoothedAudio.set(sessionId, { score: smoothed, ts: now });
    return parseFloat(smoothed.toFixed(4));
  }

  if (!prev) return 0;
  const elapsed = (now - prev.ts) / 1000;
  if (elapsed < AUDIO_HOLD_S) return prev.score;
  if (elapsed < AUDIO_HOLD_S + AUDIO_DECAY_S) {
    return parseFloat((prev.score * (1 - (elapsed - AUDIO_HOLD_S) / AUDIO_DECAY_S)).toFixed(4));
  }
  _smoothedAudio.delete(sessionId);
  return 0;
}

/**
 * Recompute session.metrics.trustScore from the currently stored signals.
 * Handles camera-off and audio-only cases so trust isn't frozen at 0 when
 * there is no video signal.
 */
function recomputeTrustScore(session) {
  if (!session.metrics) return;
  const cameraOff = session.metrics.cameraOff === true;
  const audio = session.metrics.confidenceLayers?.audio;
  const video = session.metrics.deepfake?.authenticityScore
    ?? session.metrics.confidenceLayers?.video;
  const behavior = session.metrics.confidenceLayers?.behavior;

  let trust = null;
  if (cameraOff || video == null) {
    if (audio != null) trust = audio;
  } else if (audio != null && session.audioHasSignal !== false) {
    trust = 0.45 * video + 0.35 * audio + 0.20 * (behavior ?? 0.55);
  } else {
    trust = 0.55 * video + 0.45 * (behavior ?? 0.55);
  }
  if (trust == null) return;
  session.metrics.trustScore = Math.max(0, Math.min(1, parseFloat(trust.toFixed(4))));
}

/**
 * Apply a new effective audio score (possibly 0 on silence/decay) to the
 * session, recompute trust, and broadcast. Used by both the live analysis
 * path and the standalone decay ticker.
 */
function applyAudioScore(session, rawScore) {
  const effective = getEffectiveAudioScore(session.id, rawScore);
  session.audioAuthenticityScore = effective;
  if (!session.metrics) return effective;
  session.metrics.confidenceLayers = session.metrics.confidenceLayers || {};
  session.metrics.confidenceLayers.audio = effective;
  recomputeTrustScore(session);
  session.metrics.timestamp = makeIso();
  broadcastToSession(session.id, { type: "metrics", data: session.metrics });
  return effective;
}

/**
 * Global tick that fades the audio score to 0 for any session that stopped
 * receiving chunks (e.g. participant muted their mic). Without this, the
 * score is frozen at the last speech value forever, because Recall.ai sends
 * no audio at all while muted so processAudioChunk is never called.
 */
const AUDIO_DECAY_TICK_MS = 3_000;
const AUDIO_CHUNK_STALE_MS = 3_000;
let _decayTickerStarted = false;
function startAudioDecayTicker() {
  if (_decayTickerStarted) return;
  _decayTickerStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const session of sessions.values()) {
      if (session.endedAt) continue;
      const last = session.lastAudioChunkAt || 0;
      if (now - last < AUDIO_CHUNK_STALE_MS) continue;
      if (!_smoothedAudio.has(session.id)) continue;
      session.audioHasSignal = false;
      applyAudioScore(session, 0);
    }
  }, AUDIO_DECAY_TICK_MS).unref();
}
startAudioDecayTicker();

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
  session.lastAudioChunkAt = Date.now();
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
  if (!session.audioAnalysisBuffer) session.audioAnalysisBuffer = [];
  session.audioAnalysisBuffer.push(dataB64);
  if (session.audioAnalysisBuffer.length > MAX_AUDIO_BUFFER_CHUNKS) session.audioAnalysisBuffer.shift();

  const now = Date.now();
  if (
    AUDIO_DEEPFAKE_ENABLED &&
    !session.audioAnalysisInFlight &&
    session.audioAnalysisBuffer.length >= 8 &&
    now - session.lastAudioAnalysisAt >= AUDIO_ANALYSIS_INTERVAL_MS
  ) {
    // 7.12: Only splice 8 chunks at a time
    const chunks = session.audioAnalysisBuffer.splice(0, 8);
    const combinedAudioB64 = combineAudioChunks(chunks);

    // RMS signal detection: skip silence from virtual PulseAudio sink
    const pcmBuf = Buffer.from(combinedAudioB64, "base64");
    let rmsEnergy = 0;
    for (let i = 0; i < pcmBuf.length - 1; i += 2) {
      const sample = pcmBuf.readInt16LE(i);
      rmsEnergy += sample * sample;
    }
    rmsEnergy = Math.sqrt(rmsEnergy / (pcmBuf.length / 2));

    if (rmsEnergy < RMS_SILENCE_THRESHOLD) {
      session.audioHasSignal = false;
      applyAudioScore(session, 0);
      log.info("audio", `Chunk skipped: RMS ${rmsEnergy.toFixed(0)} below threshold`);
      return;
    }
    session.audioHasSignal = true;
    session.audioAnalysisInFlight = true;
    session.lastAudioAnalysisAt = now;

    analyzeAudio({ sessionId: session.id, audioB64: combinedAudioB64, durationMs: 4000 })
      .then((res) => {
        session.audioAnalysisInFlight = false;
        if (res?.audio?.authenticityScore != null) {
          applyAudioScore(session, res.audio.authenticityScore);
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
          log.info("audio", `Whisper transcript: "${res.transcript.text.slice(0, 80)}"`);
          handleTranscript(session, {
            text: res.transcript.text,
            isFinal: true,
            confidence: 0.9,
            ts: res.processedAt || new Date().toISOString(),
            source: "whisper",
          });
        }
      })
      .catch((err) => {
        log.warn("audio", `Whisper error: ${err?.message ?? err}`);
      });
  }
}

module.exports = { combineAudioChunks, processAudioChunk };
