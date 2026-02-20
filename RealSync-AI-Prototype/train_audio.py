#!/usr/bin/env python
"""
Train an audio deepfake detection model using ASVspoof 2019 LA dataset.

Usage:
    python train_audio.py

Expects data at:
    data/ASVspoof2019_LA/

Outputs:
    src/models/audio_deepfake_weights.pth

The model converts audio to mel spectrograms and classifies them
as bonafide (real) or spoof (fake) using a lightweight CNN.
"""

import os
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
import torchaudio.transforms as T
import soundfile as sf
from sklearn.metrics import accuracy_score, classification_report

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data', 'ASVspoof2019_LA')
TRAIN_AUDIO = os.path.join(DATA_DIR, 'ASVspoof2019_LA_train', 'flac')
DEV_AUDIO = os.path.join(DATA_DIR, 'ASVspoof2019_LA_dev', 'flac')
TRAIN_PROTOCOL = os.path.join(DATA_DIR, 'ASVspoof2019_LA_cm_protocols', 'ASVspoof2019.LA.cm.train.trn.txt')
DEV_PROTOCOL = os.path.join(DATA_DIR, 'ASVspoof2019_LA_cm_protocols', 'ASVspoof2019.LA.cm.dev.trl.txt')
WEIGHTS_OUT = os.path.join(BASE_DIR, 'src', 'models', 'audio_deepfake_weights.pth')

# Training config
SAMPLE_RATE = 16000
N_MELS = 64
MAX_DURATION_SEC = 4         # truncate/pad audio to this length
BATCH_SIZE = 64
EPOCHS = 20
LEARNING_RATE = 0.001
DEVICE = 'mps' if torch.backends.mps.is_available() else 'cpu'


def parse_protocol(protocol_path):
    """Parse ASVspoof protocol file. Returns list of (filename, label)."""
    entries = []
    with open(protocol_path, 'r') as f:
        for line in f:
            parts = line.strip().split()
            # Format: speaker_id filename - - bonafide/spoof
            filename = parts[1]
            label = 0 if parts[4] == 'bonafide' else 1
            entries.append((filename, label))
    return entries


class ASVspoofDataset(Dataset):
    def __init__(self, audio_dir, protocol_path):
        self.audio_dir = audio_dir
        self.entries = parse_protocol(protocol_path)
        self.max_samples = MAX_DURATION_SEC * SAMPLE_RATE

        self.mel_transform = T.MelSpectrogram(
            sample_rate=SAMPLE_RATE,
            n_fft=1024,
            hop_length=512,
            n_mels=N_MELS
        )
        self.amplitude_to_db = T.AmplitudeToDB()

    def __len__(self):
        return len(self.entries)

    def __getitem__(self, idx):
        filename, label = self.entries[idx]
        audio_path = os.path.join(self.audio_dir, filename + '.flac')

        data, sr = sf.read(audio_path)
        # Convert to tensor: soundfile returns (samples,) or (samples, channels)
        if data.ndim == 1:
            waveform = torch.tensor(data, dtype=torch.float32).unsqueeze(0)
        else:
            waveform = torch.tensor(data.T, dtype=torch.float32)
            waveform = waveform.mean(dim=0, keepdim=True)

        # Resample if needed
        if sr != SAMPLE_RATE:
            resampler = T.Resample(sr, SAMPLE_RATE)
            waveform = resampler(waveform)

        # Pad or truncate to fixed length
        if waveform.shape[1] > self.max_samples:
            waveform = waveform[:, :self.max_samples]
        else:
            padding = self.max_samples - waveform.shape[1]
            waveform = torch.nn.functional.pad(waveform, (0, padding))

        # Convert to mel spectrogram
        mel = self.mel_transform(waveform)
        mel = self.amplitude_to_db(mel)

        return mel, torch.tensor(label, dtype=torch.float32)


class AudioDeepfakeNet(nn.Module):
    """Lightweight CNN for audio deepfake detection on mel spectrograms."""
    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 16, 3, padding=1),
            nn.BatchNorm2d(16),
            nn.ReLU(),
            nn.MaxPool2d(2),

            nn.Conv2d(16, 32, 3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.MaxPool2d(2),

            nn.Conv2d(32, 64, 3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.MaxPool2d(2),

            nn.Conv2d(64, 64, 3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.MaxPool2d(2),
        )
        self.global_pool = nn.AdaptiveAvgPool2d((1, 1))
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.5),
            nn.Linear(64, 64),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(64, 1),
            nn.Sigmoid()
        )

    def forward(self, x):
        x = self.features(x)
        x = self.global_pool(x.cpu()).to(x.device) if x.device.type == 'mps' else self.global_pool(x)
        x = self.classifier(x)
        return x


