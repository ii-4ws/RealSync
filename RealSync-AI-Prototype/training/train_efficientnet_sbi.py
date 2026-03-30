#!/usr/bin/env python
"""
Train EfficientNet-B4 with Self-Blended Images (SBI) for deepfake detection.

SBI creates training data by blending a face with itself using different
augmentations, teaching the model to detect blending artifacts common
across all deepfake methods -- giving strong cross-dataset generalization.

Reference:
  Shiohara & Yamasaki, "Detecting Deepfakes with Self-Blended Images", CVPR 2022

Usage:
    python training/train_efficientnet_sbi.py
    python training/train_efficientnet_sbi.py --data-dir /path/to/faces
    python training/train_efficientnet_sbi.py --epochs 20 --batch-size 8

Expects real face images at:
    data/ff++_real/   (extracted real faces from FaceForensics++)
    OR any folder of real face images (jpg/png)

Outputs:
    src/models/efficientnet_b4_deepfake.pth
"""
import os
import sys
import argparse
import random
import gc

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models
from PIL import Image, ImageFilter

# ---------------------------------------------------------------
# Config
# ---------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA_DIR = os.path.join(BASE_DIR, "data", "ff++_real")
WEIGHTS_OUT = os.path.join(BASE_DIR, "src", "models", "efficientnet_b4_deepfake.pth")

IMG_SIZE = 380
BATCH_SIZE = 8
EPOCHS = 15
LEARNING_RATE = 1e-4
DEVICE = (
    "mps" if torch.backends.mps.is_available()
    else "cuda" if torch.cuda.is_available()
    else "cpu"
)
NUM_WORKERS = 2
VAL_SPLIT = 0.15


# ---------------------------------------------------------------
# Model (matches serve/deepfake_model.py EfficientNetDeepfake)
# ---------------------------------------------------------------

class EfficientNetDeepfake(nn.Module):
    def __init__(self):
        super().__init__()
        backbone = models.efficientnet_b4(weights=models.EfficientNet_B4_Weights.IMAGENET1K_V1)
        in_features = backbone.classifier[1].in_features
        backbone.classifier = nn.Sequential(
            nn.Dropout(p=0.4),
            nn.Linear(in_features, 1),
        )
        self.net = backbone

    def forward(self, x):
        # H24: Return logits (no sigmoid) for BCEWithLogitsLoss stability during training
        # Inference model in serve/deepfake_model.py keeps sigmoid for probability output
        return self.net(x)


# ---------------------------------------------------------------
# Self-Blended Image (SBI) augmentation
# ---------------------------------------------------------------

