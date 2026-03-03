#!/usr/bin/env python
"""
Train AudioDeepfakeNet (SincConv + ResBlocks + Attention) on ASVspoof 2019 LA.

Downloads the ASVspoof 2019 Logical Access dataset from HuggingFace, trains
the AudioDeepfakeNet model defined in serve/audio_model.py, and saves the
best checkpoint to src/models/aasist_weights.pth.

Reference:
  ASVspoof 2019: https://www.asvspoof.org/
  Dataset: LanceaKing/asvspoof2019 on HuggingFace

Usage:
    cd RealSync-AI-Prototype
    pip install datasets soundfile
    python training/train_audio_sincconv.py
    python training/train_audio_sincconv.py --epochs 15 --batch-size 64

Training time:
    Mac CPU:           ~4-7 hours
    Mac MPS (M-series): ~40-90 minutes
    GPU (CUDA):        ~20-45 minutes

Output:
    src/models/aasist_weights.pth (~1-2 MB)
"""
import os
import sys
import argparse
import gc
import random

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler

# Add project root to path for serve.* imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ---------------------------------------------------------------
# Config
# ---------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEIGHTS_OUT = os.path.join(BASE_DIR, "src", "models", "aasist_weights.pth")

SAMPLE_RATE = 16000
TARGET_LENGTH = 16000  # 1 second at 16kHz (4x faster training; model is length-agnostic)
BATCH_SIZE = 32
EPOCHS = 50
LEARNING_RATE = 1e-4  # Gentler updates for SincConv
NUM_WORKERS = 0  # HuggingFace audio decoding doesn't work well with multiprocessing
PATIENCE = 10
WARMUP_EPOCHS = 3  # Linear warmup before cosine decay

DEVICE = (
    "mps" if torch.backends.mps.is_available()
    else "cuda" if torch.cuda.is_available()
    else "cpu"
)


# ---------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------

class ASVspoofDataset(Dataset):
    """
    Wraps a HuggingFace ASVspoof 2019 split for PyTorch DataLoader.

    Handles on-the-fly audio decoding, resampling, pad/truncate to 4 seconds,
    and label extraction.  Returns (waveform_tensor, label) pairs where
    label = 0.0 (bonafide) or 1.0 (spoof).
    """

    def __init__(self, hf_data, audio_col, label_col, label_map, is_train=True):
        self.data = hf_data
        self.audio_col = audio_col
        self.label_col = label_col
        self.label_map = label_map
        self.is_train = is_train

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        item = self.data[idx]

        # --- Audio ---
        audio_info = item[self.audio_col]
        if isinstance(audio_info, dict):
            waveform = np.array(audio_info["array"], dtype=np.float32)
            sr = audio_info.get("sampling_rate", SAMPLE_RATE)
        else:
            waveform = np.array(audio_info, dtype=np.float32)
            sr = SAMPLE_RATE

        # Resample if not 16kHz
        if sr != SAMPLE_RATE:
            try:
                import torchaudio
                wav_t = torch.from_numpy(waveform).unsqueeze(0)
                wav_t = torchaudio.functional.resample(wav_t, sr, SAMPLE_RATE)
                waveform = wav_t.squeeze(0).numpy()
            except ImportError:
                # Simple linear interpolation fallback
                ratio = SAMPLE_RATE / sr
                new_len = int(len(waveform) * ratio)
                indices = np.linspace(0, len(waveform) - 1, new_len)
                waveform = np.interp(indices, np.arange(len(waveform)), waveform).astype(np.float32)

        # Pad or truncate to TARGET_LENGTH
        if len(waveform) > TARGET_LENGTH:
            if self.is_train:
                start = random.randint(0, len(waveform) - TARGET_LENGTH)
            else:
                start = 0  # deterministic for validation
            waveform = waveform[start : start + TARGET_LENGTH]
        elif len(waveform) < TARGET_LENGTH:
            waveform = np.pad(waveform, (0, TARGET_LENGTH - len(waveform)))

        # --- Label ---
        raw_label = item[self.label_col]
        if isinstance(raw_label, str):
            label = float(self.label_map.get(raw_label.lower(), 1))
        else:
            label = float(self.label_map.get(raw_label, raw_label))

        tensor = torch.from_numpy(waveform).float().unsqueeze(0)  # (1, 64000)
        return tensor, torch.tensor(label, dtype=torch.float32)


