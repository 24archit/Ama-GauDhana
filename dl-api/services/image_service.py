import cv2
import numpy as np
import base64
import requests

def download_image(file_url: str) -> np.ndarray:
    """Helper to download image from a URL (e.g. Cloudinary) into OpenCV format"""
    if not file_url:
        raise ValueError("Image URL is empty.")
    try:
        resp = requests.get(file_url, timeout=15)
        resp.raise_for_status()
        image_bytes = resp.content
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError(f"Decoded image is None for URL: {file_url}")
        return img
    except Exception as e:
        raise ValueError(f"Could not download or decode image from URL {file_url}: {e}")

def encode_crop(crop: np.ndarray) -> str:
    if crop is None or crop.size == 0:
        return None
    _, buffer = cv2.imencode('.jpg', crop)
    b64 = base64.b64encode(buffer).decode('utf-8')
    return f"data:image/jpeg;base64,{b64}"

def extract_crop_from_b64(crop_b64: str) -> np.ndarray:
    if not crop_b64:
        return None
    try:
        if crop_b64.startswith("data:image"):
            crop_b64 = crop_b64.split(",")[1]
        np_arr = np.frombuffer(base64.b64decode(crop_b64), np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        print(f"Error decoding b64 crop: {e}")
        return None
