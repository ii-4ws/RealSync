"""
Frequency-domain deepfake detection for the RealSync AI Inference Service.

Analyzes DCT high-frequency energy in face crops. Real faces retain natural
high-frequency texture (pores, hair, micro-detail). Face swaps — even with
post-processing — lose this texture. The log-scale high-frequency ratio is
the primary discriminator.
"""
import cv2
import numpy as np


def analyze_frequency(face_crop_bgr: np.ndarray) -> dict:
    """
    Analyze frequency-domain characteristics of a face crop.

    Primary signal: log-scale high-frequency energy ratio.
    Real faces have natural micro-texture that produces consistent high-freq
    energy. Swapped faces lose this (inswapper operates at 128x128),
    and post-processing (blur/sharpen) further distorts the spectrum.

    Args:
        face_crop_bgr: BGR face crop (any size, resized to 256x256).

    Returns:
        {
            "frequencyScore": float (0.0=fake, 1.0=real),
            "highFreqRatio": float,
            "midHighRatio": float,
            "logHighFreq": float (log-scale, primary discriminator),
        }
    """
    try:
        gray = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, (256, 256))
        gray_float = gray.astype(np.float32) / 255.0

        # 2D DCT
        dct = cv2.dct(gray_float)
        dct_abs = np.abs(dct)

        h, w = dct_abs.shape
        total_energy = np.sum(dct_abs ** 2) + 1e-10

        # Frequency band masks using Manhattan distance from DC component
        # This is much faster than the per-pixel loop
        row_idx = np.arange(h).reshape(-1, 1)
        col_idx = np.arange(w).reshape(1, -1)
        norm_dist = (row_idx + col_idx) / (h + w - 2)

        low_mask = norm_dist < 0.20
        mid_mask = (norm_dist >= 0.20) & (norm_dist < 0.50)
        high_mask = norm_dist >= 0.50

        low_energy = np.sum(dct_abs[low_mask] ** 2)
        mid_energy = np.sum(dct_abs[mid_mask] ** 2)
        high_energy = np.sum(dct_abs[high_mask] ** 2)

        high_freq_ratio = float(high_energy / total_energy)
        mid_high_ratio = float((mid_energy + high_energy) / total_energy)

        # Log-scale high-freq ratio — the primary discriminator
        # Calibrated from real data:
        #   Real face (dark room): log(0.0037) = -5.6
        #   Raw inswapper:         log(0.0010) = -6.9
        #   Enhanced swap:         log(0.00004) = -10.2
        log_hf = float(np.log(high_freq_ratio + 1e-12))

        # Laplacian variance — measures sharpness/texture richness
        # Real faces have higher variance from natural texture
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        lap_var = float(np.var(laplacian))

        # GAN fingerprint detection
        # GANs produce periodic artifacts in FFT (grid-like spectral peaks)
        fft = np.fft.fft2(gray_float)
        fft_shifted = np.fft.fftshift(fft)
        magnitude = np.log(np.abs(fft_shifted) + 1e-10)

        # Check for periodic peaks: GANs create regular grid patterns
        # Subtract radial average to isolate peaks from natural 1/f falloff
        center_y, center_x = h // 2, w // 2
        y_coords, x_coords = np.ogrid[:h, :w]
        radius_map = np.sqrt((y_coords - center_y) ** 2 + (x_coords - center_x) ** 2).astype(int)

        radial_mean = np.zeros(magnitude.shape)
        for r in range(1, min(center_y, center_x)):
            ring = radius_map == r
            if np.any(ring):
                radial_mean[ring] = np.mean(magnitude[ring])

        residual = magnitude - radial_mean
        # Peak score: how many strong deviations from radial average
        # Real images: few peaks, GANs: periodic grid of peaks
        threshold = np.std(residual) * 2.5
        peak_count = np.sum(residual > threshold)
        total_pixels = h * w
        peak_ratio = peak_count / total_pixels

        # GAN images have periodic spectral peaks from upsampling layers
        # Calibrated from real data:
        #   Real face:    ganPeakRatio ~0.0009
        #   Face swaps:   ganPeakRatio ~0.0019
        #   StyleGAN:     ganPeakRatio ~0.0047
        gan_penalty = 0.0
        if peak_ratio > 0.006:
            gan_penalty = 0.3
        elif peak_ratio > 0.004:
            gan_penalty = 0.2
        elif peak_ratio > 0.003:
            gan_penalty = 0.1

        # Noise model analysis
        noise_residual = gray_float - cv2.GaussianBlur(gray_float, (3, 3), 0)
        noise_kurtosis = float(_kurtosis(noise_residual.flatten()))
        # Real camera: kurtosis 20-40+, GAN: lower kurtosis (smoother noise)
        # Swaps: varies (16-128 depending on processing)
        if noise_kurtosis < 15.0:
            gan_penalty += 0.1

        # Score: map log_hf to [0, 1]
        # log_hf > -5.0  → very real (lots of natural texture)
        # log_hf ~ -6.0  → probably real
        # log_hf ~ -7.5  → suspicious
        # log_hf ~ -9.0  → likely fake (heavy smoothing)
        # log_hf < -10.0 → almost certainly fake
        score = _sigmoid_map(log_hf, center=-8.0, steepness=0.5)

        # Secondary: Laplacian variance boost/penalty
        # Real: lap_var ~ 50-200+, Fake: lap_var ~ 5-50
        lap_adjustment = _sigmoid_map(np.log(lap_var + 1), center=3.5, steepness=0.8) - 0.5
        score = score + 0.15 * lap_adjustment

        # Apply GAN penalty
        score -= gan_penalty

        score = max(0.0, min(1.0, round(score, 4)))

        return {
            "frequencyScore": score,
            "highFreqRatio": round(high_freq_ratio, 6),
            "midHighRatio": round(mid_high_ratio, 6),
            "logHighFreq": round(log_hf, 4),
            "ganPeakRatio": round(peak_ratio, 6),
            "noiseKurtosis": round(noise_kurtosis, 4),
        }

    except Exception as e:
        print(f"[frequency_analyzer] Error: {e}")
        return {
            "frequencyScore": 0.5,
            "highFreqRatio": 0.0,
            "midHighRatio": 0.0,
            "logHighFreq": 0.0,
            "ganPeakRatio": 0.0,
            "noiseKurtosis": 0.0,
        }


def _sigmoid_map(x: float, center: float, steepness: float) -> float:
    """Map x to [0, 1] via sigmoid centered at `center`."""
    return 1.0 / (1.0 + np.exp(-steepness * (x - center)))


def _kurtosis(data: np.ndarray) -> float:
    """Compute excess kurtosis of a 1D array."""
    n = len(data)
    if n < 4:
        return 3.0
    mean = np.mean(data)
    std = np.std(data)
    if std < 1e-10:
        return 3.0
    return float(np.mean(((data - mean) / std) ** 4))
