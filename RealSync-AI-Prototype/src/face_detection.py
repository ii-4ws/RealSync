import cv2
import os
import mediapipe as mp

# Use model_selection=1 for better detection at longer distances (video meetings)
mp_face = mp.solutions.face_detection.FaceDetection(
    model_selection=1,
    min_detection_confidence=0.5
)

def detect_faces(frame_dir, output_dir, padding_percent=0.3):
    """
    Detect and crop faces from video frames.

    Args:
        frame_dir: Directory containing video frames
        output_dir: Directory to save cropped faces
        padding_percent: Percentage of face size to add as padding (0.3 = 30%)
    """
    os.makedirs(output_dir, exist_ok=True)

    face_count = 0

    for img_name in sorted(os.listdir(frame_dir)):
        if not img_name.endswith(('.jpg', '.jpeg', '.png')):
            continue

        img_path = os.path.join(frame_dir, img_name)
        img = cv2.imread(img_path)

        if img is None:
            continue

        h, w, _ = img.shape
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        results = mp_face.process(rgb)

        if not results.detections:
            continue

        # Process each detected face
        for i, det in enumerate(results.detections):
            # Get detection confidence
            confidence = det.score[0]

            # Skip low confidence detections
            if confidence < 0.5:
                continue

            box = det.location_data.relative_bounding_box

            # Convert relative coordinates to absolute pixels
            x = int(box.xmin * w)
            y = int(box.ymin * h)
            bw = int(box.width * w)
            bh = int(box.height * h)

            # Add padding around the face
            pad_w = int(bw * padding_percent)
            pad_h = int(bh * padding_percent)

            # Calculate padded coordinates
            x1 = max(0, x - pad_w)
            y1 = max(0, y - pad_h)
            x2 = min(w, x + bw + pad_w)
            y2 = min(h, y + bh + pad_h)

            # Crop the face with padding
            face = img[y1:y2, x1:x2]

            # Skip if crop is invalid
            if face.size == 0 or face.shape[0] < 20 or face.shape[1] < 20:
                continue

            # Resize face to consistent size for better model performance
            face_resized = cv2.resize(face, (224, 224))

            # Save with unique filename
            base_name = os.path.splitext(img_name)[0]
            output_path = f"{output_dir}/{base_name}_person{i}_conf{int(confidence*100)}.jpg"
            cv2.imwrite(output_path, face_resized)

            face_count += 1

    print(f"Detected and saved {face_count} faces from {len(os.listdir(frame_dir))} frames")
