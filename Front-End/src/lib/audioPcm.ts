type MicPcmStreamOptions = {
  /**
   * Called with base64 encoded little-endian PCM16 audio at 16kHz mono.
   * This is the format our backend expects for GCP Streaming Speech-to-Text.
   */
  onChunkB64: (chunkB64: string) => void;
  onError?: (error: unknown) => void;
  bufferSize?: number;
};

const TARGET_SAMPLE_RATE = 16000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function downsampleToPcm16(buffer: Float32Array, inSampleRate: number): Int16Array {
  if (inSampleRate === TARGET_SAMPLE_RATE) {
    const out = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i += 1) {
      out[i] = Math.round(clamp(buffer[i], -1, 1) * 0x7fff);
    }
    return out;
  }

  const ratio = inSampleRate / TARGET_SAMPLE_RATE;
  const newLength = Math.round(buffer.length / ratio);
  const out = new Int16Array(newLength);

  let offsetBuffer = 0;
  for (let i = 0; i < newLength; i += 1) {
    const nextOffsetBuffer = Math.round((i + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let j = offsetBuffer; j < nextOffsetBuffer && j < buffer.length; j += 1) {
      accum += buffer[j];
      count += 1;
    }
    const sample = count > 0 ? accum / count : 0;
    out[i] = Math.round(clamp(sample, -1, 1) * 0x7fff);
    offsetBuffer = nextOffsetBuffer;
  }

  return out;
}

function int16ToBase64(pcm16: Int16Array) {
  const buffer = new ArrayBuffer(pcm16.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < pcm16.length; i += 1) {
    view.setInt16(i * 2, pcm16[i], true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

export type MicPcmStreamHandle = {
  stop: () => void;
  sampleRate: number;
};

export async function startMicPcm16Stream(options: MicPcmStreamOptions): Promise<MicPcmStreamHandle> {
  const { onChunkB64, onError, bufferSize = 4096 } = options;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);

  // Avoid audio feedback - ScriptProcessor needs to be in the graph.
  const sink = audioContext.createGain();
  sink.gain.value = 0;

  processor.onaudioprocess = (event) => {
    try {
      const input = event.inputBuffer.getChannelData(0);
      const pcm16 = downsampleToPcm16(input, audioContext.sampleRate);
      if (pcm16.length === 0) return;
      const b64 = int16ToBase64(pcm16);
      onChunkB64(b64);
    } catch (err) {
      onError?.(err);
    }
  };

  source.connect(processor);
  processor.connect(sink);
  sink.connect(audioContext.destination);

  return {
    sampleRate: TARGET_SAMPLE_RATE,
    stop: () => {
      try {
        processor.disconnect();
        source.disconnect();
        sink.disconnect();
      } catch {
        // ignore
      }

      stream.getTracks().forEach((track) => track.stop());
      void audioContext.close();
    },
  };
}

