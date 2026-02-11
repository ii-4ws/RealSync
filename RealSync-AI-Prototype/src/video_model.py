import cv2
import numpy as np
import os
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Input, Conv2D, BatchNormalization, MaxPooling2D
from tensorflow.keras.layers import Flatten, Dense, Dropout

def create_mesonet4():
    """
    MesoNet-4 architecture for deepfake detection
    Input: 256x256x3 RGB image
    Output: Binary classification (0=real, 1=fake)
    """
    input_layer = Input(shape=(256, 256, 3))

    x = Conv2D(8, (3, 3), padding='same', activation='relu')(input_layer)
    x = BatchNormalization()(x)
    x = MaxPooling2D(pool_size=(2, 2), padding='same')(x)

    x = Conv2D(8, (5, 5), padding='same', activation='relu')(x)
    x = BatchNormalization()(x)
    x = MaxPooling2D(pool_size=(2, 2), padding='same')(x)

    x = Conv2D(16, (5, 5), padding='same', activation='relu')(x)
    x = BatchNormalization()(x)
    x = MaxPooling2D(pool_size=(2, 2), padding='same')(x)

    x = Conv2D(16, (5, 5), padding='same', activation='relu')(x)
    x = BatchNormalization()(x)
    x = MaxPooling2D(pool_size=(4, 4), padding='same')(x)

    x = Flatten()(x)
    x = Dropout(0.5)(x)
    x = Dense(16, activation='relu')(x)
    x = Dropout(0.5)(x)
    output = Dense(1, activation='sigmoid')(x)

    model = Model(inputs=input_layer, outputs=output)
    return model

# Initialize model globally
_model = None

def get_model():
    """Load or return cached MesoNet-4 model"""
    global _model
    if _model is None:
        _model = create_mesonet4()
        try:
            weights_path = os.path.join(os.path.dirname(__file__), 'models', 'mesonet4_weights.h5')
            if os.path.exists(weights_path):
                _model.load_weights(weights_path)
                print(f"Loaded MesoNet-4 weights from {weights_path}")
            else:
                print("Warning: Pre-trained weights not found. Using untrained model.")
                print(f"Expected weights at: {weights_path}")
        except Exception as e:
            print(f"Error loading weights: {e}")
    return _model

def preprocess_face(face_path):
    """
    Preprocess face image for MesoNet-4
    Returns normalized 256x256 RGB image
    """
    img = cv2.imread(face_path)
    if img is None:
        return None

    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (256, 256))
    img = img.astype(np.float32) / 255.0

    return img

def video_deepfake_score(face_dir):
    """
    Analyze extracted faces for deepfake detection
    Returns average deepfake confidence score (0-1)
    0 = likely real, 1 = likely fake
    """
    faces = [f for f in os.listdir(face_dir) if f.endswith(('.jpg', '.jpeg', '.png'))]

    if len(faces) == 0:
        return 0.0

    model = get_model()
    scores = []

    for face_file in faces:
        face_path = os.path.join(face_dir, face_file)
        face_img = preprocess_face(face_path)

        if face_img is None:
            continue

        face_batch = np.expand_dims(face_img, axis=0)

        prediction = model.predict(face_batch, verbose=0)[0][0]
        scores.append(float(prediction))

    if len(scores) == 0:
        return 0.0

    return float(np.mean(scores))
