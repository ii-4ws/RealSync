import os
import json

from extract_frames import extract_frames
from face_detection import detect_faces
from audio_extract import extract_audio_chunks
from video_model import video_deepfake_score
from emotion_model import emotion_score

BASE = os.path.dirname(os.path.dirname(__file__))

input_video = f"{BASE}/input/meeting.mp4"
frames = f"{BASE}/output/frames"
faces = f"{BASE}/output/faces"
audio = f"{BASE}/output/audio"

extract_frames(input_video, frames)
detect_faces(frames, faces)
extract_audio_chunks(input_video, audio)

video_score = video_deepfake_score(faces)
emotion = emotion_score(faces)
audio_score = 0.0  # demo placeholder

trust = round(1 - (0.5*video_score + 0.3*emotion + 0.2*audio_score), 2)

results = {
    "video_score": round(video_score, 2),
    "emotion_score": round(emotion, 2),
    "audio_score": audio_score,
    "trust_score": trust
}

with open(f"{BASE}/output/results.json", "w") as f:
    json.dump(results, f, indent=2)

print(results)
