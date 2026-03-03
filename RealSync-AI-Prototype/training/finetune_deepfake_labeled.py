#!/usr/bin/env python
"""
Fine-tune EfficientNet-B4 deepfake detector on labeled real/fake face data.

Uses a directory structure with separate real/ and fake/ subdirectories.
ImageNet pretrained backbone with differential learning rates and early stopping.

Usage:
    cd RealSync-AI-Prototype
    python training/finetune_deepfake_labeled.py \
        --real-dir data/deepfake_real --fake-dir data/deepfake_fake \
        --epochs 30 --batch-size 16

Output:
    src/models/efficientnet_b4_deepfake.pth (updated in-place)
"""
import os
import sys
import argparse
import glob
import random

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from serve.config import EFFICIENTNET_INPUT_SIZE, EFFICIENTNET_WEIGHTS_PATH
from serve.deepfake_model import EfficientNetDeepfake

# ---------------------------------------------------------------
# Config
# ---------------------------------------------------------------

BATCH_SIZE = 16
EPOCHS = 30
SEED = 42
EARLY_STOP_PATIENCE = 8

DEVICE = (
    "mps" if torch.backends.mps.is_available()
    else "cuda" if torch.cuda.is_available()
    else "cpu"
)

IMG_SIZE = 300  # Closer to inference size (380), better feature preservation

_train_transform = transforms.Compose([
    transforms.Resize((IMG_SIZE + 16, IMG_SIZE + 16)),
    transforms.RandomCrop(IMG_SIZE),
    transforms.RandomHorizontalFlip(),
    transforms.RandomRotation(10),
    transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1),
    transforms.RandomGrayscale(p=0.05),
    transforms.GaussianBlur(kernel_size=3, sigma=(0.1, 1.0)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])

_val_transform = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])


# ---------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------

class LabeledFaceDataset(Dataset):
    """Dataset with separate real (label=0) and fake (label=1) images."""

    def __init__(self, real_paths, fake_paths, transform=None):
        self.samples = [(p, 0.0) for p in real_paths] + [(p, 1.0) for p in fake_paths]
        random.shuffle(self.samples)
        self.transform = transform

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        img = Image.open(path).convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, torch.tensor(label, dtype=torch.float32)


def find_images(directory):
    """Find all jpg/png images in a directory."""
    exts = ("*.jpg", "*.jpeg", "*.png", "*.JPG", "*.JPEG", "*.PNG")
    paths = []
    for ext in exts:
        paths.extend(glob.glob(os.path.join(directory, "**", ext), recursive=True))
    return sorted(set(paths))


# ---------------------------------------------------------------
# Training
# ---------------------------------------------------------------

