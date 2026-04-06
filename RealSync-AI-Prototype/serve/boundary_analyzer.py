"""
Face boundary and texture analysis for the RealSync AI Inference Service.

Detects blending artifacts by comparing texture consistency between the inner
face region and the boundary/outer region. Real faces have consistent noise
patterns throughout; swapped faces show texture discontinuities where the
pasted region meets the original skin.
"""
import cv2
import numpy as np


def analyze_boundary(face_crop_bgr: np.ndarray) -> dict:
    """
    Analyze face boundary for blending artifacts and texture discontinuities.

    Uses three signals:
    1. Texture consistency: Laplacian variance inner vs boundary
    2. Noise pattern: high-pass filtered noise comparison
    3. Color channel variance: per-channel noise in boundary region

    Args:
        face_crop_bgr: BGR face crop (any size).

    Returns:
        {
            "boundaryScore": float (0.0=fake, 1.0=real),
            "textureRatio": float (inner/boundary texture similarity),
            "noiseInconsistency": float (higher = more suspicious),
            "colorChannelVar": float (cross-channel noise variance at boundary),
        }
    """
    try:
        h, w = face_crop_bgr.shape[:2]
        if h < 30 or w < 30:
            return _default_result()

        resized = cv2.resize(face_crop_bgr, (256, 256))
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        gray_float = gray.astype(np.float32)
        h, w = 256, 256

        # Create face region masks
        # Inner: center 60% of the face
        # Boundary ring: between 60% and 85% of face extent
        # Outer: beyond 85%
        center_y, center_x = h // 2, w // 2
        y_grid, x_grid = np.ogrid[:h, :w]
        # Normalized elliptical distance from center
        ry, rx = h * 0.42, w * 0.35
        dist = np.sqrt(((y_grid - center_y * 0.9) / ry) ** 2 +
                        ((x_grid - center_x) / rx) ** 2)

        inner_mask = dist < 0.65
        boundary_mask = (dist >= 0.65) & (dist < 0.90)
        outer_mask = dist >= 0.90

        # 1. Texture consistency via Laplacian variance
        laplacian = cv2.Laplacian(gray, cv2.CV_64F, ksize=3).astype(np.float64)

        inner_lap_var = np.var(laplacian[inner_mask]) if np.any(inner_mask) else 1.0
        boundary_lap_var = np.var(laplacian[boundary_mask]) if np.any(boundary_mask) else 1.0

        # Ratio: how different is the texture at the boundary vs inside
        # Real: ratio ~0.5-1.5 (natural gradient from face center to edge)
        # Fake: ratio ~2.0-5.0+ (sharp texture change at paste boundary)
        texture_ratio = float(boundary_lap_var / (inner_lap_var + 1e-6))

        # 2. Noise pattern analysis
        # Extract noise by subtracting a blurred version
        blurred = cv2.GaussianBlur(gray_float, (5, 5), 0)
        noise = gray_float - blurred

        inner_noise_std = np.std(noise[inner_mask]) if np.any(inner_mask) else 1.0
        boundary_noise_std = np.std(noise[boundary_mask]) if np.any(boundary_mask) else 1.0
        outer_noise_std = np.std(noise[outer_mask]) if np.any(outer_mask) else 1.0

        # Noise inconsistency: how much the noise pattern changes across regions
        # Real: consistent noise model throughout (camera sensor noise)
        # Fake: different noise in pasted region vs original
        noise_diffs = [
            abs(inner_noise_std - boundary_noise_std),
            abs(boundary_noise_std - outer_noise_std),
        ]
        noise_inconsistency = float(np.mean(noise_diffs) / (inner_noise_std + 1e-6))

        # 3. Per-channel noise variance at boundary
        # Swapped faces often show different noise characteristics per color channel
        # at the boundary (from color space conversion during swap)
        boundary_pixels = boundary_mask
        if np.any(boundary_pixels):
            channel_noise_vars = []
            for c in range(3):
                channel = resized[:, :, c].astype(np.float32)
                ch_blurred = cv2.GaussianBlur(channel, (5, 5), 0)
                ch_noise = channel - ch_blurred
                ch_var = np.var(ch_noise[boundary_pixels])
                channel_noise_vars.append(ch_var)

            # Cross-channel variance: how different are the noise levels per channel
            # Real: similar noise in all channels (sensor noise is uniform)
            # Fake: different noise per channel (color processing artifacts)
            color_channel_var = float(np.std(channel_noise_vars) / (np.mean(channel_noise_vars) + 1e-6))
        else:
            color_channel_var = 0.0

        # Score computation
        score = 1.0

        # Texture ratio: real ~0.5-2.0, suspicious >2.5, fake >3.5
        if texture_ratio > 3.5:
            score -= 0.3
        elif texture_ratio > 2.5:
            score -= 0.15
        elif texture_ratio < 0.3:
            # Unusually uniform texture = heavy smoothing
            score -= 0.2

        # Noise inconsistency: real ~0.0-0.3, fake ~0.3-1.0+
        if noise_inconsistency > 0.6:
            score -= 0.3
        elif noise_inconsistency > 0.3:
            score -= 0.15

        # Color channel variance: real ~0.0-0.3, fake ~0.3-0.8+
        if color_channel_var > 0.5:
            score -= 0.25
        elif color_channel_var > 0.3:
            score -= 0.1

        score = max(0.0, min(1.0, round(score, 4)))

        return {
            "boundaryScore": score,
            "textureRatio": round(texture_ratio, 4),
            "noiseInconsistency": round(noise_inconsistency, 4),
            "colorChannelVar": round(color_channel_var, 4),
        }

    except Exception as e:
        print(f"[boundary_analyzer] Error: {e}")
        return _default_result()


def _default_result() -> dict:
    return {
        "boundaryScore": 0.5,
        "textureRatio": 0.0,
        "noiseInconsistency": 0.0,
        "colorChannelVar": 0.0,
    }