def get_weighted_sampler(dataset):
    """Create a weighted sampler to handle class imbalance (2580 real vs 22800 spoof)."""
    labels = [entry[1] for entry in dataset.entries]
    class_counts = np.bincount(labels)
    weights = 1.0 / class_counts
    sample_weights = [weights[label] for label in labels]
    return WeightedRandomSampler(sample_weights, len(sample_weights))


def train():
    print(f'=== Audio Deepfake Training ===')
    print(f'Device: {DEVICE}\n')

    # Datasets
    print('Loading training data...')
    train_dataset = ASVspoofDataset(TRAIN_AUDIO, TRAIN_PROTOCOL)
    print(f'Train samples: {len(train_dataset)}')

    print('Loading validation data...')
    dev_dataset = ASVspoofDataset(DEV_AUDIO, DEV_PROTOCOL)
    print(f'Val samples: {len(dev_dataset)}')

    # Weighted sampler for imbalanced classes
    sampler = get_weighted_sampler(train_dataset)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, sampler=sampler, num_workers=2)
    dev_loader = DataLoader(dev_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)

    # Model
    model = AudioDeepfakeNet().to(DEVICE)
    total_params = sum(p.numel() for p in model.parameters())
    print(f'Model parameters: {total_params:,}\n')

    criterion = nn.BCELoss()
    optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=3, factor=0.5)

    best_val_acc = 0.0

    for epoch in range(EPOCHS):
        # Train
        model.train()
        train_loss = 0.0
        train_preds, train_labels = [], []

        for batch_idx, (mel, labels) in enumerate(train_loader):
            mel, labels = mel.to(DEVICE), labels.to(DEVICE)

            optimizer.zero_grad()
            outputs = model(mel).squeeze()
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

            train_loss += loss.item()
            preds = (outputs > 0.5).float()
            train_preds.extend(preds.cpu().numpy())
            train_labels.extend(labels.cpu().numpy())

            if (batch_idx + 1) % 50 == 0:
                print(f'  Epoch {epoch+1} | Batch {batch_idx+1}/{len(train_loader)} | Loss: {loss.item():.4f}')

        train_acc = accuracy_score(train_labels, train_preds)
        avg_train_loss = train_loss / len(train_loader)

        # Validate
        model.eval()
        val_preds, val_labels = [], []
        val_loss = 0.0

        with torch.no_grad():
            for mel, labels in dev_loader:
                mel, labels = mel.to(DEVICE), labels.to(DEVICE)
                outputs = model(mel).squeeze()
                loss = criterion(outputs, labels)
                val_loss += loss.item()
                preds = (outputs > 0.5).float()
                val_preds.extend(preds.cpu().numpy())
                val_labels.extend(labels.cpu().numpy())

        val_acc = accuracy_score(val_labels, val_preds)
        avg_val_loss = val_loss / len(dev_loader)
        scheduler.step(avg_val_loss)

        print(f'Epoch {epoch+1}/{EPOCHS} | '
              f'Train Loss: {avg_train_loss:.4f} Acc: {train_acc:.4f} | '
              f'Val Loss: {avg_val_loss:.4f} Acc: {val_acc:.4f}')

        # Save best model
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), WEIGHTS_OUT)
            print(f'  Saved best model (val_acc: {val_acc:.4f})')

    # Final evaluation
    print(f'\n=== Final Evaluation ===')
    model.load_state_dict(torch.load(WEIGHTS_OUT, weights_only=True))
    model.eval()

    val_preds, val_labels = [], []
    with torch.no_grad():
        for mel, labels in dev_loader:
            mel, labels = mel.to(DEVICE), labels.to(DEVICE)
            outputs = model(mel).squeeze()
            preds = (outputs > 0.5).float()
            val_preds.extend(preds.cpu().numpy())
            val_labels.extend(labels.cpu().numpy())

    print(classification_report(val_labels, val_preds, target_names=['bonafide', 'spoof']))
    print(f'Best Val Accuracy: {best_val_acc:.4f}')
    print(f'Weights saved to: {WEIGHTS_OUT}')


if __name__ == '__main__':
    train()
