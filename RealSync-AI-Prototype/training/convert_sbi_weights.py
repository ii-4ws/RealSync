#!/usr/bin/env python
"""
Convert SBI (Self-Blended Images) pretrained checkpoint to torchvision format.

Downloads the official SBI FF-c23 checkpoint from the mapooon/SelfBlendedImages
repo, remaps backbone keys from efficientnet_pytorch format to torchvision format
via positional matching, and saves a checkpoint compatible with
serve/deepfake_model.py.

Reference:
  Shiohara & Yamasaki, "Detecting Deepfakes with Self-Blended Images", CVPR 2022
  https://github.com/mapooon/SelfBlendedImages

Usage:
    cd RealSync-AI-Prototype
    python training/convert_sbi_weights.py

    # If Google Drive blocks gdown:
    #   1. Download: https://drive.google.com/file/d/1X0-NYT8KPursLZZdxduRQju6E52hauV0
    #   2. Save as: training/sbi_checkpoint.tar
    #   3. Re-run:  python training/convert_sbi_weights.py --local training/sbi_checkpoint.tar

Output:
    src/models/efficientnet_b4_deepfake.pth (~80 MB)
"""
import os
import sys
import argparse
import tarfile
import tempfile
import subprocess

import torch

# Add project root to path for serve.* imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ---------------------------------------------------------------
# Config
# ---------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEIGHTS_OUT = os.path.join(BASE_DIR, "src", "models", "efficientnet_b4_deepfake.pth")

# SBI FF++ c23 checkpoint on Google Drive
SBI_GDRIVE_ID = "1X0-NYT8KPursLZZdxduRQju6E52hauV0"


# ---------------------------------------------------------------
# Download helpers
# ---------------------------------------------------------------

