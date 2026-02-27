import os
import hashlib
import tempfile
import urllib.request
import sys

def verify_checksum(file_path, expected_sha256):
    """Verify SHA256 checksum of a file. Returns True if match or no expected hash."""
    if not expected_sha256:
        return True
    sha256 = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            sha256.update(chunk)
    actual = sha256.hexdigest()
    if actual != expected_sha256:
        print(f"Checksum mismatch: expected {expected_sha256}, got {actual}")
        return False
    return True


def download_mesonet_weights(expected_sha256=None):
    """
    Download pre-trained MesoNet-4 weights
    Original weights from: https://github.com/DariusAf/MesoNet
    """
    weights_dir = os.path.join(os.path.dirname(__file__), 'models')
    os.makedirs(weights_dir, exist_ok=True)

    weights_path = os.path.join(weights_dir, 'mesonet4_weights.h5')

    if os.path.exists(weights_path):
        if expected_sha256 and not verify_checksum(weights_path, expected_sha256):
            print("Existing weights failed checksum — re-downloading.")
            os.remove(weights_path)
        else:
            print(f"Weights already exist at: {weights_path}")
            return True

    print("Downloading MesoNet-4 pre-trained weights...")

    url = "https://github.com/DariusAf/MesoNet/raw/master/weights/Meso4_DF.h5"

    try:
        # Atomic download: write to temp file first, then rename
        fd, tmp_path = tempfile.mkstemp(dir=weights_dir, suffix='.h5.tmp')
        os.close(fd)
        urllib.request.urlretrieve(url, tmp_path)

        if expected_sha256 and not verify_checksum(tmp_path, expected_sha256):
            os.remove(tmp_path)
            print("Downloaded file failed checksum verification.")
            return False

        os.rename(tmp_path, weights_path)
        print(f"Successfully downloaded weights to: {weights_path}")

        file_size = os.path.getsize(weights_path) / (1024 * 1024)
        print(f"File size: {file_size:.2f} MB")
        return True

    except Exception as e:
        # Clean up temp file on failure
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.remove(tmp_path)
        print(f"Error downloading weights: {e}")
        print("\nAlternative: Download manually from:")
        print("https://github.com/DariusAf/MesoNet/tree/master/weights")
        print(f"Save as: {weights_path}")
        return False

if __name__ == "__main__":
    success = download_mesonet_weights()
    sys.exit(0 if success else 1)
