#!/usr/bin/env python
"""
Fine-tune MesoNet-4 for deepfake detection using FaceForensics++ dataset.

Usage:
    python train_mesonet.py

Expects data at:
    data/original_sequences/youtube/c23/videos/     (real videos)
    data/manipulated_sequences/Deepfakes/c23/videos/ (fake videos)

Outputs:
    src/models/mesonet4_weights.h5  (overwrites existing weights)
"""

import os
import gc
import cv2
import numpy as np
import mediapipe as mp
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.utils import Sequence
from src.video_model import create_mesonet4

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REAL_VIDEOS = os.path.join(BASE_DIR, 'data', 'original_sequences', 'youtube', 'c23', 'videos')
FAKE_VIDEOS = os.path.join(BASE_DIR, 'data', 'manipulated_sequences', 'Deepfakes', 'c23', 'videos')
WEIGHTS_OUT = os.path.join(BASE_DIR, 'src', 'models', 'mesonet4_weights.h5')
FACE_CACHE = os.path.join(BASE_DIR, 'data', 'face_cache')

# Training config
FRAMES_PER_VIDEO = 10       # faces to extract per video
IMG_SIZE = 256               # MesoNet-4 input size
BATCH_SIZE = 32
EPOCHS = 30
MAX_VIDEOS = None            # set to int to limit (e.g. 200 for quick test)


def setup_face_detector():
    return mp.solutions.face_detection.FaceDetection(
        model_selection=1,
        min_detection_confidence=0.5
    )