def get_labels(hf_data, label_col, label_map):
    """Extract numeric labels from the HuggingFace dataset for sampler weights."""
    # Use fast columnar access when available
    try:
        raw_labels = hf_data[label_col]
        labels = []
        for raw in raw_labels:
            if isinstance(raw, str):
                labels.append(label_map.get(raw.lower(), 1))
            else:
                labels.append(label_map.get(raw, raw))
        return labels
    except Exception:
        # Fallback to row-by-row
        labels = []
        for item in hf_data:
            raw = item[label_col]
            if isinstance(raw, str):
                labels.append(label_map.get(raw.lower(), 1))
            else:
                labels.append(label_map.get(raw, raw))
        return labels


# ---------------------------------------------------------------
# Dataset loading
# ---------------------------------------------------------------

def load_asvspoof():
    """
    Load ASVspoof 2019 LA from HuggingFace.

    Returns (train_hf, val_hf, audio_col, label_col, label_map).
    """
    try:
        from datasets import load_dataset
    except ImportError:
        print("ERROR: 'datasets' package required. Install with:")
        print("  pip install datasets soundfile")
        sys.exit(1)

    print("[data] Loading ASVspoof 2019 LA from HuggingFace...")
    print("[data] (first run downloads ~4 GB, cached afterwards)")
    print()

    # Try multiple dataset sources (in order of preference)
    ds = None
    sources = [
        ("Bisher/ASVspoof_2019_LA", None),
        ("LanceaKing/asvspoof2019", "LA"),
        ("LanceaKing/asvspoof2019", None),
    ]
    for name, config in sources:
        try:
            if config:
                ds = load_dataset(name, config)
            else:
                ds = load_dataset(name)
            print(f"[data] Loaded from: {name}" + (f" ({config})" if config else ""))
            break
        except Exception as e:
            print(f"[data] {name}: {e}")
            continue

    if ds is None:
        print("[data] ERROR: Could not load any ASVspoof 2019 dataset")
        print("[data] Try installing: pip install datasets soundfile")
        sys.exit(1)

    print(f"[data] Available splits: {list(ds.keys())}")

    # Find train and validation splits
    train_key = None
    val_key = None
    for k in ds.keys():
        kl = k.lower()
        if "train" in kl:
            train_key = k
        elif "dev" in kl or "valid" in kl:
            val_key = k
        elif "eval" in kl or "test" in kl:
            if val_key is None:
                val_key = k

    if train_key is None:
        # Use first split as train
        keys = list(ds.keys())
        train_key = keys[0]
        val_key = keys[1] if len(keys) > 1 else None

    print(f"[data] Train split: '{train_key}' ({len(ds[train_key])} samples)")

    # If no val split, carve out 15% from train
    if val_key is None:
        split = ds[train_key].train_test_split(test_size=0.15, seed=42)
        train_data = split["train"]
        val_data = split["test"]
        print(f"[data] No val split found, created 85/15 split from train")
    else:
        train_data = ds[train_key]
        val_data = ds[val_key]
        print(f"[data] Val split: '{val_key}' ({len(val_data)} samples)")

    # Auto-detect column names
    cols = train_data.column_names
    print(f"[data] Columns: {cols}")

    # Find audio column
    audio_col = None
    for candidate in ("audio", "speech", "waveform", "signal"):
        if candidate in cols:
            audio_col = candidate
            break
    if audio_col is None:
        print(f"[data] ERROR: No audio column found in {cols}")
        sys.exit(1)

    # Find label column
    label_col = None
    for candidate in ("label", "key", "is_bonafide", "class", "target"):
        if candidate in cols:
            label_col = candidate
            break
    if label_col is None:
        print(f"[data] ERROR: No label column found in {cols}")
        sys.exit(1)

    print(f"[data] Audio column: '{audio_col}', Label column: '{label_col}'")

    # Build label map
    sample_label = train_data[0][label_col]
    if isinstance(sample_label, str):
        label_map = {"bonafide": 0, "bona-fide": 0, "genuine": 0, "real": 0,
                     "spoof": 1, "fake": 1, "replay": 1}
        print(f"[data] String labels detected (sample: '{sample_label}'), using text->numeric map")
    elif isinstance(sample_label, (int, float)):
        label_map = {0: 0, 1: 1}
        print(f"[data] Numeric labels detected (sample: {sample_label})")
    else:
        label_map = {0: 0, 1: 1}
        print(f"[data] Unknown label type: {type(sample_label)}, assuming 0=real 1=fake")

    return train_data, val_data, audio_col, label_col, label_map


