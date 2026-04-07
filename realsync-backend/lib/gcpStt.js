const log = require("./logger");

const DEFAULT_LANGUAGE = process.env.REALSYNC_STT_LANGUAGE || "en-US";
const DEFAULT_SAMPLE_RATE = Number(process.env.REALSYNC_STT_SAMPLE_RATE || 16000);

const isGcpEnabled = () => process.env.REALSYNC_USE_GCP_STT === "1";

function safeRequire(moduleName) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(moduleName);
  } catch (err) {
    return null;
  }
}

function createNoopStream() {
  // Silent no-op when GCP STT is not configured.
  // No fake transcripts generated — enable real GCP STT with: REALSYNC_USE_GCP_STT=1
  return {
    enabled: false,
    write() {},
    end() {},
  };
}

function createGcpStream({ onTranscript, onError, languageCode, sampleRateHertz }) {
  const speech = safeRequire("@google-cloud/speech");
  if (!speech) {
    log.warn("gcpStt", "GCP Speech client not installed. Run: npm i @google-cloud/speech (backend). Falling back to stub.");
    return createNoopStream();
  }

  let client;
  try {
    client = new speech.SpeechClient();
  } catch (err) {
    log.warn("gcpStt", `Failed to init GCP SpeechClient (${err?.message ?? err}). Falling back to stub.`);
    return createNoopStream();
  }

  const recognizeStream = client
    .streamingRecognize({
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: sampleRateHertz ?? DEFAULT_SAMPLE_RATE,
        languageCode: languageCode ?? DEFAULT_LANGUAGE,
      },
      interimResults: true,
    })
    .on("error", (err) => {
      onError?.(err);
    })
    .on("data", (data) => {
      const result = data?.results?.[0];
      const alt = result?.alternatives?.[0];
      const text = alt?.transcript;
      if (!text) return;

      onTranscript?.({
        text,
        isFinal: Boolean(result.isFinal),
        confidence: typeof alt.confidence === "number" ? alt.confidence : null,
        ts: new Date().toISOString(),
        source: "gcp",
      });
    });

  return {
    enabled: true,
    write(buffer) {
      try {
        recognizeStream.write({ audioContent: buffer });
      } catch (err) {
        onError?.(err);
      }
    },
    end() {
      try {
        recognizeStream.end();
      } catch (err) {
        // ignore
      }
    },
  };
}

function createSttStream(opts) {
  if (!isGcpEnabled()) {
    return createNoopStream();
  }
  return createGcpStream(opts);
}

module.exports = {
  createSttStream,
};

