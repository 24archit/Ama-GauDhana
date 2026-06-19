/**
 * Resizes a base64 image (data URL) to a target maximum dimension while maintaining aspect ratio.
 * @param base64Str - The original base64 image string.
 * @param maxWidth - The maximum width (or height if landscape).
 * @param quality - The output quality (0 to 1).
 * @returns A promise that resolves to the resized base64 image string.
 */
import { API_BASE } from '@gonidhi/shared';

/**
 * Injects Cloudinary optimization parameters (f_auto, q_auto, width) into a raw Cloudinary upload URL.
 * Falls back to returning the original URL if it is not a recognizable Cloudinary upload URL.
 */
export const optimizeCloudinaryUrl = (url: string, width: number = 500): string => {
    if (!url) return url;
    
    // Only process cloudinary URLs that don't already have transformations
    const cloudinaryPattern = /res\.cloudinary\.com\/.*\/image\/upload\/(v\d+\/.*)$/;
    const match = url.match(cloudinaryPattern);
    
    if (match) {
        // If it matches a raw upload URL, insert the optimization flags
        return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`);
    }
    
    return url;
};

export const resizeImage = (base64Str: string, maxWidth: number = 1080, quality: number = 0.85): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        let canvas: HTMLCanvasElement | null = null;

        const cleanup = () => {
            if (canvas) {
                canvas.width = 0;
                canvas.height = 0;
                canvas = null;
            }
            img.src = '';
            img.onload = null;
            img.onerror = null;
        };

        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxWidth) {
                    width = Math.round((width * maxWidth) / height);
                    height = maxWidth;
                }
            }

            canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                cleanup();
                reject(new Error('Could not get canvas context'));
                return;
            }

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            const result = canvas.toDataURL('image/webp', quality);
            cleanup();
            resolve(result);
        };

        img.onerror = (err) => {
            cleanup();
            reject(err);
        };

        img.src = base64Str;
    });
};
// Helper function to convert a Base64 string into a physical File object
export const base64ToFile = (base64String: string | File | unknown, filename: string): File | string | unknown => {
    // If it's not a string (e.g., already a File object), or empty, return it as is
    if (!base64String || typeof base64String !== 'string' || !base64String.startsWith('data:image')) return base64String;

    const arr = base64String.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/webp';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);

    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }

    return new File([u8arr], filename, { type: mime });
};
export const compressImage = (dataUrl: string, maxWidth = 1080, maxHeight = 1080, quality = 0.85): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        let canvas: HTMLCanvasElement | null = null;

        const cleanup = () => {
            if (canvas) {
                canvas.width = 0;
                canvas.height = 0;
                canvas = null;
            }
            img.src = '';
            img.onload = null;
            img.onerror = null;
        };

        img.onload = () => {
            let { width, height } = img;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / width;
                    height = maxHeight;
                }
            }

            canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                cleanup();
                resolve(dataUrl);
                return;
            }

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            ctx.drawImage(img, 0, 0, width, height);
            const result = canvas.toDataURL('image/webp', quality);
            cleanup();
            resolve(result);
        };

        img.onerror = (err) => {
            cleanup();
            reject(err);
        };

        img.src = dataUrl;
    });
};

export const getImageUrl = (filename?: string | null): string => {
    if (!filename) return '';
    if (filename.startsWith('http') || filename.startsWith('data:image')) {
        return optimizeCloudinaryUrl(filename, 500);
    }

    return `${API_BASE}/uploads/${filename}`;
};