# ---------------------------------------------------------------
# Training
# ---------------------------------------------------------------

def set_eval_mode(model):
    """Put model into evaluation mode."""
    model.train(False)
    return model


def train(args):
    # H23: Set random seeds for reproducibility
    SEED = 42
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)

    print("=" * 60)
    print("  AudioDeepfakeNet Training (ASVspoof 2019 LA)")
    print("=" * 60)
    print()
    print(f"Device:     {DEVICE}")
    print(f"Batch size: {args.batch_size}")
    print(f"Epochs:     {args.epochs}")
    print(f"LR:         {args.learning_rate}")
    print(f"Patience:   {PATIENCE}")
    print()

    # Load data
    train_hf, val_hf, audio_col, label_col, label_map = load_asvspoof()

    # Create PyTorch datasets
    train_dataset = ASVspoofDataset(train_hf, audio_col, label_col, label_map, is_train=True)
    val_dataset = ASVspoofDataset(val_hf, audio_col, label_col, label_map, is_train=False)

    # Weighted sampler for class imbalance
    print("\n[train] Computing class weights for balanced sampling...")
    train_labels = get_labels(train_hf, label_col, label_map)
    n_bonafide = sum(1 for l in train_labels if l == 0)
    n_spoof = sum(1 for l in train_labels if l == 1)
    total = n_bonafide + n_spoof

    print(f"[train] Bonafide: {n_bonafide}, Spoof: {n_spoof}, Ratio: 1:{n_spoof/max(n_bonafide,1):.1f}")

    if n_bonafide > 0 and n_spoof > 0:
        w_bonafide = total / (2.0 * n_bonafide)
        w_spoof = total / (2.0 * n_spoof)
        sample_weights = [w_bonafide if l == 0 else w_spoof for l in train_labels]
        sampler = WeightedRandomSampler(sample_weights, num_samples=len(sample_weights), replacement=True)
        train_loader = DataLoader(
            train_dataset, batch_size=args.batch_size,
            sampler=sampler, num_workers=NUM_WORKERS, drop_last=True,
        )
    else:
        print("[train] WARNING: Only one class found, using regular sampling")
        train_loader = DataLoader(
            train_dataset, batch_size=args.batch_size,
            shuffle=True, num_workers=NUM_WORKERS, drop_last=True,
        )

    val_loader = DataLoader(
        val_dataset, batch_size=args.batch_size,
        shuffle=False, num_workers=NUM_WORKERS,
    )

    # Model (imported from serve to guarantee architecture match)
    from serve.audio_model import AudioDeepfakeNet

    # H24: Wrap model to output logits (no sigmoid) for BCEWithLogitsLoss stability
    class AudioDeepfakeNetLogits(AudioDeepfakeNet):
        def forward(self, x):
            x = self.sinc(x)
            x = self.bn0(x)
            import torch.nn.functional as _F
            x = _F.leaky_relu(x, 0.3)
            x = _F.max_pool1d(x, 2)
            x = self.block1(x)
            x = self.block2(x)
            x = self.block3(x)
            x = self.block4(x)
            x_t = x.permute(0, 2, 1)
            attn_weights = _F.softmax(self.attention(x_t), dim=1)
            x_pooled = (x_t * attn_weights).sum(dim=1)
            return self.classifier(x_pooled)  # logits, no sigmoid

    model = AudioDeepfakeNetLogits().to(DEVICE)

    total_params = sum(p.numel() for p in model.parameters())
    print(f"\n[train] Model params: {total_params:,}")
    print()

    # H24: BCEWithLogitsLoss is numerically stable (model forward no longer applies sigmoid)
    criterion = nn.BCEWithLogitsLoss()
    optimizer = optim.AdamW(model.parameters(), lr=args.learning_rate, weight_decay=0.01)

    # B2: Warmup + cosine decay scheduler
    warmup_epochs = min(WARMUP_EPOCHS, args.epochs // 5)
    cosine_scheduler = optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=max(args.epochs - warmup_epochs, 1), eta_min=1e-6
    )
    warmup_scheduler = optim.lr_scheduler.LinearLR(
        optimizer, start_factor=0.1, end_factor=1.0, total_iters=warmup_epochs
    )
    scheduler = optim.lr_scheduler.SequentialLR(
        optimizer, schedulers=[warmup_scheduler, cosine_scheduler], milestones=[warmup_epochs]
    )

    best_val_loss = float('inf')
    patience_counter = 0

    n_batches = len(train_loader)
    # Print every ~10% of batches, minimum every 25
    log_interval = max(25, n_batches // 10)

    for epoch in range(args.epochs):
        # --- Train ---
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0

        for batch_idx, (waveforms, labels) in enumerate(train_loader):
            if batch_idx < 3 and epoch == 0:
                print(f"  Batch {batch_idx} loaded ({n_batches} total)")

            waveforms = waveforms.to(DEVICE)          # (B, 1, 64000)
            labels = labels.to(DEVICE).unsqueeze(1)    # (B, 1)

            optimizer.zero_grad()
            outputs = model(waveforms)                 # (B, 1)
            loss = criterion(outputs, labels)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            train_loss += loss.item()
            predicted = (outputs > 0.5).float()
            train_correct += (predicted == labels).sum().item()
            train_total += labels.size(0)

            if (batch_idx + 1) % log_interval == 0:
                print(
                    f"  Epoch {epoch+1} | Batch {batch_idx+1}/{n_batches} | "
                    f"Loss: {loss.item():.4f}"
                )

        train_acc = train_correct / max(train_total, 1)

        # --- Validate ---
        set_eval_mode(model)
        val_loss = 0.0
        val_correct = 0
        val_total = 0

        with torch.no_grad():
            for waveforms, labels in val_loader:
                waveforms = waveforms.to(DEVICE)
                labels = labels.to(DEVICE).unsqueeze(1)
                outputs = model(waveforms)
                loss = criterion(outputs, labels)
                val_loss += loss.item()
                predicted = (outputs > 0.5).float()
                val_correct += (predicted == labels).sum().item()
                val_total += labels.size(0)

        val_acc = val_correct / max(val_total, 1)
        scheduler.step()

        avg_train_loss = train_loss / max(len(train_loader), 1)
        avg_val_loss = val_loss / max(len(val_loader), 1)
        lr = optimizer.param_groups[0]["lr"]

        print(
            f"Epoch {epoch+1}/{args.epochs} | "
            f"Train Loss: {avg_train_loss:.4f} Acc: {train_acc:.4f} | "
            f"Val Loss: {avg_val_loss:.4f} Acc: {val_acc:.4f} | "
            f"LR: {lr:.6f}"
        )

        # Save best (M29: use val_loss instead of val_acc for stable early stopping)
        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            os.makedirs(os.path.dirname(WEIGHTS_OUT), exist_ok=True)
            torch.save({
                "model_state_dict": model.state_dict(),
                "val_loss": avg_val_loss,
                "val_acc": val_acc,
                "epoch": epoch + 1,
                "architecture": "AudioDeepfakeNet-SincConv",
                "dataset": "ASVspoof2019-LA",
            }, WEIGHTS_OUT)
            print(f"  -> Saved best (val_loss: {avg_val_loss:.4f}, val_acc: {val_acc:.4f})")
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= PATIENCE:
                print(f"\nEarly stopping at epoch {epoch+1}")
                break

        # Memory cleanup
        gc.collect()
        if DEVICE == "mps":
            torch.mps.empty_cache()

    print(f"\nBest Val Loss: {best_val_loss:.4f}")
    print(f"Weights saved to: {WEIGHTS_OUT}")

    # Verify
    print("\n[train] Running smoke test...")
    verify()


def verify():
    """Smoke-test: load trained weights into our model."""
    import serve.audio_model as am
    am._model = None
    model = am.get_audio_model()
    if model is not None:
        print("[train] Verification PASSED")
    else:
        print("[train] Verification FAILED")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train AudioDeepfakeNet on ASVspoof 2019 LA")
    parser.add_argument("--epochs", type=int, default=EPOCHS)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--learning-rate", type=float, default=LEARNING_RATE)
    args = parser.parse_args()
    train(args)
