import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

// ── WebGL Environment Config for Low-End Devices ──
// Force immediate GPU texture deletion instead of lazy cleanup (prevents VRAM bloat)
tf.env().set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0);
// Disable automatic GL flush batching — lets GPU idle between operations (reduces heat)
tf.env().set('WEBGL_FLUSH_THRESHOLD', -1);
// Limit WebGL texture size to prevent OOM on low-end GPUs
tf.env().set('WEBGL_MAX_TEXTURE_SIZE', 4096);

const MODEL_URL = '/model/muzzle/model.json';
const MODEL_INPUT_SIZE: [number, number] = [640, 640];

let cachedModel: tf.GraphModel | null = null;
let loadPromise: Promise<tf.GraphModel> | null = null;

let cachedNimaModel: tf.GraphModel | null = null;
let nimaLoadPromise: Promise<tf.GraphModel> | null = null;

export const isModelsCached = (requiresMuzzle: boolean): boolean => {
    if (requiresMuzzle) return cachedModel !== null && cachedNimaModel !== null;
    return cachedNimaModel !== null;
};

export const preloadMuzzleModel = (): Promise<tf.GraphModel> => {
    // If already loading or loaded, return the existing promise
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        try {
            await tf.ready();
            // Yield event loop so UI animations (like spinners) can render before massive JSON parsing blocks the thread
            await new Promise(r => setTimeout(r, 100));

            const loadedModel = await tf.loadGraphModel(MODEL_URL);

            // Yield again before compiling WebGL shaders (which synchronously locks the GPU/CPU)
            await new Promise(r => setTimeout(r, 100));

            // WebGL Shader Warm-up inside an isolated scope to guarantee zero tensor leaks
            tf.engine().startScope();
            try {
                const dummy = tf.zeros([1, MODEL_INPUT_SIZE[0], MODEL_INPUT_SIZE[1], 3]);
                const warmupResult = await loadedModel.executeAsync(dummy);

                // Explicitly dispose every tensor before ending scope
                if (Array.isArray(warmupResult)) warmupResult.forEach(t => t.dispose());
                else warmupResult.dispose();
                dummy.dispose();
            } finally {
                tf.engine().endScope();
            }

            // 500ms breathing room — let the GPU fully clock down and flush all compiled shader caches to VRAM
            await new Promise(r => setTimeout(r, 500));

            cachedModel = loadedModel;
            console.log(`✅ Muzzle Model loaded. Active tensors: ${tf.memory().numTensors}`);
            return loadedModel;
        } catch (error) {
            console.error('❌ Failed to preload AI model:', error);
            loadPromise = null; // Reset so we can try again if it fails
            throw error;
        }
    })();

    return loadPromise;
};

// Components call this to get the model. 
// If it's already preloaded, it resolves instantly.
export const getMuzzleModel = async (): Promise<tf.GraphModel> => {
    if (cachedModel) return cachedModel;
    return preloadMuzzleModel();
};

export const preloadNimaModel = (): Promise<tf.GraphModel> => {
    if (nimaLoadPromise) return nimaLoadPromise;

    nimaLoadPromise = (async () => {
        try {
            await tf.ready();
            
            // Yield event loop to allow UI to breathe
            await new Promise(r => setTimeout(r, 100));

            const nima = await tf.loadGraphModel('/model/nima/model.json');

            // Yield event loop before compiling NIMA shaders
            await new Promise(r => setTimeout(r, 100));

            // Warm-up NIMA inside an isolated scope — zero tensor leak guarantee
            tf.engine().startScope();
            try {
                const dummy = tf.zeros([1, 224, 224, 3]);
                const warmup = nima.predict(dummy) as tf.Tensor;
                warmup.dispose();
                dummy.dispose();
            } finally {
                tf.engine().endScope();
            }

            // 500ms breathing room for GPU cooldown
            await new Promise(r => setTimeout(r, 500));

            cachedNimaModel = nima;
            console.log(`✅ NIMA Model loaded. Active tensors: ${tf.memory().numTensors}`);
            return nima;
        } catch (error) {
            console.error('❌ Failed to preload NIMA model:', error);
            nimaLoadPromise = null;
            throw error;
        }
    })();

    return nimaLoadPromise;
};

export const getNimaModel = async (): Promise<tf.GraphModel> => {
    if (cachedNimaModel) return cachedNimaModel;
    return preloadNimaModel();
};

/**
 * Explicitly disposes of loaded models to free up GPU and RAM memory.
 * This should be called when exiting the camera or registration flows.
 */
export const disposeModels = () => {
    try {
        if (cachedModel) {
            cachedModel.dispose();
            cachedModel = null;
        }
        if (cachedNimaModel) {
            cachedNimaModel.dispose();
            cachedNimaModel = null;
        }
        loadPromise = null;
        nimaLoadPromise = null;
        console.log('🧹 AI Models disposed and RAM/VRAM freed.');
    } catch (e) {
        console.error('❌ Error while disposing AI models:', e);
    }
};