import { Request, Response } from 'express';
import { Cattle } from '../../models/Cattel';
import { User } from '../../models/User';
import { Dispute } from '../../models/Dispute';
import axios from 'axios';
import mongoose from 'mongoose';
import { uploadBufferToCloudinary, deleteFromCloudinary } from '../../services/cloudinaryService';
import { asyncHandler } from '../../middleware/asyncHandler';
import crypto from 'crypto';
import { processTelemetry } from '../../services/telemetryService';
import { createCattleRegistration, cleanupCowCloudResources } from '../../services/cattleService';
import { dlApiClient } from '../../utils/dlApiClient';
import logger from '../../utils/logger';
import { deleteCowVectors } from '../../utils/qdrantClient';

interface AuthRequest extends Request {
    user?: { id: string; role: string; name: string };
    body: any;
    params: any;
}

export const recentRejections = new Map<string, any>();
const REJECTION_TTL_MS = 10 * 60 * 1000;

export const registerCow = asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (!authReq.user) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const farmerId = authReq.user.id;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (String(authReq.body.isInformationCorrectAgreement) !== 'true') {
        return res.status(400).json({ success: false, message: 'You must agree that the information is true and correct.' });
    }

    const savedCow = await createCattleRegistration(req, farmerId, authReq.body, files);

    res.status(202).json({
        success: true,
        message: 'Cow registration accepted. It is currently being processed by our AI servers.',
        data: savedCow
    });
});

export const getMyCattle = asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (!authReq.user) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search ? String(req.query.search) : '';
    const skip = (page - 1) * limit;

    const baseQuery: any = {
        farmerId: authReq.user.id,
        'aiMetadata.status': { $nin: ['PENDING', 'PROCESSING_RESULT'] }
    };

    const searchQuery = { ...baseQuery };
    if (search) {
        searchQuery.$text = { $search: search };
    }

    const sortOptions: any = search
        ? { score: { $meta: "textScore" } }
        : { createdAt: -1 };

    const [totalNonDisputed, totalPregnant, totalDisputed, cattle, totalFiltered] = await Promise.all([
        Cattle.countDocuments({ ...baseQuery, isDispute: { $ne: true } }),
        Cattle.countDocuments({ ...baseQuery, isDispute: { $ne: true }, currentStatus: 'Pregnant' }),
        Cattle.countDocuments({ ...baseQuery, isDispute: true }),
        Cattle.find(searchQuery, search ? { score: { $meta: "textScore" } } : {})
            .sort(sortOptions)
            .skip(skip)
            .limit(limit)
            .lean(),
        Cattle.countDocuments(searchQuery)
    ]);

    res.status(200).json({
        success: true,
        count: cattle.length,
        totalFiltered,
        totalPages: Math.ceil(totalFiltered / limit),
        currentPage: page,
        hasMore: skip + cattle.length < totalFiltered,
        stats: {
            totalNonDisputed,
            totalPregnant,
            totalDisputed
        },
        data: cattle
    });
});



function getRejectionMessage(status: string, message?: string): string {
    let userMessage = message ? message : `Registration failed due to: ${status}`;
    if (!userMessage || userMessage === 'N/A' || userMessage.includes('Registration failed due to')) {
        if (status === 'SPOOF_DETECTED_MUZZLE') {
            userMessage = 'Registration failed: Spoofing detected in the Muzzle image. Make sure it is a real photo, not a screen or print.';
        } else if (status === 'NO_MUZZLE_DETECTED_MUZZLE_IMAGE' || status === 'NO_MUZZLE_DETECTED') {
            userMessage = 'Registration failed: Could not detect the muzzle clearly in the Muzzle profile image. Retake the Muzzle profile.';
        } else if (status === 'NO_FACE_DETECTED') {
            userMessage = 'Registration failed: Could not detect the face clearly in the Face profile image. Retake the Face profile.';
        } else if (status === 'NO_BIOMETRICS_DETECTED') {
            userMessage = 'Registration failed: Could not detect either a Face or Muzzle. Please retake the photos clearly.';
        } else if (status === 'NOT_A_COW') {
            userMessage = 'Registration failed: Images do not appear to contain a cow.';
        } else if (status === 'DUPLICATE') {
            userMessage = 'Registration failed: This cow is already registered.';
        } else if (status === 'FAILED') {
            userMessage = 'Registration failed: An unexpected error occurred while processing your request. Please try again.';
        } else {
            userMessage = `Registration failed: An unknown error occurred (${status}). Please try again.`;
        }
    }
    return userMessage;
}

