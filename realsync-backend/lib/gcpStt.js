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

function createStubStream({ onTranscript }) {
  // Lightweight stub so the UI can be exercised without cloud creds.
  // Enable real GCP STT with: REALSYNC_USE_GCP_STT=1
  let timer = null;
  const samples = [
    "hello everyone, let's start the meeting",
    "please share the invoice by end of day",
    "this is urgent, we need to transfer funds",
    "can you send me the OTP code",
  ];

  const start = () => {
    if (timer) return;
    let i = 0;
    timer = setInterval(() => {
      const text = samples[i % samples.length];
      i += 1;
      onTranscript?.({
        text,
        isFinal: true,
        confidence: 0.8,
        ts: new Date().toISOString(),
        source: "stub",
      });
    }, 6000);
  };

  start();

  return {
    enabled: false,
    write() {
      // ignore audio bytes
    },
    end() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

function createGcpStream({ onTranscript, onError, languageCode, sampleRateHertz }) {
  const speech = safeRequire("@google-cloud/speech");
  if (!speech) {
    console.warn(
      "GCP Speech client not installed. Run: npm i @google-cloud/speech (backend). Falling back to stub."
    );
    return createStubStream({ onTranscript });
  }

  let client;
  try {
    client = new speech.SpeechClient();
  } catch (err) {
    console.warn(`Failed to init GCP SpeechClient (${err?.message ?? err}). Falling back to stub.`);
    return createStubStream({ onTranscript });
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
    return createStubStream(opts);
  }
  return createGcpStream(opts);
}

module.exports = {
  createSttStream,
};

