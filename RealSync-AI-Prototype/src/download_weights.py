import os
import urllib.request
import sys

def download_mesonet_weights():
    """
    Download pre-trained MesoNet-4 weights
    Original weights from: https://github.com/DariusAf/MesoNet
    """
    weights_dir = os.path.join(os.path.dirname(__file__), 'models')
    os.makedirs(weights_dir, exist_ok=True)

    weights_path = os.path.join(weights_dir, 'mesonet4_weights.h5')

    if os.path.exists(weights_path):
        print(f"Weights already exist at: {weights_path}")
        return True

    print("Downloading MesoNet-4 pre-trained weights...")

    url = "https://github.com/DariusAf/MesoNet/raw/master/weights/Meso4_DF.h5"

    try:
        urllib.request.urlretrieve(url, weights_path)
        print(f"Successfully downloaded weights to: {weights_path}")

        file_size = os.path.getsize(weights_path) / (1024 * 1024)
        print(f"File size: {file_size:.2f} MB")
        return True

    except Exception as e:
        print(f"Error downloading weights: {e}")
        print("\nAlternative: Download manually from:")
        print("https://github.com/DariusAf/MesoNet/tree/master/weights")
        print(f"Save as: {weights_path}")
        return False

if __name__ == "__main__":
    success = download_mesonet_weights()
    sys.exit(0 if success else 1)
