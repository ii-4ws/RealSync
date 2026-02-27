import cv2
import os

def extract_frames(video_path, output_dir, fps=1):
    os.makedirs(output_dir, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    try:
        if not cap.isOpened():
            print(f"[extract_frames] Failed to open video: {video_path}")
            return

        video_fps = cap.get(cv2.CAP_PROP_FPS)
        if video_fps <= 0:
            print(f"[extract_frames] Invalid video FPS ({video_fps}) for: {video_path}")
            return

        frame_interval = int(video_fps / fps)
        count = 0
        saved = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if count % frame_interval == 0:
                cv2.imwrite(f"{output_dir}/frame_{saved}.jpg", frame)
                saved += 1

            count += 1
    finally:
        cap.release()
