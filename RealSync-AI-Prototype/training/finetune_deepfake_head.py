#!/usr/bin/env python
"""
Fine-tune only the classifier head of EfficientNet-B4 deepfake model.

The SBI backbone weights are correctly loaded (704 params), but the
classifier head (Dropout + Linear(1792,1)) was randomly initialized
because SBI uses 2-class softmax while we use 1-class sigmoid.

This script freezes the backbone and trains only the 2-parameter
classifier on labeled real/fake face data using self-blended images
(SBI augmentation) — no external fake data required.

Usage:
    cd RealSync-AI-Prototype
    pip install Pillow
    python training/finetune_deepfake_head.py --data-dir /path/to/real_faces
    python training/finetune_deepfake_head.py --data-dir /path/to/real_faces --epochs 20

The --data-dir should contain real face images (jpg/png). Fakes are
generated on-the-fly via self-blended augmentation.

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
from PIL import Image, ImageFilter

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from serve.config import EFFICIENTNET_INPUT_SIZE, EFFICIENTNET_WEIGHTS_PATH
from serve.deepfake_model import EfficientNetDeepfake

# ---------------------------------------------------------------
# Config
# ---------------------------------------------------------------

BATCH_SIZE = 16
EPOCHS = 20
LEARNING_RATE = 3e-4  # Moderate LR for partial backbone fine-tuning
SEED = 42

DEVICE = (
    "mps" if torch.backends.mps.is_available()
    else "cuda" if torch.cuda.is_available()
    else "cpu"
)

IMG_SIZE = EFFICIENTNET_INPUT_SIZE  # 380

_train_transform = transforms.Compose([
    transforms.Resize((IMG_SIZE + 20, IMG_SIZE + 20)),
    transforms.RandomCrop(IMG_SIZE),
    transforms.RandomHorizontalFlip(),
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
# Self-Blended Image (SBI) augmentation
# ---------------------------------------------------------------

def create_self_blend(image: Image.Image) -> Image.Image:
    """
    Generate a fake face from a real face using aggressive self-blending.

    Applies strong color/blur/compression transforms to a copy of the image,
    then alpha-blends a random region back onto the original. Creates visible
    artifacts similar to face-swap deepfakes for robust training signal.
    """
    w, h = image.size
    img_np = np.array(image).astype(np.float32)

    # Strong color jitter on source (wider range for clear signal)
    jitter = np.random.uniform(0.65, 1.35, size=(1, 1, 3)).astype(np.float32)
    aug_np = np.clip(img_np * jitter, 0, 255)

    # Always apply Gaussian blur (deepfake hallmark)
    radius = random.choice([2, 3, 4, 5])
    augmented = Image.fromarray(aug_np.astype(np.uint8))
    augmented = augmented.filter(ImageFilter.GaussianBlur(radius=radius))

    # JPEG compression artifacts (common in deepfakes)
    if random.random() > 0.3:
        import io
        buf = io.BytesIO()
        quality = random.randint(15, 40)
        augmented.save(buf, format="JPEG", quality=quality)
        buf.seek(0)
        augmented = Image.open(buf).copy()

    aug_np = np.array(augmented).astype(np.float32)

    # Random slight geometric shift (sub-pixel misalignment)
    shift_x = random.randint(-3, 3)
    shift_y = random.randint(-3, 3)
    aug_np = np.roll(aug_np, shift_x, axis=1)
    aug_np = np.roll(aug_np, shift_y, axis=0)

    # Create elliptical blend mask (face region)
    mask = np.zeros((h, w), dtype=np.float32)
    cx = w // 2 + random.randint(-w // 8, w // 8)
    cy = h // 2 + random.randint(-h // 8, h // 8)
    rx = random.randint(w // 4, w // 3)
    ry = random.randint(h // 4, h // 3)
    y, x = np.ogrid[:h, :w]
    ellipse = ((x - cx) ** 2 / max(rx ** 2, 1)) + ((y - cy) ** 2 / max(ry ** 2, 1))
    mask[ellipse <= 1.0] = 1.0

    # Gaussian-smooth the mask edges (but less smooth = more visible boundary)
    mask_img = Image.fromarray((mask * 255).astype(np.uint8))
    mask_img = mask_img.filter(ImageFilter.GaussianBlur(radius=max(w // 30, 2)))
    mask = np.array(mask_img).astype(np.float32) / 255.0

    # Blend
    mask_3d = mask[:, :, np.newaxis]
    blended = img_np * (1 - mask_3d) + aug_np * mask_3d
    blended = np.clip(blended, 0, 255).astype(np.uint8)

    return Image.fromarray(blended)


# ---------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------

class RealFakeDataset(Dataset):
    """
    Dataset that loads real face images and generates fake counterparts
    on-the-fly using self-blended augmentation.

    Each epoch, every real image appears once as real (label=0) and
    once as fake (label=1), giving a balanced 50/50 split.
    """

    def __init__(self, image_paths: list, transform=None):
        self.paths = image_paths
        self.transform = transform

    def __len__(self):
        return len(self.paths) * 2  # real + fake for each image

    def __getitem__(self, idx):
        is_fake = idx >= len(self.paths)
        img_idx = idx % len(self.paths)

        img = Image.open(self.paths[img_idx]).convert("RGB")

        if is_fake:
            img = create_self_blend(img)
            label = 1.0  # fake
        else:
            label = 0.0  # real

        if self.transform:
            img = self.transform(img)

        return img, torch.tensor(label, dtype=torch.float32)


# ---------------------------------------------------------------
# Training
# ---------------------------------------------------------------

def find_images(data_dir: str) -> list:
    """Find all jpg/png images in a directory (recursive)."""
    exts = ("*.jpg", "*.jpeg", "*.png", "*.JPG", "*.JPEG", "*.PNG")
    paths = []
    for ext in exts:
        paths.extend(glob.glob(os.path.join(data_dir, "**", ext), recursive=True))
    return sorted(set(paths))


def train(args):
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)

    print("=" * 60)
    print("  EfficientNet-B4 Classifier Head Fine-Tuning")
    print("=" * 60)
    print(f"Device:     {DEVICE}")
    print(f"Data dir:   {args.data_dir}")
    print(f"Batch size: {args.batch_size}")
    print(f"Epochs:     {args.epochs}")
    print(f"LR:         {args.learning_rate}")
    print()

    # Find images
    image_paths = find_images(args.data_dir)
    if len(image_paths) < 10:
        print(f"ERROR: Found only {len(image_paths)} images. Need at least 10.")
        print("Provide a directory with real face images (jpg/png).")
        sys.exit(1)

    # Split 85/15
    random.shuffle(image_paths)
    split_idx = int(len(image_paths) * 0.85)
    train_paths = image_paths[:split_idx]
    val_paths = image_paths[split_idx:]

    print(f"Images found: {len(image_paths)}")
    print(f"Train: {len(train_paths)}, Val: {len(val_paths)}")
    print(f"Effective samples per epoch: {len(train_paths) * 2} (real + SBI fake)")
    print()

    train_dataset = RealFakeDataset(train_paths, transform=_train_transform)
    val_dataset = RealFakeDataset(val_paths, transform=_val_transform)
    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False, num_workers=0)

    # Load model with existing weights
    model = EfficientNetDeepfake()
    if os.path.isfile(EFFICIENTNET_WEIGHTS_PATH):
        state = torch.load(EFFICIENTNET_WEIGHTS_PATH, map_location="cpu", weights_only=True)
        state_dict = state.get("model_state_dict", state)
        model.load_state_dict(state_dict)
        print(f"[model] Loaded existing weights from {EFFICIENTNET_WEIGHTS_PATH}")
    else:
        print(f"[model] WARNING: No weights at {EFFICIENTNET_WEIGHTS_PATH}, using random init")

    # Re-initialize classifier head with small weights to avoid extreme logits
    classifier_linear = model.net.classifier[1]
    nn.init.xavier_uniform_(classifier_linear.weight)
    nn.init.zeros_(classifier_linear.bias)
    print("[model] Re-initialized classifier head (Xavier)")

    # Freeze early backbone layers, unfreeze last 2 feature blocks + classifier
    for param in model.net.features.parameters():
        param.requires_grad = False
    # Unfreeze last 2 feature blocks for better adaptation
    n_blocks = len(model.net.features)
    for i in range(max(0, n_blocks - 2), n_blocks):
        for param in model.net.features[i].parameters():
            param.requires_grad = True
    print(f"[model] Unfroze last 2 feature blocks ({n_blocks - 2}..{n_blocks - 1})")

    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    print(f"[model] Trainable params: {trainable:,} / {total:,}")
    print()

    model = model.to(DEVICE)

    # BCEWithLogitsLoss is numerically stable (handles extreme logits)
    criterion = nn.BCEWithLogitsLoss()
    optimizer = optim.Adam(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=args.learning_rate,
        weight_decay=1e-4,
    )

    best_val_acc = 0.0

    # Helper: get logits (skip sigmoid) for BCEWithLogitsLoss
    def forward_logits(images):
        return model.net(images)  # raw logits, no sigmoid

    for epoch in range(args.epochs):
        # Train
        model.train()
        # Keep frozen feature blocks in eval mode for BatchNorm
        for i in range(max(0, n_blocks - 2)):
            model.net.features[i].train(False)

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
            predicted = (logits > 0.0).float()  # logit > 0 = sigmoid > 0.5
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

        train_acc = train_correct / max(train_total, 1)
        val_acc = val_correct / max(val_total, 1)
        avg_train_loss = train_loss / max(len(train_loader), 1)
        avg_val_loss = val_loss / max(len(val_loader), 1)

        print(
            f"Epoch {epoch+1}/{args.epochs} | "
            f"Train Loss: {avg_train_loss:.4f} Acc: {train_acc:.4f} | "
            f"Val Loss: {avg_val_loss:.4f} Acc: {val_acc:.4f}"
        )

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            os.makedirs(os.path.dirname(EFFICIENTNET_WEIGHTS_PATH), exist_ok=True)
            torch.save({
                "model_state_dict": model.state_dict(),
                "val_acc": val_acc,
                "epoch": epoch + 1,
                "architecture": "EfficientNet-B4-SBI",
                "fine_tuned": True,
                "note": "Classifier head fine-tuned with SBI augmentation",
            }, EFFICIENTNET_WEIGHTS_PATH)
            print(f"  -> Saved best (val_acc: {val_acc:.4f})")

    print(f"\nBest Val Accuracy: {best_val_acc:.4f}")
    print(f"Weights saved to: {EFFICIENTNET_WEIGHTS_PATH}")

    # Verify
    print("\n[verify] Smoke test...")
    import serve.deepfake_model as dm
    dm._model = None
    m = dm.get_deepfake_model()
    print(f"[verify] {'PASSED' if m is not None else 'FAILED'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fine-tune EfficientNet-B4 deepfake classifier head")
    parser.add_argument("--data-dir", required=True, help="Directory containing real face images")
    parser.add_argument("--epochs", type=int, default=EPOCHS)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--learning-rate", type=float, default=LEARNING_RATE)
    args = parser.parse_args()
    train(args)
