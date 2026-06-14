import cv2
import numpy as np
from skimage.feature import local_binary_pattern, hog

def get_texture_features(enhanced_img):
    if len(enhanced_img.shape) == 3:
        enhanced_img = cv2.cvtColor(enhanced_img, cv2.COLOR_BGR2GRAY)
        
    # Resize to a fixed dimension to ensure consistent HOG vector lengths
    enhanced_img = cv2.resize(enhanced_img, (256, 256))
        
    # 1. LBP Feature (Setting radius=3, points=24 for a good balance)
    lbp = local_binary_pattern(enhanced_img, P=24, R=3, method="uniform")
    (hist, _) = np.histogram(lbp.ravel(), bins=np.arange(0, 24 + 3), range=(0, 24 + 2))
    lbp_hist = hist.astype("float")
    lbp_hist /= (lbp_hist.sum() + 1e-7) # Normalize

    # 2. HOG Feature
    hog_vec = hog(enhanced_img, orientations=9, pixels_per_cell=(8, 8),
                  cells_per_block=(2, 2), visualize=False)
                  
    return lbp_hist, hog_vec

def get_morphology_features(enhanced_img):
    if len(enhanced_img.shape) == 3:
        enhanced_img = cv2.cvtColor(enhanced_img, cv2.COLOR_BGR2GRAY)
        
    # Adaptive Thresholding to separate beads from grooves
    thresh = cv2.adaptiveThreshold(enhanced_img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                   cv2.THRESH_BINARY_INV, 11, 2)
    
    # Find contours (the beads)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    bead_areas = []
    eccentricities = []
    
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area > 10: # Filter out tiny noise
            bead_areas.append(area)
            if len(cnt) >= 5: # Need 5 points to fit an ellipse
                ellipse = cv2.fitEllipse(cnt)
                (center, axes, orientation) = ellipse
                major_axis, minor_axis = max(axes), min(axes)
                if major_axis > 0:
                    eccentricity = np.sqrt(max(0, 1 - (minor_axis**2 / major_axis**2)))
                    eccentricities.append(eccentricity)
                
    return {
        "bead_count": len(bead_areas),
        "avg_area": float(np.mean(bead_areas)) if bead_areas else 0.0,
        "avg_eccentricity": float(np.mean(eccentricities)) if eccentricities else 0.0
    }