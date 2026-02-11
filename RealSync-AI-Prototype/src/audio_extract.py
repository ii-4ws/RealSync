from moviepy.editor import VideoFileClip
import os

def extract_audio_chunks(video_path, output_dir, chunk_sec=5):
    os.makedirs(output_dir, exist_ok=True)

    video = VideoFileClip(video_path)
    audio = video.audio
    duration = int(audio.duration)

    for i in range(0, duration, chunk_sec):
        audio.subclip(i, min(i+chunk_sec, duration)) \
             .write_audiofile(f"{output_dir}/audio_{i}.wav", logger=None)