export const getCowProfile = asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (!authReq.user) return res.status(401).json({ success: false, message: 'Unauthorized' });

    if (!mongoose.Types.ObjectId.isValid(authReq.params.id)) {
        return res.status(404).json({ success: false, message: 'Cow not found or unauthorized' });
    }

    let cow = await Cattle.findOne({ _id: authReq.params.id, farmerId: authReq.user.id });

    if (!cow) {
        if (recentRejections.has(authReq.params.id)) {
            const rejectionData = recentRejections.get(authReq.params.id);
            const failureStatus = typeof rejectionData === 'string' ? rejectionData : rejectionData?.status;
            const messageStr = typeof rejectionData === 'object' ? rejectionData?.message : undefined;
            const userMessage = getRejectionMessage(failureStatus, messageStr);

            return res.status(400).json({
                success: false,
                isRejected: true,
                status: failureStatus,
                message: userMessage
            });
        }
        return res.status(404).json({ success: false, message: 'Cow not found or unauthorized' });
    }


    // Mask internal PROCESSING_RESULT status from client so it continues polling instead of crashing
    if (cow.aiMetadata && cow.aiMetadata.status === 'PROCESSING_RESULT') {
        const cowObj = cow.toObject ? cow.toObject() : cow;
        cowObj.aiMetadata.status = 'PENDING';
        return res.status(200).json({ success: true, data: cowObj });
    }

    res.status(200).json({
        success: true,
        data: cow
    });
});

export const searchCow = asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const abortController = new AbortController();

    res.on('close', () => {
        if (!res.writableEnded) abortController.abort();
    });

    if (!authReq.user) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (!files?.muzzleImage?.[0] || !files?.faceImage?.[0]) {
        return res.status(400).json({ success: false, message: 'Both a Face Profile and a Muzzle image are strictly required for AI verification.' });
    }

    let faceCloudinary: string | undefined;
    let muzzleCloudinary: string | undefined;
    try {
        const faceFile = files.faceImage[0];
        const muzzleFile = files.muzzleImage[0];

        // Fire and forget cloudinary uploads to reduce latency
        uploadBufferToCloudinary(faceFile.buffer, 'gonidhi-telemetry').then((url) => faceCloudinary = url).catch(() => {});
        uploadBufferToCloudinary(muzzleFile.buffer, 'gonidhi-telemetry').then((url) => muzzleCloudinary = url).catch(() => {});

        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('user_id', authReq.user.id);
        formData.append('role', authReq.user.role || 'farmer');
        if (faceCloudinary) formData.append('face_image_url', faceCloudinary);
        if (muzzleCloudinary) formData.append('muzzle_image_url', muzzleCloudinary);
        formData.append('face_image', faceFile.buffer, { filename: 'face.jpg' });
        formData.append('muzzle_image', muzzleFile.buffer, { filename: 'muzzle.jpg' });

        const dlResponse = await dlApiClient.post(`/search`, formData, {
            headers: formData.getHeaders(),
            signal: abortController.signal,
            timeout: 120000
        });

        const { match, cow_id, distance, reason, telemetry } = dlResponse.data;

        if (telemetry) {
            processTelemetry(telemetry, '/search', match);
        }

        if (match === false || !cow_id) {
            return res.status(200).json({
                success: true,
                data: { cowId: null, cow: null, confidence: 0, match: false },
                message: reason || 'Cow not found. No suspects passed the AI evaluation.'
            });
        }

        const cow = await Cattle.findOne({ _id: cow_id, farmerId: authReq.user.id });
        if (!cow) {
            return res.status(404).json({ success: false, message: 'Cow identified but does not belong to you or does not exist.' });
        }

        res.status(200).json({
            success: true,
            data: {
                cowId: cow_id,
                cow: cow,
                confidence: 1 - distance,
                match: true
            }
        });

    } catch (dlError: any) {
        if (faceCloudinary) deleteFromCloudinary(faceCloudinary).catch(() => { });
        if (muzzleCloudinary) deleteFromCloudinary(muzzleCloudinary).catch(() => { });

        if (axios.isCancel(dlError) || dlError.name === 'AbortError' || dlError.name === 'CanceledError') {
            logger.info('Client disconnected, canceled DL API search request.');
            return res.status(499).json({ success: false, message: 'Client Closed Request' });
        }
        logger.error(dlError?.response?.data || dlError.message, 'Error calling DL API search:');
        let errorDetail = dlError?.response?.data?.detail;
        if (typeof errorDetail === 'object' && errorDetail?.message) {
            errorDetail = errorDetail.message;
        }
        errorDetail = errorDetail || 'AI Service unavailable or could not process images.';
        return res.status(404).json({ success: false, message: errorDetail });
    }
});