def ensure_gdown():
    """Install gdown if not present, return the module."""
    try:
        import gdown
        return gdown
    except ImportError:
        print("[convert] gdown not found, installing...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "gdown"])
        import gdown
        return gdown


def download_checkpoint(local_path=None):
    """Download SBI checkpoint or load from local path. Returns raw state dict."""

    if local_path and os.path.isfile(local_path):
        print(f"[convert] Using local file: {local_path}")
        raw_path = local_path
    else:
        raw_path = os.path.join(BASE_DIR, "training", "sbi_checkpoint.tar")
        if os.path.isfile(raw_path):
            print(f"[convert] Found cached download: {raw_path}")
        else:
            gdown = ensure_gdown()
            print("[convert] Downloading SBI FF-c23 checkpoint from Google Drive...")
            url = f"https://drive.google.com/uc?id={SBI_GDRIVE_ID}"
            gdown.download(url, raw_path, quiet=False)
            if not os.path.isfile(raw_path):
                print("[convert] ERROR: Download failed.")
                print("[convert] Try manual download:")
                print(f"  1. Go to: https://drive.google.com/file/d/{SBI_GDRIVE_ID}")
                print(f"  2. Save as: {raw_path}")
                print(f"  3. Re-run: python training/convert_sbi_weights.py --local {raw_path}")
                sys.exit(1)

    # Extract from tar if needed
    state = None
    if tarfile.is_tarfile(raw_path):
        print("[convert] Extracting tar archive...")
        with tarfile.open(raw_path, "r") as tf:
            for member in tf.getmembers():
                if member.isfile():
                    print(f"[convert] Found: {member.name} ({member.size / 1e6:.1f} MB)")
                    # Sanitize path to prevent path traversal attacks
                    member.name = os.path.basename(member.name)
                    with tempfile.TemporaryDirectory() as tmpdir:
                        tf.extract(member, tmpdir)
                        extracted = os.path.join(tmpdir, member.name)
                        state = torch.load(extracted, map_location="cpu", weights_only=True)
                    break
            else:
                print("[convert] ERROR: No files found in tar archive")
                sys.exit(1)
    else:
        state = torch.load(raw_path, map_location="cpu", weights_only=True)

    # Unwrap checkpoint format
    if isinstance(state, dict):
        for key in ("model_state_dict", "state_dict", "model"):
            if key in state and isinstance(state[key], dict):
                first = next(iter(state[key].values()), None)
                if isinstance(first, torch.Tensor):
                    print(f"[convert] Unwrapped checkpoint key: '{key}'")
                    return state[key]
        # Check if it IS the raw state dict
        first = next(iter(state.values()), None)
        if isinstance(first, torch.Tensor):
            return state

    print(f"[convert] ERROR: Cannot parse checkpoint")
    if isinstance(state, dict):
        print(f"  Top-level keys: {list(state.keys())[:20]}")
    else:
        print(f"  Type: {type(state).__name__}")
    sys.exit(1)


# ---------------------------------------------------------------
# Key remapping
# ---------------------------------------------------------------

def print_keys(state_dict, label="State dict"):
    """Print all keys with shapes for debugging."""
    print(f"\n{label} ({len(state_dict)} entries):")
    for k, v in state_dict.items():
        shape = list(v.shape) if isinstance(v, torch.Tensor) else type(v).__name__
        print(f"  {k}: {shape}")
    print()


def remap_weights(sbi_state_dict):
    """
    Remap SBI checkpoint from efficientnet_pytorch to torchvision format.

    Both libraries represent the same EfficientNet-B4 architecture, so backbone
    parameters appear in the same order (stem -> blocks -> head). We match them
    positionally and verify that every shape is identical.

    The SBI model wraps EfficientNet inside a Detector class with `self.net`,
    so keys may have a `net.` prefix.  Our model also uses `self.net`, so the
    prefix is preserved in the output.

    Classifier keys (_fc.* in SBI) are SKIPPED -- our head is a different shape
    (1-class sigmoid vs SBI's 2-class softmax) and stays randomly initialized.
    """
    from serve.deepfake_model import EfficientNetDeepfake

    # 1. Strip 'net.' prefix if the SBI Detector wrapper is present
    has_prefix = any(k.startswith("net.") for k in sbi_state_dict)
    if has_prefix:
        print("[convert] Detected 'net.' prefix (SBI Detector wrapper)")

    stripped = {}
    for k, v in sbi_state_dict.items():
        clean = k[4:] if has_prefix and k.startswith("net.") else k
        stripped[clean] = v

    # 2. Separate backbone from classifier
    sbi_backbone_keys = [k for k in stripped if not k.startswith("_fc")]
    sbi_skip_keys = [k for k in stripped if k.startswith("_fc")]

    print(f"[convert] SBI backbone: {len(sbi_backbone_keys)} params")
    print(f"[convert] SBI classifier: {len(sbi_skip_keys)} params (skipped)")

    # 3. Get target model backbone keys
    target = EfficientNetDeepfake()
    target_sd = target.state_dict()

    tv_backbone_keys = [k for k in target_sd if not k.startswith("net.classifier")]
    tv_classifier_keys = [k for k in target_sd if k.startswith("net.classifier")]

    print(f"[convert] Target backbone: {len(tv_backbone_keys)} params")
    print(f"[convert] Target classifier: {len(tv_classifier_keys)} params (kept random)")

    # 4. Verify parameter counts match
    if len(sbi_backbone_keys) != len(tv_backbone_keys):
        print(f"\n[convert] ERROR: Backbone parameter count mismatch!")
        print(f"  SBI: {len(sbi_backbone_keys)}, Target: {len(tv_backbone_keys)}")
        print("\nUse --diagnose to see all checkpoint keys.")
        print_keys({k: stripped[k] for k in sbi_backbone_keys}, "SBI backbone")
        print_keys({k: target_sd[k] for k in tv_backbone_keys}, "Target backbone")
        sys.exit(1)

    # 5. Positional matching with shape verification
    new_sd = {}
    mismatches = []

    for sbi_k, tv_k in zip(sbi_backbone_keys, tv_backbone_keys):
        sbi_tensor = stripped[sbi_k]
        tv_shape = target_sd[tv_k].shape

        if sbi_tensor.shape != tv_shape:
            mismatches.append((sbi_k, list(sbi_tensor.shape), tv_k, list(tv_shape)))
        else:
            new_sd[tv_k] = sbi_tensor

    if mismatches:
        print(f"\n[convert] ERROR: {len(mismatches)} shape mismatches found:")
        for sbi_k, sbi_s, tv_k, tv_s in mismatches:
            print(f"  {sbi_k} {sbi_s} != {tv_k} {tv_s}")
        print("\nThis likely means the SBI checkpoint uses a different EfficientNet variant.")
        print("Use --diagnose to inspect the full checkpoint.")
        sys.exit(1)

    # 6. Keep classifier randomly initialized
    for k in tv_classifier_keys:
        new_sd[k] = target_sd[k]

    print(f"[convert] Remapped {len(sbi_backbone_keys)} backbone params successfully")
    return new_sd


# ---------------------------------------------------------------
# Verification
# ---------------------------------------------------------------

def verify(weights_path):
    """Smoke-test: load converted weights into our model."""
    import serve.deepfake_model as dm

    # Reset cached singleton so it re-loads from disk
    dm._model = None

    model = dm.get_deepfake_model()
    if model is not None:
        print("[convert] Verification PASSED")
        return True
    else:
        print("[convert] Verification FAILED")
        return False


# ---------------------------------------------------------------
# Main
# ---------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Convert SBI pretrained checkpoint to torchvision EfficientNet-B4"
    )
    parser.add_argument(
        "--local", type=str, default=None,
        help="Path to locally downloaded SBI checkpoint (tar or pth)"
    )
    parser.add_argument(
        "--diagnose", action="store_true",
        help="Print all checkpoint keys with shapes and exit"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  SBI -> EfficientNet-B4 Weight Conversion")
    print("=" * 60)
    print()

    # Download / load
    sbi_sd = download_checkpoint(args.local)

    if args.diagnose:
        print_keys(sbi_sd, "SBI checkpoint")
        sys.exit(0)

    # Remap
    new_sd = remap_weights(sbi_sd)

    # Save
    os.makedirs(os.path.dirname(WEIGHTS_OUT), exist_ok=True)
    torch.save({
        "model_state_dict": new_sd,
        "architecture": "EfficientNet-B4-SBI",
        "source": "SBI FF-c23 (Shiohara & Yamasaki, CVPR 2022)",
        "conversion": "efficientnet_pytorch -> torchvision positional remapping",
    }, WEIGHTS_OUT)

    size_mb = os.path.getsize(WEIGHTS_OUT) / (1024 * 1024)
    print(f"\n[convert] Saved: {WEIGHTS_OUT} ({size_mb:.1f} MB)")

    # Verify
    print("\n[convert] Running smoke test...")
    verify(WEIGHTS_OUT)

    print("\nDone!")


if __name__ == "__main__":
    main()