class SBIAugmentor:
    """
    Creates self-blended images from real faces.

    By blending a face with an augmented version of itself, we create
    training samples that mimic blending artifacts found in deepfakes
    without needing actual deepfake data.
    """

    def __init__(self, img_size=380):
        self.img_size = img_size
        self.source_aug = transforms.Compose([
            transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.3, hue=0.05),
            transforms.RandomAffine(degrees=5, translate=(0.03, 0.03), scale=(0.97, 1.03)),
        ])

    def _generate_blend_mask(self, size):
        """Generate a soft elliptical blending mask."""
        w, h = size
        cx = w // 2 + random.randint(-w // 8, w // 8)
        cy = h // 2 + random.randint(-h // 8, h // 8)
        rx = max(random.randint(w // 4, w // 2), 1)
        ry = max(random.randint(h // 4, h // 2), 1)

        y, x = np.ogrid[:h, :w]
        dist = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
        mask_np = (255 * np.clip(1.0 - dist, 0, 1)).astype(np.uint8)
        mask = Image.fromarray(mask_np)

        blur_radius = random.choice([5, 7, 9, 11])
        mask = mask.filter(ImageFilter.GaussianBlur(radius=blur_radius))
        return mask

    def create_sbi(self, real_img):
        """Create a self-blended image from a real face."""
        source = self.source_aug(real_img)
        mask = self._generate_blend_mask(real_img.size)
        alpha = random.uniform(0.3, 0.9)

        mask_np = np.array(mask).astype(np.float32) / 255.0 * alpha
        real_np = np.array(real_img).astype(np.float32)
        source_np = np.array(source).astype(np.float32)

        mask_3ch = np.stack([mask_np] * 3, axis=-1)
        blended = source_np * mask_3ch + real_np * (1.0 - mask_3ch)
        blended = np.clip(blended, 0, 255).astype(np.uint8)
        return Image.fromarray(blended)


# ---------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------

class SBIDataset(Dataset):
    """
    For each real face image, produces:
      - The original (label=0, real)
      - A self-blended version (label=1, fake)
    Dataset size = 2x number of real images.
    """

    def __init__(self, image_paths, sbi_augmentor, is_train=True):
        self.image_paths = image_paths
        self.sbi = sbi_augmentor
        self.is_train = is_train
        self.shared_aug = transforms.Compose([
            transforms.RandomHorizontalFlip(),
            transforms.RandomRotation(10),
        ]) if is_train else transforms.Compose([])
        self.to_tensor = transforms.Compose([
            transforms.Resize((IMG_SIZE, IMG_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225]),
        ])

    def __len__(self):
        return len(self.image_paths) * 2

    def __getitem__(self, idx):
        real_idx = idx // 2
        is_fake = idx % 2 == 1
        img = Image.open(self.image_paths[real_idx]).convert("RGB")

        if is_fake:
            img = self.sbi.create_sbi(img)
            label = 1.0
        else:
            label = 0.0

        if self.is_train:
            img = self.shared_aug(img)
        tensor = self.to_tensor(img)
        return tensor, torch.tensor(label, dtype=torch.float32)


# ---------------------------------------------------------------
# Training
# ---------------------------------------------------------------

def collect_images(data_dir):
    extensions = {".jpg", ".jpeg", ".png", ".bmp"}
    paths = []
    for root, _, files in os.walk(data_dir):
        for f in files:
            if os.path.splitext(f)[1].lower() in extensions:
                paths.append(os.path.join(root, f))
    return sorted(paths)


def train(args):
    # H23: Set random seeds for reproducibility
    SEED = 42
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)

    print(f"=== EfficientNet-B4 + SBI Training ===")
    print(f"Device: {DEVICE}")
    print(f"Batch size: {args.batch_size}")
    print(f"Epochs: {args.epochs}")
    print(f"Image size: {IMG_SIZE}x{IMG_SIZE}")
    print()

    data_dir = args.data_dir
    if not os.path.isdir(data_dir):
        print(f"Data directory not found: {data_dir}")
        print()
        print("To train, provide real face images:")
        print(f"  1. Place images in: {DEFAULT_DATA_DIR}")
        print(f"  2. Use --data-dir /path/to/face/images")
        print()
        print("Recommended datasets:")
        print("  - FaceForensics++ real faces (original_sequences/youtube/)")
        print("  - CelebA: https://mmlab.ie.cuhk.edu.hk/projects/CelebA.html")
        print("  - FFHQ: https://github.com/NVlabs/ffhq-dataset")
        sys.exit(1)

    image_paths = collect_images(data_dir)
    print(f"Found {len(image_paths)} images in {data_dir}")

    if len(image_paths) < 10:
        print("ERROR: Need at least 10 images to train.")
        sys.exit(1)

    random.shuffle(image_paths)
    val_count = max(1, int(len(image_paths) * VAL_SPLIT))
    val_paths = image_paths[:val_count]
    train_paths = image_paths[val_count:]

    print(f"Train: {len(train_paths)} | Val: {len(val_paths)}")
    print(f"Effective samples: {len(train_paths) * 2} (real + SBI fake)")
    print()

    sbi_aug = SBIAugmentor(img_size=IMG_SIZE)
    train_dataset = SBIDataset(train_paths, sbi_aug, is_train=True)
    val_dataset = SBIDataset(val_paths, sbi_aug, is_train=False)

    train_loader = DataLoader(train_dataset, batch_size=args.batch_size,
                              shuffle=True, num_workers=NUM_WORKERS, drop_last=True)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size,
                            shuffle=False, num_workers=NUM_WORKERS)

    model = EfficientNetDeepfake().to(DEVICE)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"Total params: {total_params:,}")

    # Freeze early layers
    for param in model.net.features[:4].parameters():
        param.requires_grad = False

    # H24: BCEWithLogitsLoss is numerically stable (model outputs logits, not probabilities)
    criterion = nn.BCEWithLogitsLoss()
    optimizer = optim.AdamW(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=args.learning_rate, weight_decay=0.01,
    )
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-6)

    best_val_loss = float('inf')
    patience_counter = 0

    for epoch in range(args.epochs):
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0

        for batch_idx, (images, labels) in enumerate(train_loader):
            images = images.to(DEVICE)
            labels = labels.to(DEVICE).unsqueeze(1)
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            train_loss += loss.item()
            predicted = (outputs > 0.0).float()
            train_correct += (predicted == labels).sum().item()
            train_total += labels.size(0)

            if (batch_idx + 1) % 50 == 0:
                print(f"  Epoch {epoch+1} | Batch {batch_idx+1}/{len(train_loader)} | Loss: {loss.item():.4f}")

        train_acc = train_correct / max(train_total, 1)

        model.eval()
        val_correct = 0
        val_total = 0
        val_loss = 0.0
        with torch.no_grad():
            for images, labels in val_loader:
                images = images.to(DEVICE)
                labels = labels.to(DEVICE).unsqueeze(1)
                outputs = model(images)
                loss = criterion(outputs, labels)
                val_loss += loss.item()
                predicted = (outputs > 0.0).float()
                val_correct += (predicted == labels).sum().item()
                val_total += labels.size(0)

        val_acc = val_correct / max(val_total, 1)
        scheduler.step()

        print(
            f"Epoch {epoch+1}/{args.epochs} | "
            f"Train Loss: {train_loss/max(len(train_loader),1):.4f} Acc: {train_acc:.4f} | "
            f"Val Loss: {val_loss/max(len(val_loader),1):.4f} Acc: {val_acc:.4f} | "
            f"LR: {optimizer.param_groups[0]['lr']:.6f}"
        )

        avg_val_loss = val_loss / max(len(val_loader), 1)
        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            os.makedirs(os.path.dirname(WEIGHTS_OUT), exist_ok=True)
            torch.save({
                "model_state_dict": model.state_dict(),
                "val_loss": avg_val_loss,
                "val_acc": val_acc,
                "epoch": epoch + 1,
                "img_size": IMG_SIZE,
                "architecture": "EfficientNet-B4-SBI",
            }, WEIGHTS_OUT)
            print(f"  -> Saved best (val_loss: {avg_val_loss:.4f}, val_acc: {val_acc:.4f})")
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= 5:
                print(f"\nEarly stopping at epoch {epoch+1}")
                break

        gc.collect()
        if DEVICE == "mps":
            torch.mps.empty_cache()

    print(f"\nBest Val Loss: {best_val_loss:.4f}")
    print(f"Weights saved to: {WEIGHTS_OUT}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train EfficientNet-B4 + SBI")
    parser.add_argument("--data-dir", type=str, default=DEFAULT_DATA_DIR)
    parser.add_argument("--epochs", type=int, default=EPOCHS)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--learning-rate", type=float, default=LEARNING_RATE)
    args = parser.parse_args()
    train(args)
