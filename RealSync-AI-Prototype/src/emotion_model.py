from fer import FER
import cv2
import os
import numpy as np

detector = FER(mtcnn=True)

def emotion_score(face_dir):
    scores = []
    processed = 0
    errors = 0

    for img_name in sorted(os.listdir(face_dir)):
        # Skip non-image files
        if not img_name.endswith(('.jpg', '.jpeg', '.png')):
            continue

        img_path = os.path.join(face_dir, img_name)
        img = cv2.imread(img_path)

        # Skip if image failed to load
        if img is None:
            errors += 1
            continue

        try:
            emotions = detector.detect_emotions(img)

            if emotions and len(emotions) > 0:
                # Get the highest emotion score
                max_emotion = max(emotions[0]["emotions"].values())
                scores.append(max_emotion)
                processed += 1

        except Exception as e:
            errors += 1
            continue

    print(f"Emotion analysis: processed {processed} faces, {errors} errors")
    return float(np.mean(scores)) if scores else 0.0
