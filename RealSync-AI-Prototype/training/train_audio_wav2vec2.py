#!/usr/bin/env python
"""
Train Wav2Vec2 audio deepfake classifier on ASVspoof 2019 LA.

Two-phase fine-tuning:
  Phase 1 (epochs 1-5):  Freeze wav2vec2 encoder. Train only classification head (~197K params). LR: 1e-3.
  Phase 2 (epochs 6-20): Unfreeze top 4 transformer layers. Differential LR: 2e-5 (encoder) / 1e-4 (head).

Uses the same ASVspoof 2019 LA dataset as train_audio_sincconv.py.

Usage:
    cd RealSync-AI-Prototype
    pip install datasets soundfile transformers
    python training/train_audio_wav2vec2.py
    python training/train_audio_wav2vec2.py --epochs 20 --batch-size 16

Training time:
    Mac MPS (M-series): ~2-4 hours
    GPU (CUDA):         ~30-60 minutes

Output:
    src/models/wav2vec2_audio_weights.pth
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
WEIGHTS_OUT = os.path.join(BASE_DIR, "src", "models", "wav2vec2_audio_weights.pth")

SAMPLE_RATE = 16000
TARGET_LENGTH = 64000  # 4 seconds at 16kHz (wav2vec2 benefits from longer context)
BATCH_SIZE = 16
EPOCHS = 20
PHASE1_EPOCHS = 5      # Frozen encoder, head-only training
PHASE1_LR = 1e-3
PHASE2_LR_ENCODER = 2e-5
PHASE2_LR_HEAD = 1e-4
NUM_WORKERS = 0
PATIENCE = 5

DEVICE = (
    "mps" if torch.backends.mps.is_available()
    else "cuda" if torch.cuda.is_available()
    else "cpu"
)


# ---------------------------------------------------------------
# Dataset (reuses pattern from train_audio_sincconv.py)
# ---------------------------------------------------------------

class ASVspoofDataset(Dataset):
    """
    Wraps a HuggingFace ASVspoof 2019 split for PyTorch DataLoader.

    Returns (waveform_tensor, label) pairs where waveform is a 1D tensor
    (seq_len,) and label = 0.0 (bonafide) or 1.0 (spoof).
    """

    def __init__(self, hf_data, audio_col, label_col, label_map, processor, is_train=True):
        self.data = hf_data
        self.audio_col = audio_col
        self.label_col = label_col
        self.label_map = label_map
        self.processor = processor
        self.is_train = is_train

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        item = self.data[idx]

        # --- Audio ---
        audio_info = item[self.audio_col]
        if isinstance(audio_info, dict):
            # Legacy datasets format: {"array": [...], "sampling_rate": 16000}
            waveform = np.array(audio_info["array"], dtype=np.float32)
            sr = audio_info.get("sampling_rate", SAMPLE_RATE)
        elif hasattr(audio_info, 'get_all_samples'):
            # New torchcodec AudioDecoder format
            samples = audio_info.get_all_samples()
            waveform = samples.data.squeeze(0).numpy().astype(np.float32)
            sr = samples.sample_rate
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
                ratio = SAMPLE_RATE / sr
                new_len = int(len(waveform) * ratio)
                indices = np.linspace(0, len(waveform) - 1, new_len)
                waveform = np.interp(indices, np.arange(len(waveform)), waveform).astype(np.float32)

        # Pad or truncate to TARGET_LENGTH
        if len(waveform) > TARGET_LENGTH:
            if self.is_train:
                start = random.randint(0, len(waveform) - TARGET_LENGTH)
            else:
                start = 0
            waveform = waveform[start : start + TARGET_LENGTH]
        elif len(waveform) < TARGET_LENGTH:
            waveform = np.pad(waveform, (0, TARGET_LENGTH - len(waveform)))

        # Normalize with Wav2Vec2Processor
        inputs = self.processor(
            waveform,
            sampling_rate=SAMPLE_RATE,
            return_tensors="np",
            padding=False,
        )
        input_values = inputs.input_values[0]  # (seq_len,)

        # --- Label ---
        raw_label = item[self.label_col]
        if isinstance(raw_label, str):
            label = float(self.label_map.get(raw_label.lower(), 1))
        else:
            label = float(self.label_map.get(raw_label, raw_label))

        return torch.from_numpy(input_values).float(), torch.tensor(label, dtype=torch.float32)


def get_labels(hf_data, label_col, label_map):
    """Extract numeric labels from the HuggingFace dataset for sampler weights."""
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
        labels = []
        for item in hf_data:
            raw = item[label_col]
            if isinstance(raw, str):
                labels.append(label_map.get(raw.lower(), 1))
            else:
                labels.append(label_map.get(raw, raw))
        return labels


# ---------------------------------------------------------------
# Dataset loading (same sources as train_audio_sincconv.py)
# ---------------------------------------------------------------

def load_asvspoof():
    """Load ASVspoof 2019 LA from HuggingFace."""
    try:
        from datasets import load_dataset
    except ImportError:
        print("ERROR: 'datasets' package required. Install with:")
        print("  pip install datasets soundfile")
        sys.exit(1)

    print("[data] Loading ASVspoof 2019 LA from HuggingFace...")
    print("[data] (first run downloads ~4 GB, cached afterwards)")
    print()

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
        sys.exit(1)

    print(f"[data] Available splits: {list(ds.keys())}")

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
        keys = list(ds.keys())
        train_key = keys[0]
        val_key = keys[1] if len(keys) > 1 else None

    print(f"[data] Train split: '{train_key}' ({len(ds[train_key])} samples)")

    if val_key is None:
        split = ds[train_key].train_test_split(test_size=0.15, seed=42)
        train_data = split["train"]
        val_data = split["test"]
        print("[data] No val split found, created 85/15 split from train")
    else:
        train_data = ds[train_key]
        val_data = ds[val_key]
        print(f"[data] Val split: '{val_key}' ({len(val_data)} samples)")

    cols = train_data.column_names
    print(f"[data] Columns: {cols}")

    audio_col = None
    for candidate in ("audio", "speech", "waveform", "signal"):
        if candidate in cols:
            audio_col = candidate
            break
    if audio_col is None:
        print(f"[data] ERROR: No audio column found in {cols}")
        sys.exit(1)

    label_col = None
    for candidate in ("label", "key", "is_bonafide", "class", "target"):
        if candidate in cols:
            label_col = candidate
            break
    if label_col is None:
        print(f"[data] ERROR: No label column found in {cols}")
        sys.exit(1)

    print(f"[data] Audio column: '{audio_col}', Label column: '{label_col}'")

    # Use columnar access to avoid triggering audio decoding
    sample_label = train_data[label_col][0]
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

def train(args):
    SEED = 42
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)

    print("=" * 60)
    print("  Wav2Vec2 Audio Deepfake Training (ASVspoof 2019 LA)")
    print("=" * 60)
    print()
    print(f"Device:          {DEVICE}")
    print(f"Batch size:      {args.batch_size}")
    print(f"Epochs:          {args.epochs}")
    print(f"Phase 1 epochs:  {PHASE1_EPOCHS} (frozen encoder, LR={PHASE1_LR})")
    print(f"Phase 2 epochs:  {args.epochs - PHASE1_EPOCHS} (top 4 layers unfrozen)")
    print(f"Phase 2 LR:      encoder={PHASE2_LR_ENCODER}, head={PHASE2_LR_HEAD}")
    print(f"Patience:        {PATIENCE}")
    print()

    # Load processor
    from transformers import Wav2Vec2Processor
    processor = Wav2Vec2Processor.from_pretrained("facebook/wav2vec2-base")

    # Load data
    train_hf, val_hf, audio_col, label_col, label_map = load_asvspoof()

    # Create datasets
    train_dataset = ASVspoofDataset(train_hf, audio_col, label_col, label_map, processor, is_train=True)
    val_dataset = ASVspoofDataset(val_hf, audio_col, label_col, label_map, processor, is_train=False)

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

    # Build model
    from serve.audio_model import Wav2Vec2AudioClassifier

    model = Wav2Vec2AudioClassifier(freeze_encoder=True).to(DEVICE)

    head_params = sum(p.numel() for p in model.classifier.parameters())
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"\n[train] Total params: {total_params:,}")
    print(f"[train] Classification head params: {head_params:,}")
    print(f"[train] Trainable (Phase 1): {trainable_params:,}")
    print()

    criterion = nn.BCELoss()
    best_val_loss = float('inf')
    patience_counter = 0

    n_batches = len(train_loader)
    log_interval = max(25, n_batches // 10)

    for epoch in range(args.epochs):
        # ---- Phase transition: unfreeze top 4 transformer layers at epoch PHASE1_EPOCHS ----
        if epoch == PHASE1_EPOCHS:
            print("\n" + "=" * 60)
            print("  Phase 2: Unfreezing top 4 transformer layers")
            print("=" * 60 + "\n")

            # Unfreeze top 4 transformer layers
            encoder_layers = model.encoder.encoder.layers
            n_layers = len(encoder_layers)
            for i in range(max(0, n_layers - 4), n_layers):
                for param in encoder_layers[i].parameters():
                    param.requires_grad = True
                print(f"  Unfroze encoder layer {i}")

            trainable_now = sum(p.numel() for p in model.parameters() if p.requires_grad)
            print(f"  Trainable params (Phase 2): {trainable_now:,}\n")

        # ---- Set up optimizer per phase ----
        if epoch < PHASE1_EPOCHS:
            optimizer = optim.AdamW(
                model.classifier.parameters(),
                lr=PHASE1_LR,
                weight_decay=0.01,
            )
        elif epoch == PHASE1_EPOCHS:
            # Differential learning rates for Phase 2
            encoder_params = [p for p in model.encoder.parameters() if p.requires_grad]
            optimizer = optim.AdamW([
                {"params": encoder_params, "lr": PHASE2_LR_ENCODER},
                {"params": model.classifier.parameters(), "lr": PHASE2_LR_HEAD},
            ], weight_decay=0.01)
            # Cosine scheduler for Phase 2
            remaining_epochs = args.epochs - PHASE1_EPOCHS
            scheduler = optim.lr_scheduler.CosineAnnealingLR(
                optimizer, T_max=max(remaining_epochs, 1), eta_min=1e-6
            )

        # --- Train ---
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0

        for batch_idx, (waveforms, labels) in enumerate(train_loader):
            if batch_idx < 3 and epoch == 0:
                print(f"  Batch {batch_idx} loaded ({n_batches} total)")

            waveforms = waveforms.to(DEVICE)          # (B, seq_len)
            labels = labels.to(DEVICE).unsqueeze(1)    # (B, 1)

            optimizer.zero_grad()
            outputs = model(waveforms)                 # (B, 1)
            loss = criterion(outputs, labels)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            train_loss += loss.item()
            predicted = (outputs > 0.0).float()
            train_correct += (predicted == labels).sum().item()
            train_total += labels.size(0)

            if (batch_idx + 1) % log_interval == 0:
                print(
                    f"  Epoch {epoch+1} | Batch {batch_idx+1}/{n_batches} | "
                    f"Loss: {loss.item():.4f}"
                )

        train_acc = train_correct / max(train_total, 1)

        # --- Validate ---
        model.train(False)
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
                predicted = (outputs > 0.0).float()
                val_correct += (predicted == labels).sum().item()
                val_total += labels.size(0)

        val_acc = val_correct / max(val_total, 1)

        # Step scheduler only in Phase 2
        if epoch >= PHASE1_EPOCHS:
            scheduler.step()

        avg_train_loss = train_loss / max(len(train_loader), 1)
        avg_val_loss = val_loss / max(len(val_loader), 1)

        phase = "P1-frozen" if epoch < PHASE1_EPOCHS else "P2-finetune"
        lrs = [f"{pg['lr']:.6f}" for pg in optimizer.param_groups]
        lr_str = "/".join(lrs)

        print(
            f"Epoch {epoch+1}/{args.epochs} [{phase}] | "
            f"Train Loss: {avg_train_loss:.4f} Acc: {train_acc:.4f} | "
            f"Val Loss: {avg_val_loss:.4f} Acc: {val_acc:.4f} | "
            f"LR: {lr_str}"
        )

        # Save best
        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            os.makedirs(os.path.dirname(WEIGHTS_OUT), exist_ok=True)
            torch.save({
                "classifier_state_dict": model.classifier.state_dict(),
                "model_state_dict": model.state_dict(),
                "val_loss": avg_val_loss,
                "val_acc": val_acc,
                "epoch": epoch + 1,
                "phase": phase,
                "architecture": "Wav2Vec2AudioClassifier",
                "encoder": "facebook/wav2vec2-base",
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
    """Smoke-test: load trained weights into the inference model."""
    import serve.audio_model as am
    am._model = None
    am._processor = None
    model = am.get_audio_model()
    if model is not None:
        print("[train] Verification PASSED — model loads with trained weights")
    else:
        print("[train] Verification FAILED — model could not load")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Wav2Vec2 Audio Deepfake on ASVspoof 2019 LA")
    parser.add_argument("--epochs", type=int, default=EPOCHS)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    args = parser.parse_args()
    train(args)
