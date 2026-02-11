# RealSync Demo – End‑to‑End Guide

This README explains **exactly** how to set up, run, and understand what happens in the RealSync demo pipeline.

The project does **three main things**:
1. Extract frames + detect ALL faces from a video (multi-person support)
2. Extract and chunk audio from the same video
3. Analyze faces and audio and output **final scores** in JSON

No prior setup is assumed.

---

## 1. Project Overview

Input:
- A single video file (e.g. `meeting.mp4`)

Pipeline:
1. **Frame extraction** from video (1 FPS)
2. **Multi-person face detection & cropping** from frames
3. **Audio extraction & chunking** (5-second chunks)
4. **Face emotion analysis** (pre‑trained FER model)
5. **Video deepfake scoring** (MesoNet-4 CNN model)
6. **Final score aggregation**

Output:
- Video frames (182 frames for typical meeting video)
- Cropped face images (500+ faces for multi-person meeting)
- Audio chunks (36 chunks for ~3 min video)
- `results.json` containing all scores

---

## 2. Final Folder Structure

The project structure:

```
realsync_demo/
│
├─ input/
│  └─ meeting.mp4            # Your video goes here
│
├─ output/
│  ├─ frames/                # Extracted video frames
│  ├─ faces/                 # Cropped detected faces (ALL people)
│  ├─ audio/                 # Chunked audio files
│  └─ results.json           # Final scores (auto‑generated)
│
├─ src/
│  ├─ run_pipeline.py        # Main pipeline script (RUN THIS)
│  ├─ extract_frames.py      # Frame extraction
│  ├─ face_detection.py      # Multi-person face detection
│  ├─ audio_extract.py       # Audio chunking
│  ├─ video_model.py         # Deepfake detection (MesoNet-4)
│  ├─ emotion_model.py       # Emotion analysis
│  ├─ download_weights.py    # Download pre-trained weights
│  └─ models/
│     └─ mesonet4_weights.h5 # MesoNet-4 pre-trained weights
│
├─ requirements.txt
└─ README.md
```

**WARNING: Do NOT manually create `results.json`** — it will be created by the code.

---

## 3. Python Environment Setup

### For macOS (M1/M2/M3):

```bash
cd /path/to/realsync_demo
pip install --upgrade pip
pip install -r requirements.txt
```

### For Windows:

```powershell
cd C:\realsync_demo
python -m venv venv
venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

---

## 4. Install Dependencies

**WARNING:** This project installs **TensorFlow + PyTorch** (very large).

**Requirements:**
- At least **15–20 GB free disk space**
- Avoid OneDrive/cloud folders
- Python 3.11 recommended

**Known Compatibility Notes:**
- Uses `numpy==1.26.4` for compatibility
- Uses `tensorflow` for MesoNet-4 deepfake detection
- Uses `mediapipe==0.10.9` for legacy face detection API
- Uses `fer==22.5.1` for emotion recognition

If you encounter dependency conflicts:
```bash
pip install "numpy==1.26.4" "scipy>=1.11,<1.15" --force-reinstall
pip install "tensorflow==2.15.0" "mediapipe==0.10.9" --force-reinstall
pip install "fer==22.5.1" --force-reinstall
```

---

## 5. Download Pre-trained Weights

The MesoNet-4 model requires pre-trained weights for accurate deepfake detection.

**Option 1: Automatic Download (Recommended)**

```bash
python src/download_weights.py
```

This will download the pre-trained weights (~0.15 MB) from the official MesoNet repository.

**Option 2: Manual Download**

If automatic download fails:
1. Download from: https://github.com/DariusAf/MesoNet/raw/master/weights/Meso4_DF.h5
2. Save as: `src/models/mesonet4_weights.h5`

**Verification:**

The weights will be automatically loaded when you run the pipeline. You'll see:
```
Loaded MesoNet-4 weights from /path/to/src/models/mesonet4_weights.h5
```

---

## 6. Running the Pipeline

### Step 1: Place your video

Put your video in the input folder and name it `meeting.mp4`:

```bash
input/meeting.mp4
```

Or edit `src/run_pipeline.py` line 12 to match your video filename.

---

### Step 2: Run the complete pipeline

**Single command to run everything:**

```bash
python src/run_pipeline.py
```

This will automatically:
1. Extract frames (1 per second)
2. Detect and crop ALL faces from each frame
3. Extract and chunk audio
4. Analyze emotions
5. Calculate deepfake scores
6. Generate `results.json`

**Expected output:**
```
Detected and saved 504 faces from 183 frames
Loaded MesoNet-4 weights from /path/to/src/models/mesonet4_weights.h5
Emotion analysis: processed 500 faces, 0 errors
{'video_score': 0.14, 'emotion_score': 0.5, 'audio_score': 0.0, 'trust_score': 0.78}
```

---

### Step 3: Clean output before re-running

**IMPORTANT:** The pipeline does NOT automatically delete old files. Before running again:

```bash
rm -f output/frames/* output/faces/* output/audio/* output/results.json
```

**Why?** If your new video produces fewer frames/faces, leftover old files will contaminate results.

---

## 7. Face Detection Features

### Multi-Person Detection

The pipeline detects **ALL individuals** in each frame:

- Uses MediaPipe with `model_selection=1` (optimized for video meetings)
- Minimum confidence threshold: 0.5
- Adds 30% padding around faces
- Resizes all faces to 224×224 pixels
- Handles 4-5+ people per frame

### File Naming Convention

Cropped faces are saved as:

```
frame_{N}_person{P}_conf{C}.jpg
```

Examples:
- `frame_0_person0_conf88.jpg` → Frame 0, Person 0, 88% confidence
- `frame_0_person1_conf69.jpg` → Frame 0, Person 1, 69% confidence
- `frame_100_person4_conf75.jpg` → Frame 100, Person 4, 75% confidence

### Typical Output

For a 3-minute meeting video with 4 people:
- **182 frames** extracted (1 FPS)
- **504 face images** detected (avg ~3 people per frame)
- **36 audio chunks** (5-second chunks)

---

## 8. Output: results.json

The pipeline generates a JSON file with analysis scores:

```json
{
  "video_score": 0.14,
  "emotion_score": 0.5,
  "audio_score": 0.0,
  "trust_score": 0.78
}
```

### Score Meanings:

- **video_score** (0-1): Deepfake probability score
  - Generated by MesoNet-4 CNN model (pre-trained on FaceForensics++)
  - 0.0-0.3: Likely REAL video
  - 0.3-0.7: Uncertain
  - 0.7-1.0: Likely FAKE video
  - Expected accuracy: 88-94% on standard benchmarks

- **emotion_score** (0-1): Average emotion intensity
  - Calculated from FER (Facial Emotion Recognition) model
  - Higher = stronger emotions detected

- **audio_score** (0-1): Audio authenticity score
  - Current: placeholder (always 0.0)
  - Future: voice cloning detection

- **trust_score** (0-1): Overall trustworthiness
  - Formula: `1 - (0.5×video + 0.3×emotion + 0.2×audio)`
  - Higher = more trustworthy (less likely deepfake)
  - 50% weight on video, 30% emotion, 20% audio

---

## 9. Common Mistakes (IMPORTANT)

**Not cleaning old output files before re-running**
- Old faces/frames will mix with new results
- Always delete output files before running again

**Using wrong video filename**
- Default expects `meeting.mp4`
- Edit `src/run_pipeline.py` line 12 if different

**Running with incompatible dependencies**
- Follow the exact version requirements
- Use Python 3.11 if possible

**Insufficient disk space**
- TensorFlow + PyTorch require 15-20 GB
- Check before installing

---

## 10. If Something Fails

### Error: "Image not valid" during emotion analysis
- Some faces may be too small/corrupted
- Pipeline skips these automatically
- Check error count in output

### Error: "numpy.core.multiarray failed to import"
- Incompatible numpy version
- Run: `pip install "numpy==1.26.4" --force-reinstall`

### Error: "module 'mediapipe' has no attribute 'solutions'"
- Wrong MediaPipe version
- Run: `pip install "mediapipe==0.10.9" --force-reinstall`

### Warning: "Pre-trained weights not found"
- MesoNet-4 weights are missing
- Run: `python src/download_weights.py`
- Or download manually from https://github.com/DariusAf/MesoNet/raw/master/weights/Meso4_DF.h5
- Save as: `src/models/mesonet4_weights.h5`

### Only detecting 4 faces instead of 504
- You're using old code
- The updated `face_detection.py` uses:
  - `model_selection=1` for better distance detection
  - 30% padding for proper cropping
  - Confidence filtering (min 0.5)

---

## 11. What You Have After Finishing

- End-to-end multimodal pipeline
- Multi-person face detection (all participants)
- Pre-trained MesoNet-4 deepfake detection model (88-94% accuracy)
- Pre-trained emotion recognition model
- Structured outputs ready for analysis
- Consistent face crops (224x224 pixels)
- Clean separation of concerns (modular code)
- Lightweight model suitable for CPU inference

---

## 12. Technical Details

### Face Detection Pipeline

1. **Frame Extraction** (`extract_frames.py`)
   - Extracts 1 frame per second
   - Saves as `frame_N.jpg`

2. **Face Detection** (`face_detection.py`)
   - MediaPipe Face Detection (model_selection=1)
   - Detects ALL people in frame
   - Adds 30% padding around face
   - Boundary checking prevents crop errors
   - Resizes to 224×224 for consistency
   - Confidence threshold: 0.5

3. **Deepfake Detection** (`video_model.py`)
   - MesoNet-4 CNN architecture (4 convolutional layers)
   - Pre-trained on FaceForensics++ dataset
   - Input: 256x256 RGB face images
   - Output: Binary classification (0=real, 1=fake)
   - Model size: ~0.15 MB (lightweight)
   - Processes all extracted faces and returns average score

4. **Emotion Analysis** (`emotion_model.py`)
   - FER (Facial Emotion Recognition) library
   - Uses MTCNN for pre-processing
   - Detects: happy, sad, angry, fear, disgust, surprise, neutral
   - Returns max emotion score per face

5. **Audio Processing** (`audio_extract.py`)
   - Extracts audio track from video
   - Splits into 5-second chunks
   - Saves as WAV files

6. **Scoring** (`run_pipeline.py`)
   - Aggregates all scores
   - Calculates trust metric
   - Saves to `results.json`

---

## 13. Future Enhancements

Potential improvements:
- GPU acceleration (CUDA support)
- Upgrade to heavier models (XceptionNet, EfficientNet-B0) for higher accuracy
- Audio deepfake detection (voice cloning detection)
- Face tracking across frames (person identity consistency)
- Batch processing for multiple videos
- REST API for integration
- Real-time video stream processing
- Fine-tuning MesoNet-4 on custom datasets

---

---

You are now done with the complete pipeline setup.
