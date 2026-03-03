"""
AASIST audio deepfake detection model.

Lightweight anti-spoofing model using sinc-convolution encoder with
attention pooling. Processes raw PCM16 waveforms at 16kHz.

Input: base64-encoded PCM16 mono 16kHz audio (4 seconds = 64000 samples).
Output: {"authenticityScore": float, "riskLevel": str, "model": str}
"""
import base64
import os
import threading

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from serve.config import (
    AASIST_WEIGHTS_PATH,
    DEEPFAKE_AUTH_THRESHOLD_LOW_RISK,
    DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK,
    AUDIO_SAMPLE_RATE,
    AUDIO_TARGET_LENGTH,
)

MODEL_NAME = "AASIST"
SAMPLE_RATE = AUDIO_SAMPLE_RATE
TARGET_LENGTH = AUDIO_TARGET_LENGTH


# ---------------------------------------------------------------
# AASIST-inspired architecture
# ---------------------------------------------------------------

class SincConv(nn.Module):
    """Sinc-based convolution for raw waveform processing."""

    def __init__(self, out_channels=70, kernel_size=251, sample_rate=16000):
        super().__init__()
        self.out_channels = out_channels
        self.kernel_size = kernel_size
        self.sample_rate = sample_rate

        low_hz = 30.0
        high_hz = sample_rate / 2.0 - (sample_rate / 2.0 / out_channels)
        mel_low = 2595.0 * np.log10(1.0 + low_hz / 700.0)
        mel_high = 2595.0 * np.log10(1.0 + high_hz / 700.0)
        mel_points = np.linspace(mel_low, mel_high, out_channels + 1)
        hz_points = 700.0 * (10.0 ** (mel_points / 2595.0) - 1.0)

        self.low_hz_ = nn.Parameter(torch.tensor(hz_points[:-1]).float().view(-1, 1))
        self.band_hz_ = nn.Parameter(torch.tensor(np.diff(hz_points)).float().view(-1, 1))

        n = (kernel_size - 1) / 2.0
        self.register_buffer("n_", 2 * np.pi * torch.arange(-n, 0).float().view(1, -1) / sample_rate)

    def forward(self, x):
        low = torch.abs(self.low_hz_) + 1.0
        high = torch.clamp(low + torch.abs(self.band_hz_), min=2.0, max=self.sample_rate / 2.0)

        f_low = low * self.n_
        f_high = high * self.n_

        band_pass_left = (torch.sin(f_high) - torch.sin(f_low)) / (self.n_ + 1e-8)
        band_pass_center = 2.0 * (high - low).squeeze(-1)
        band_pass_right = torch.flip(band_pass_left, dims=[1])

        band_pass = torch.cat([band_pass_left, band_pass_center.unsqueeze(1), band_pass_right], dim=1)
        band_pass = band_pass / (2.0 * high + 1e-8)

        filters = band_pass.view(self.out_channels, 1, self.kernel_size)
        return F.conv1d(x, filters, stride=1, padding=self.kernel_size // 2)


class AudioDeepfakeNet(nn.Module):
    """
    AASIST-inspired audio deepfake detection network.

    SincConv -> Conv Blocks -> Attention Pooling -> Binary output
    """

    def __init__(self, sinc_channels=70):
        super().__init__()
        self.sinc = SincConv(out_channels=sinc_channels, kernel_size=251)
        self.bn0 = nn.BatchNorm1d(sinc_channels)

        self.block1 = self._conv_block(sinc_channels, 128)
        self.block2 = self._conv_block(128, 128)
        self.block3 = self._conv_block(128, 256)
        self.block4 = self._conv_block(256, 256)

        self.attention = nn.Sequential(
            nn.Linear(256, 128),
            nn.Tanh(),
            nn.Linear(128, 1),
        )

        self.classifier = nn.Sequential(
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(128, 1),
        )

    def _conv_block(self, in_ch, out_ch):
        return nn.Sequential(
            nn.Conv1d(in_ch, out_ch, 3, padding=1),
            nn.BatchNorm1d(out_ch),
            nn.LeakyReLU(0.3),
            nn.Conv1d(out_ch, out_ch, 3, padding=1),
            nn.BatchNorm1d(out_ch),
            nn.LeakyReLU(0.3),
            nn.MaxPool1d(2),
        )

    def forward(self, x):
        # x: (batch, 1, samples)
        x = self.sinc(x)
        x = self.bn0(x)
        x = F.leaky_relu(x, 0.3)
        x = F.max_pool1d(x, 2)

        x = self.block1(x)
        x = self.block2(x)
        x = self.block3(x)
        x = self.block4(x)

        # Attention pooling: (batch, channels, time) -> (batch, channels)
        x_t = x.permute(0, 2, 1)  # (batch, time, channels)
        attn_weights = F.softmax(self.attention(x_t), dim=1)  # (batch, time, 1)
        x_pooled = (x_t * attn_weights).sum(dim=1)  # (batch, channels)

        logit = self.classifier(x_pooled)  # (batch, 1)
        return torch.sigmoid(logit)


# ---------------------------------------------------------------
# Lazy-loaded singleton
# ---------------------------------------------------------------

_model = None
_lock = threading.Lock()


def get_audio_model():
    """Load or return the cached audio deepfake model (thread-safe)."""
    global _model
    if _model is not None:
        return _model
    with _lock:
        if _model is not None:
            return _model
        try:
            net = AudioDeepfakeNet()
            if os.path.isfile(AASIST_WEIGHTS_PATH):
                state = torch.load(AASIST_WEIGHTS_PATH, map_location="cpu", weights_only=True)
                state_dict = state.get("model_state_dict", state)
                net.load_state_dict(state_dict, strict=True)
                print(f"[audio] Loaded AASIST weights from {AASIST_WEIGHTS_PATH}")
            else:
                print(f"[audio] WARNING: AASIST weights not found at {AASIST_WEIGHTS_PATH}")
                print("[audio] Model disabled — no weights available")
                _model = None
                return None
            net.eval()
            _model = net
            print(f"[audio] {MODEL_NAME} model ready")
        except Exception as exc:
            print(f"[audio] Failed to load audio model: {exc}")
    return _model


# ---------------------------------------------------------------
# Public API
# ---------------------------------------------------------------

def predict_audio(audio_b64: str) -> dict:
    """
    Predict audio deepfake from base64-encoded PCM16 mono 16kHz data.

    Returns:
        {"authenticityScore": float, "riskLevel": str, "model": str}
    """
    model = get_audio_model()
    if model is None:
        return {"authenticityScore": None, "riskLevel": "unknown", "model": MODEL_NAME, "available": False}

    try:
        pcm_bytes = base64.b64decode(audio_b64, validate=True)
        pcm_int16 = np.frombuffer(pcm_bytes, dtype=np.int16)
        waveform = pcm_int16.astype(np.float32) / 32768.0

        # Pad or truncate to 4 seconds
        if len(waveform) < TARGET_LENGTH:
            waveform = np.pad(waveform, (0, TARGET_LENGTH - len(waveform)))
        else:
            waveform = waveform[:TARGET_LENGTH]

        tensor = torch.from_numpy(waveform).float().unsqueeze(0).unsqueeze(0)  # (1, 1, 64000)

        with torch.no_grad():
            raw = model(tensor)
            prediction = float(raw[0][0])

        # Model outputs P(spoof). Convert to authenticity.
        authenticity = round(1.0 - prediction, 4)

        if authenticity > DEEPFAKE_AUTH_THRESHOLD_LOW_RISK:
            risk = "low"
        elif authenticity > DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK:
            risk = "medium"
        else:
            risk = "high"

        return {
            "authenticityScore": authenticity,
            "riskLevel": risk,
            "model": MODEL_NAME,
        }

    except Exception as exc:
        print(f"[audio] Prediction error: {exc}")
        return {"authenticityScore": None, "riskLevel": "unknown", "model": MODEL_NAME, "available": False}