export async function processDlApiResult(payload: any) {
    const { cow_id, farmer_id, status, matched_cow_id, superpoint_cache, error_message, telemetry } = payload;

    if (telemetry) {
        processTelemetry(telemetry, '/register', status === 'SUCCESS' || status === 'DUPLICATE' || status === 'DISPUTE');
    }

    if (!cow_id) return false;

    // Atomically find and lock the cow for processing to prevent race conditions
    // between DL-API webhook and farmer's profile query.
    const cow = await Cattle.findOneAndUpdate(
        { _id: cow_id, 'aiMetadata.status': 'PENDING' },
        { $set: { 'aiMetadata.status': 'PROCESSING_RESULT' } },
        { new: true }
    );

    if (!cow) {
        logger.info(`[Sync] Cow ${cow_id} already processed or not pending.`);
        
        // If the webhook is arriving late (after the 6-minute cleanup job or instant rollback),
        // we must ensure the late vector is purged from Qdrant to prevent split-brain.
        try {
            await deleteCowVectors(cow_id);
            logger.info(`[Sync] Purged late-arriving vector for deleted cow: ${cow_id}`);
        } catch (qErr) {
            // Error already logged in qdrantClient
        }
        
        return false;
    }

    try {
        let finalStatus = status;

        if (status === 'DUPLICATE' && matched_cow_id) {
            const matchedCow = await Cattle.findById(matched_cow_id).select('farmerId').lean();
            if (matchedCow && matchedCow.farmerId.toString() !== farmer_id.toString()) {
                finalStatus = 'DISPUTE';
            }
        }

        if (finalStatus === 'DUPLICATE') {
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    await Promise.all([
                        Cattle.findByIdAndDelete(cow_id, { session }),
                        User.findByIdAndUpdate(farmer_id, { $pull: { cows: cow_id } }, { session })
                    ]);
                });
            } finally {
                await session.endSession();
            }
            recentRejections.set(cow_id, { status, message: error_message } as any);
            setTimeout(() => recentRejections.delete(cow_id), REJECTION_TTL_MS);

            cleanupCowCloudResources(cow);
            logger.info(`[Sync] Duplicate cow deleted for cow_id: ${cow_id}`);
        } else if (finalStatus === 'DISPUTE') {
            let originalFarmerId = null;
            if (matched_cow_id) {
                const matchedCow = await Cattle.findById(matched_cow_id);
                if (matchedCow) {
                    originalFarmerId = matchedCow.farmerId;
                }
            }

            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    const tasks: Promise<any>[] = [
                        Cattle.findByIdAndDelete(cow_id, { session }),
                        User.findByIdAndUpdate(farmer_id, { $pull: { cows: cow_id } }, { session })
                    ];
                    
                    if (matched_cow_id) {
                        tasks.push(Cattle.findByIdAndUpdate(matched_cow_id, { isDispute: true }, { session }));
                    }
                    if (originalFarmerId && matched_cow_id) {
                        tasks.push(Dispute.create([{
                            cattleId: matched_cow_id,
                            originalFarmerId: originalFarmerId,
                            attemptingFarmerId: farmer_id,
                            status: 'pending',
                            reason: error_message || 'Duplicate Registration Attempt Detected via AI Biometrics'
                        }], { session }));
                    }
                    
                    await Promise.all(tasks);
                });
            } finally {
                await session.endSession();
            }

            cleanupCowCloudResources(cow);
            logger.info(`[Sync] Dispute marked for matched_cow_id: ${matched_cow_id}. Ghost cow ${cow_id} deleted.`);
        } else if (finalStatus === 'SUCCESS') {
            cow.aiMetadata.isRegistered = true;
            cow.aiMetadata.status = status;
            await cow.save();
            logger.info(`[Sync] Successfully registered cow_id: ${cow_id}`);
        } else {
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    await Promise.all([
                        Cattle.findByIdAndDelete(cow_id, { session }),
                        User.findByIdAndUpdate(farmer_id, { $pull: { cows: cow_id } }, { session })
                    ]);
                });
            } finally {
                await session.endSession();
            }
            recentRejections.set(cow_id, { status: finalStatus, message: error_message } as any);
            setTimeout(() => recentRejections.delete(cow_id), REJECTION_TTL_MS);

            cleanupCowCloudResources(cow);
            logger.info(`[Sync] Failed AI processing, cow deleted for cow_id: ${cow_id}`);
        }

        return true;
    } catch (error) {
        logger.error(error, `[Sync] Error processing DL API result for cow ${cow_id}:`);
        await Cattle.findByIdAndUpdate(cow_id, { $set: { 'aiMetadata.status': 'PENDING' } });
        return false;
    }
}

export const handleDlApiWebhook = asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.DL_API_KEY;

    if (!expectedToken) {
        return res.status(500).json({ success: false, message: 'Server misconfiguration: DL_API_KEY is required for webhook authentication' });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Unauthorized webhook call' });
    }

    const token = authHeader.split(' ')[1];

    // Use timingSafeEqual to prevent timing attacks
    if (token.length !== expectedToken.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken))) {
        return res.status(401).json({ success: false, message: 'Unauthorized webhook call' });
    }

    await processDlApiResult(req.body);
    // Acknowledge receipt even if already processed by polling
    res.status(200).json({ success: true });
});