def extract_faces_from_video(video_path, face_detector, num_frames=FRAMES_PER_VIDEO):
    """Extract and crop faces from evenly spaced frames in a video."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total_frames < num_frames:
        indices = list(range(total_frames))
    else:
        indices = np.linspace(0, total_frames - 1, num_frames, dtype=int)

    faces = []
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if not ret:
            continue

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_detector.process(rgb)

        if not results.detections:
            continue

        det = results.detections[0]
        h, w, _ = frame.shape
        box = det.location_data.relative_bounding_box

        # Add padding
        pad = 0.3
        bw, bh = int(box.width * w), int(box.height * h)
        x1 = max(0, int(box.xmin * w) - int(bw * pad))
        y1 = max(0, int(box.ymin * h) - int(bh * pad))
        x2 = min(w, int(box.xmin * w) + bw + int(bw * pad))
        y2 = min(h, int(box.ymin * h) + bh + int(bh * pad))

        face = frame[y1:y2, x1:x2]
        if face.size == 0:
            continue

        face = cv2.resize(face, (IMG_SIZE, IMG_SIZE))
        face = cv2.cvtColor(face, cv2.COLOR_BGR2RGB)
        faces.append(face)

    cap.release()
    return faces


def extract_and_save_faces():
    """Extract faces from videos and save as individual .npy files to avoid OOM."""
    os.makedirs(FACE_CACHE, exist_ok=True)
    labels_file = os.path.join(FACE_CACHE, 'labels.npy')

    # Check if already cached
    if os.path.exists(labels_file):
        labels = np.load(labels_file)
        count = len(labels)
        print(f'Found {count} cached faces ({np.sum(labels==0)} real, {np.sum(labels==1)} fake)')
        return count

    print('Extracting faces from videos (saved individually to avoid OOM)...')
    face_detector = setup_face_detector()
    labels = []
    face_idx = 0

    # Real videos (label = 0)
    real_files = sorted([f for f in os.listdir(REAL_VIDEOS) if f.endswith('.mp4')])
    if MAX_VIDEOS:
        real_files = real_files[:MAX_VIDEOS]
    print(f'Processing {len(real_files)} real videos...')
    for i, fname in enumerate(real_files):
        if (i + 1) % 50 == 0:
            print(f'  Real: {i+1}/{len(real_files)}')
        faces = extract_faces_from_video(os.path.join(REAL_VIDEOS, fname), face_detector)
        for face in faces:
            np.save(os.path.join(FACE_CACHE, f'{face_idx}.npy'), face.astype(np.uint8))
            labels.append(0)
            face_idx += 1
        del faces
        gc.collect()

    # Fake videos (label = 1)
    fake_files = sorted([f for f in os.listdir(FAKE_VIDEOS) if f.endswith('.mp4')])
    if MAX_VIDEOS:
        fake_files = fake_files[:MAX_VIDEOS]
    print(f'Processing {len(fake_files)} fake videos...')
    for i, fname in enumerate(fake_files):
        if (i + 1) % 50 == 0:
            print(f'  Fake: {i+1}/{len(fake_files)}')
        faces = extract_faces_from_video(os.path.join(FAKE_VIDEOS, fname), face_detector)
        for face in faces:
            np.save(os.path.join(FACE_CACHE, f'{face_idx}.npy'), face.astype(np.uint8))
            labels.append(1)
            face_idx += 1
        del faces
        gc.collect()

    labels = np.array(labels, dtype=np.float32)
    np.save(labels_file, labels)
    print(f'Saved {face_idx} faces to {FACE_CACHE}')
    return face_idx


class FaceDataGenerator(Sequence):
    """Keras generator that loads faces from disk in batches to save RAM."""
    def __init__(self, indices, labels, batch_size=BATCH_SIZE, shuffle=True):
        self.indices = indices
        self.labels = labels
        self.batch_size = batch_size
        self.shuffle = shuffle
        self.on_epoch_end()

    def __len__(self):
        return int(np.ceil(len(self.indices) / self.batch_size))

    def __getitem__(self, idx):
        batch_indices = self.indices[idx * self.batch_size:(idx + 1) * self.batch_size]
        X = np.zeros((len(batch_indices), IMG_SIZE, IMG_SIZE, 3), dtype=np.float32)
        y = np.zeros(len(batch_indices), dtype=np.float32)

        for i, face_idx in enumerate(batch_indices):
            face = np.load(os.path.join(FACE_CACHE, f'{face_idx}.npy'))
            X[i] = face.astype(np.float32) / 255.0
            y[i] = self.labels[face_idx]

        return X, y

    def on_epoch_end(self):
        if self.shuffle:
            np.random.shuffle(self.indices)


def train():
    print('=== MesoNet-4 Fine-Tuning ===\n')

    # Extract faces (or load from cache)
    total_faces = extract_and_save_faces()
    labels = np.load(os.path.join(FACE_CACHE, 'labels.npy'))

    print(f'\nTotal faces: {total_faces} (real: {int(np.sum(labels==0))}, fake: {int(np.sum(labels==1))})')

    # Split indices: 80% train, 10% val, 10% test
    all_indices = np.arange(total_faces)
    np.random.seed(42)
    np.random.shuffle(all_indices)

    n_train = int(total_faces * 0.8)
    n_val = int(total_faces * 0.1)

    train_idx = all_indices[:n_train]
    val_idx = all_indices[n_train:n_train + n_val]
    test_idx = all_indices[n_train + n_val:]

    print(f'Train: {len(train_idx)} | Val: {len(val_idx)} | Test: {len(test_idx)}\n')

    # Create generators
    train_gen = FaceDataGenerator(train_idx, labels, shuffle=True)
    val_gen = FaceDataGenerator(val_idx, labels, shuffle=False)

    # Build model
    model = create_mesonet4()

    # Load existing weights as starting point
    existing_weights = os.path.join(BASE_DIR, 'src', 'models', 'mesonet4_weights.h5')
    if os.path.exists(existing_weights):
        model.load_weights(existing_weights)
        print('Loaded existing weights as starting point for fine-tuning')

    model.compile(
        optimizer=Adam(learning_rate=0.0001),
        loss='binary_crossentropy',
        metrics=['accuracy']
    )

    model.summary()

    # Callbacks
    callbacks = [
        EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True),
        ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=3, min_lr=1e-6),
        ModelCheckpoint(WEIGHTS_OUT, monitor='val_accuracy', save_best_only=True, save_weights_only=True)
    ]

    # Train
    print('\nStarting training...\n')
    model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=EPOCHS,
        callbacks=callbacks
    )

    # Evaluate on test set
    print('\n=== Test Set Evaluation ===')
    test_gen = FaceDataGenerator(test_idx, labels, shuffle=False)
    test_loss, test_acc = model.evaluate(test_gen, verbose=0)
    print(f'Test Loss: {test_loss:.4f}')
    print(f'Test Accuracy: {test_acc:.4f}')

    # Per-class accuracy
    predictions = (model.predict(test_gen, verbose=0) > 0.5).astype(int).flatten()
    test_labels = np.array([labels[i] for i in test_idx])
    real_mask = test_labels == 0
    fake_mask = test_labels == 1
    print(f'Real Accuracy: {np.mean(predictions[real_mask] == 0):.4f}')
    print(f'Fake Accuracy: {np.mean(predictions[fake_mask] == 1):.4f}')

    print(f'\nWeights saved to: {WEIGHTS_OUT}')


if __name__ == '__main__':
    train()
