import * as tf from '@tensorflow/tfjs';
import type { CameraGuidanceType, QualityReport, DetectionResult } from './types';
import { MODEL_INPUT_SIZE } from './constants';

export const calculateQualityScore = (
    conf: number | undefined | null,
    box: number[] | undefined | null,
    frameWidth: number,
    frameHeight: number,
    guidanceType: CameraGuidanceType,
): QualityReport => {
    const isMuzzle = guidanceType === 'muzzle';
    const targetScore = isMuzzle ? 65 : 60;
    const idealSize = 0.5;
    const guideWidth = 0.68;
    const guideHeight = 0.56;

    if (typeof conf !== 'number' || Number.isNaN(conf) || !Array.isArray(box) || box.length < 4 || !frameWidth || !frameHeight) {
        return { score: 0, passed: false, feedback: 'Scanning subject...', targetScore };
    }

    const cx = Number(box[0]);
    const cy = Number(box[1]);
    const w = Number(box[2]);
    const h = Number(box[3]);

    if ([cx, cy, w, h].some(value => Number.isNaN(value))) {
        return { score: 0, passed: false, feedback: 'Invalid frame capture', targetScore };
    }

    const nx = cx / MODEL_INPUT_SIZE[0];
    const ny = cy / MODEL_INPUT_SIZE[1];
    const nw = w / MODEL_INPUT_SIZE[0];
    const nh = h / MODEL_INPUT_SIZE[1];

    const minDim = Math.min(frameWidth, frameHeight);
    const offsetX = (frameWidth - minDim) / 2;
    const offsetY = (frameHeight - minDim) / 2;

    const absCx = offsetX + nx * minDim;
    const absCy = offsetY + ny * minDim;
    const absW = nw * minDim;
    const absH = nh * minDim;

    const vidNx = absCx / frameWidth;
    const vidNy = absCy / frameHeight;
    const vidNw = absW / frameWidth;
    const vidNh = absH / frameHeight;

    const boxLeft = vidNx - vidNw / 2;
    const boxRight = vidNx + vidNw / 2;
    const boxTop = vidNy - vidNh / 2;
    const boxBottom = vidNy + vidNh / 2;

    const uiLeft = 0.5 - guideWidth / 2;
    const uiRight = 0.5 + guideWidth / 2;
    const uiTop = 0.5 - guideHeight / 2;
    const uiBottom = 0.5 + guideHeight / 2;
    const leniency = isMuzzle ? 0.03 : 0.05;

    const isInsideUI = (
        boxLeft >= uiLeft - leniency &&
        boxRight <= uiRight + leniency &&
        boxTop >= uiTop - leniency &&
        boxBottom <= uiBottom + leniency
    );

    const confScore = Math.min(100, (conf / 0.85) * 100) * 0.50;
    const distanceX = Math.abs(vidNx - 0.5);
    const distanceY = Math.abs(vidNy - 0.5);
    const totalDistance = Math.sqrt(distanceX ** 2 + distanceY ** 2);
    const centerScore = Math.max(0, 100 - totalDistance * (isMuzzle ? 250 : 200)) * 0.28;
    const sizeDiff = Math.abs(vidNw - idealSize);
    const sizeScore = Math.max(0, 100 - sizeDiff * (isMuzzle ? 250 : 200)) * 0.22;

    let finalScore = Math.round(confScore + centerScore + sizeScore);
    let feedback = 'Perfect capture!';

    if (!isInsideUI) {
        finalScore = Math.min(finalScore, targetScore - (isMuzzle ? 10 : 5));
        if (boxLeft < uiLeft && boxRight > uiRight) feedback = 'Move back. Too close.';
        else if (boxTop < uiTop && boxBottom > uiBottom) feedback = 'Move back. Too close.';
        else if (boxLeft < uiLeft) feedback = 'Point camera left.';
        else if (boxRight > uiRight) feedback = 'Point camera right.';
        else if (boxTop < uiTop) feedback = 'Point camera up.';
        else if (boxBottom > uiBottom) feedback = 'Point camera down.';
    } else if (finalScore < targetScore) {
        if (conf < 0.5) feedback = isMuzzle ? 'Muzzle not clearly recognized.' : 'Face not clearly recognized.';
        else if (vidNw < idealSize - 0.15) feedback = 'Move closer.';
        else if (vidNw > idealSize + 0.15) feedback = 'Too close. Step back.';
        else if (distanceX > 0.1 || distanceY > 0.1) feedback = 'Center the subject.';
        else feedback = 'Hold steady...';
    }

    const score = Math.max(0, Math.min(100, Number.isNaN(finalScore) ? 0 : finalScore));
    return { score, passed: score >= targetScore && isInsideUI, feedback, targetScore };
};

export const computeNIMAScore = (predictions: Float32Array | Int32Array | Uint8Array): number => {
    let meanScore = 0;
    for (let i = 0; i < 10; i += 1) {
        meanScore += (i + 1) * predictions[i];
    }
    // Returns a float between 1.0 (terrible) and 10.0 (perfect)
    return meanScore;
};

export const parseModelOutput = async (tensor: tf.Tensor): Promise<DetectionResult> => {
    const data = await tensor.data();
    const shape = tensor.shape; 

    let numClasses = 1;
    let numAnchors = 8400;
    let isChannelsLast = false;

    // Detect if the tensor is [1, classes+4, 8400] or [1, 8400, classes+4]
    if (shape.length === 3) {
        if (shape[1] === 8400) {
            isChannelsLast = true;
            numAnchors = shape[1];
            numClasses = shape[2] - 4;
        } else if (shape[2] === 8400) {
            isChannelsLast = false;
            numAnchors = shape[2];
            numClasses = shape[1] - 4;
        }
    }

    let bestConf = 0.25; // Minimum threshold
    let bestIdx = -1;

    if (isChannelsLast) {
        // Layout: [1, 8400, 4 + classes]
        const rowLength = 4 + numClasses;
        for (let i = 0; i < numAnchors; i++) {
            const offset = i * rowLength;
            for (let c = 0; c < numClasses; c++) {
                const conf = data[offset + 4 + c];
                if (conf > bestConf) {
                    bestConf = conf;
                    bestIdx = offset; // Store flat index for quick extraction
                }
            }
        }

        if (bestIdx === -1) return { conf: 0, box: null };
        return {
            conf: bestConf,
            box: [data[bestIdx], data[bestIdx + 1], data[bestIdx + 2], data[bestIdx + 3]],
        };
        
    } else {
        // Layout: [1, 4 + classes, 8400]
        for (let c = 0; c < numClasses; c++) {
            const classOffset = (4 + c) * numAnchors;
            for (let i = 0; i < numAnchors; i++) {
                const conf = data[classOffset + i];
                if (conf > bestConf) {
                    bestConf = conf;
                    bestIdx = i;
                }
            }
        }

        if (bestIdx === -1) return { conf: 0, box: null };
        return {
            conf: bestConf,
            box: [
                data[0 * numAnchors + bestIdx], // cx
                data[1 * numAnchors + bestIdx], // cy
                data[2 * numAnchors + bestIdx], // w
                data[3 * numAnchors + bestIdx], // h
            ],
        };
    }
};