def train(args):
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)

    print("=" * 60)
    print("  EfficientNet-B4 Deepfake Fine-Tuning (Labeled Data)")
    print("=" * 60)
    print(f"Device:     {DEVICE}")
    print(f"Real dir:   {args.real_dir}")
    print(f"Fake dir:   {args.fake_dir}")
    print(f"Batch size: {args.batch_size}")
    print(f"Epochs:     {args.epochs}")
    print()

    # Find images
    real_paths = find_images(args.real_dir)
    fake_paths = find_images(args.fake_dir)
    print(f"Real images: {len(real_paths)}")
    print(f"Fake images: {len(fake_paths)}")

    if len(real_paths) < 10 or len(fake_paths) < 10:
        print("ERROR: Need at least 10 images in each directory.")
        sys.exit(1)

    # Split 85/15
    random.shuffle(real_paths)
    random.shuffle(fake_paths)
    real_split = int(len(real_paths) * 0.85)
    fake_split = int(len(fake_paths) * 0.85)

    train_real = real_paths[:real_split]
    val_real = real_paths[real_split:]
    train_fake = fake_paths[:fake_split]
    val_fake = fake_paths[fake_split:]

    print(f"Train: {len(train_real)} real + {len(train_fake)} fake = {len(train_real) + len(train_fake)}")
    print(f"Val:   {len(val_real)} real + {len(val_fake)} fake = {len(val_real) + len(val_fake)}")
    print()

    train_dataset = LabeledFaceDataset(train_real, train_fake, transform=_train_transform)
    val_dataset = LabeledFaceDataset(val_real, val_fake, transform=_val_transform)
    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False, num_workers=0)

    # Load model
    model = EfficientNetDeepfake()

    # Re-initialize classifier head
    classifier_linear = model.net.classifier[1]
    nn.init.xavier_uniform_(classifier_linear.weight)
    nn.init.zeros_(classifier_linear.bias)
    print("[model] Re-initialized classifier head (Xavier)")

    # Freeze early backbone (blocks 0-3), train blocks 4-8 + head
    # Pretrained features in blocks 0-3 are robust low-level (edges, textures)
    # Blocks 4+ need task adaptation for deepfake-specific patterns
    n_blocks = len(model.net.features)
    freeze_up_to = 4  # Freeze blocks 0,1,2,3
    for i in range(min(freeze_up_to, n_blocks)):
        for param in model.net.features[i].parameters():
            param.requires_grad = False
    print(f"[model] Froze blocks 0..{freeze_up_to-1}, training blocks {freeze_up_to}..{n_blocks-1} + head")

    backbone_params = [p for p in model.net.features.parameters() if p.requires_grad]
    head_params = list(model.net.classifier.parameters())

    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    print(f"[model] Trainable params: {trainable:,} / {total:,}")
    print()

    model = model.to(DEVICE)

    criterion = nn.BCEWithLogitsLoss()
    optimizer = optim.AdamW([
        {"params": backbone_params, "lr": args.backbone_lr},
        {"params": head_params, "lr": args.head_lr},
    ], weight_decay=1e-4)

    # Cosine annealing
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-6)

    def forward_logits(images):
        return model.net(images)

    best_val_acc = 0.0
    patience_counter = 0

    for epoch in range(args.epochs):
        # Train
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0

        for images, labels in train_loader:
            images = images.to(DEVICE)
            labels = labels.to(DEVICE).unsqueeze(1)

            optimizer.zero_grad()
            logits = forward_logits(images)
            loss = criterion(logits, labels)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            train_loss += loss.item()
            predicted = (logits > 0.0).float()
            train_correct += (predicted == labels).sum().item()
            train_total += labels.size(0)

        # Validate
        model.train(False)
        val_loss = 0.0
        val_correct = 0
        val_total = 0

        with torch.no_grad():
            for images, labels in val_loader:
                images = images.to(DEVICE)
                labels = labels.to(DEVICE).unsqueeze(1)
                logits = forward_logits(images)
                loss = criterion(logits, labels)
                val_loss += loss.item()
                predicted = (logits > 0.0).float()
                val_correct += (predicted == labels).sum().item()
                val_total += labels.size(0)

        scheduler.step()

        train_acc = train_correct / max(train_total, 1)
        val_acc = val_correct / max(val_total, 1)
        avg_train_loss = train_loss / max(len(train_loader), 1)
        avg_val_loss = val_loss / max(len(val_loader), 1)
        lr_bb = optimizer.param_groups[0]["lr"]
        lr_hd = optimizer.param_groups[1]["lr"]

        print(
            f"Epoch {epoch+1}/{args.epochs} | "
            f"Train Loss: {avg_train_loss:.4f} Acc: {train_acc:.4f} | "
            f"Val Loss: {avg_val_loss:.4f} Acc: {val_acc:.4f} | "
            f"LR bb={lr_bb:.6f} hd={lr_hd:.6f}"
        )

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            patience_counter = 0
            os.makedirs(os.path.dirname(EFFICIENTNET_WEIGHTS_PATH), exist_ok=True)
            torch.save({
                "model_state_dict": model.state_dict(),
                "val_acc": val_acc,
                "epoch": epoch + 1,
                "architecture": "EfficientNet-B4-SBI",
                "fine_tuned": True,
                "note": "Fine-tuned on labeled real/fake data with ImageNet pretrained backbone",
            }, EFFICIENTNET_WEIGHTS_PATH)
            print(f"  -> Saved best (val_acc: {val_acc:.4f})")
        else:
            patience_counter += 1
            if patience_counter >= EARLY_STOP_PATIENCE:
                print(f"\n[early stop] No improvement for {EARLY_STOP_PATIENCE} epochs. Stopping.")
                break

    print(f"\nBest Val Accuracy: {best_val_acc:.4f}")
    print(f"Weights saved to: {EFFICIENTNET_WEIGHTS_PATH}")

    # Verify
    print("\n[verify] Smoke test...")
    import serve.deepfake_model as dm
    dm._model = None
    m = dm.get_deepfake_model()
    print(f"[verify] {'PASSED' if m is not None else 'FAILED'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fine-tune EfficientNet-B4 on labeled deepfake data")
    parser.add_argument("--real-dir", required=True, help="Directory containing real face images")
    parser.add_argument("--fake-dir", required=True, help="Directory containing fake face images")
    parser.add_argument("--epochs", type=int, default=EPOCHS)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--backbone-lr", type=float, default=3e-5, help="Learning rate for backbone")
    parser.add_argument("--head-lr", type=float, default=1e-3, help="Learning rate for classifier head")
    args = parser.parse_args()
    train(args)
