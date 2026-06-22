import { Request, Response } from 'express';
import { Cattle } from '../../models/Cattel';
import { User } from '../../models/User';
import { uploadBufferToCloudinary, deleteFromCloudinary } from '../../services/cloudinaryService';
import { cleanupCowCloudResources } from '../../services/cattleService';
import axios from 'axios';
import mongoose from 'mongoose';
import { recentRejections, processDlApiResult } from '../farmer/cattle';
import { processTelemetry } from '../../services/telemetryService';
import { dlApiClient } from '../../utils/dlApiClient';
import logger from '../../utils/logger';

export const getCattleDetails = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ success: false, message: 'Cattle not found' });
        }
        let cattle = await Cattle.findById(id).populate('farmerId', 'name contact.phone location.village location.district');
        if (!cattle) {
            if (recentRejections.has(id)) {
                const rejectionData = recentRejections.get(id);
                let failureStatus = typeof rejectionData === 'string' ? rejectionData : rejectionData?.status;
                let userMessage = typeof rejectionData === 'object' && rejectionData?.message
                    ? rejectionData.message
                    : `Registration failed due to: ${failureStatus}`;

                if (!userMessage || userMessage.includes('Registration failed due to')) {
                    if (failureStatus === 'SPOOF_DETECTED_MUZZLE') {
                        userMessage = 'Registration failed: Spoofing detected in the Muzzle image. Make sure it is a real photo, not a screen or print.';
                    } else if (failureStatus === 'NO_MUZZLE_DETECTED_MUZZLE_IMAGE' || failureStatus === 'NO_MUZZLE_DETECTED') {
                        userMessage = 'Registration failed: Could not detect the muzzle clearly in the Muzzle profile image. Retake the Muzzle profile.';
                    } else if (failureStatus === 'NO_FACE_DETECTED') {
                        userMessage = 'Registration failed: Could not detect the face clearly in the Face profile image. Retake the Face profile.';
                    } else if (failureStatus === 'NO_BIOMETRICS_DETECTED') {
                        userMessage = 'Registration failed: Could not detect either a Face or Muzzle. Please retake the photos clearly.';
                    } else if (failureStatus === 'DUPLICATE') {
                        userMessage = 'Registration failed: This cow is already registered.';
                    }
                }

                return res.status(400).json({
                    success: false,
                    isRejected: true,
                    status: failureStatus,
                    message: userMessage
                });
            }
            return res.status(404).json({ success: false, message: 'Cattle not found' });
        }


        // Mask internal PROCESSING_RESULT status from client
        if (cattle.aiMetadata && cattle.aiMetadata.status === 'PROCESSING_RESULT') {
            const cattleObj = cattle.toObject ? cattle.toObject() : cattle;
            cattleObj.aiMetadata.status = 'PENDING';
            return res.status(200).json({ success: true, data: cattleObj });
        }

        res.status(200).json({ success: true, data: cattle });
    } catch (error: any) {
        logger.error(error, 'Error fetching cattle details:');
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

export const getAllCattle = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const search = req.query.search as string;

        let query: any = {
            'aiMetadata.status': { $nin: ['PENDING', 'PROCESSING_RESULT'] }
        };
        if (search) {
            query.$text = { $search: search };
        }

        const skip = (page - 1) * limit;
        const sortOptions: any = search ? { score: { $meta: "textScore" } } : { createdAt: -1 };

        const [cattle, total] = await Promise.all([
            Cattle.find(query, search ? { score: { $meta: "textScore" } } : {})
                .populate('farmerId', 'name contact.phone location')
                .sort(sortOptions)
                .skip(skip)
                .limit(limit)
                .lean(),
            Cattle.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            data: cattle,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page
        });
    } catch (error: any) {
        logger.error(error, 'Error fetching all cattle:');
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

export const getPendingCattle = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        let query: any = {
            'aiMetadata.status': { $in: ['PENDING', 'PROCESSING_RESULT'] }
        };

        const skip = (page - 1) * limit;

        const [cattle, total] = await Promise.all([
            Cattle.find(query)
                .populate('farmerId', 'name contact.phone location')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Cattle.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            data: cattle,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page
        });
    } catch (error: any) {
        logger.error(error, 'Error fetching pending cattle:');
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

export const proxyRegisterCow = async (req: Request, res: Response) => {
    try {
        const farmerPhone = req.body.farmerPhone;
        if (!farmerPhone) {
            return res.status(400).json({ success: false, message: 'Farmer phone number is required for proxy registration' });
        }

        const farmer = await User.findOne({ 'contact.phone': farmerPhone, role: 'farmer' });
        if (!farmer) {
            return res.status(404).json({ success: false, message: 'Farmer not found with this phone number' });
        }

        const {
            tagNo, name, species, breed, sex, ageYears, ageMonths,
            source, purchaseDate, purchasePrice, sireTag, damTag,
            birthWeight, motherWeightAtCalving, calvingCounter,
            healthStatus, productionStatus,
            isInformationCorrectAgreement,
            lat, lng
        } = req.body;

        if (String(isInformationCorrectAgreement) !== 'true') {
            return res.status(400).json({ success: false, message: 'You must agree that the information is true and correct.' });
        }

        const files = req.files as { [fieldname: string]: Express.Multer.File[] };

        if (!species || !sex || !source) {
            return res.status(400).json({ success: false, message: 'Species, sex, and source are mandatory fields.' });
        }

        if (!lat || !lng) {
            return res.status(400).json({ success: false, message: 'GPS Location is mandatory to register a cow.' });
        }

        if (!files?.muzzleImage?.[0] || !files?.faceImage?.[0]) {
            return res.status(400).json({ success: false, message: 'Missing required biometrics. Both a Face Profile and a Muzzle capture are strictly required.' });
        }

        if (tagNo && tagNo.trim() !== '') {
            const existingCow = await Cattle.findOne({ tagNumber: tagNo });
            if (existingCow) {
                return res.status(400).json({ success: false, message: 'Cow with this tag number already exists' });
            }
        }

        const uploadedFiles: string[] = [];

        const safeUpload = async (buffer: Buffer, folderName: string = ''): Promise<string> => {
            if ((req as any).isAborted) throw new Error('Client Closed Request');
            const fileUrl = await uploadBufferToCloudinary(buffer, folderName);
            uploadedFiles.push(fileUrl);
            return fileUrl;
        };

        const safeUploadIfPresent = async (fileArray: Express.Multer.File[] | undefined): Promise<string> => {
            if (!fileArray || fileArray.length === 0) return '';
            const file = fileArray[0];
            return await safeUpload(file.buffer, 'gonidhi-images');
        };

        let faceProfileCloudinary = '', muzzleCloudinary = '', leftProfileCloudinary = '', rightProfileCloudinary = '', backViewCloudinary = '', tailViewCloudinary = '', selfieCloudinary = '';
        let faceTelemetryCloudinary = '', muzzleTelemetryCloudinary = '';
        let savedCow: any = null;

        try {
            const faceProfileFile = files.faceImage[0];
            const muzzleFile = files.muzzleImage[0];

            [
                faceProfileCloudinary,
                muzzleCloudinary,
                leftProfileCloudinary,
                rightProfileCloudinary,
                backViewCloudinary,
                tailViewCloudinary,
                selfieCloudinary,
                faceTelemetryCloudinary,
                muzzleTelemetryCloudinary
            ] = await Promise.all([
                safeUpload(faceProfileFile.buffer, 'gonidhi-images'),
                safeUpload(muzzleFile.buffer, 'gonidhi-images'),
                safeUploadIfPresent(files.leftImage),
                safeUploadIfPresent(files.rightImage),
                safeUploadIfPresent(files.backImage),
                safeUploadIfPresent(files.tailImage),
                safeUploadIfPresent(files.selfieImage),
                safeUpload(faceProfileFile.buffer, 'gonidhi-telemetry'),
                safeUpload(muzzleFile.buffer, 'gonidhi-telemetry')
            ]);

            const newCow = new Cattle({
                farmerId: farmer._id,
                tagNumber: (tagNo && tagNo.trim() !== '') ? tagNo : undefined,
                name,
                species: species || undefined,
                breed: breed || undefined,
                sex: sex || undefined,
                ageYears: ageYears ? Number(ageYears) : undefined,
                ageMonths: ageMonths ? Number(ageMonths) : undefined,
                sireTag,
                damTag,
                source,
                purchaseDetails: source === 'Purchase' ? {
                    date: purchaseDate || undefined,
                    price: purchasePrice ? Number(purchasePrice) : undefined
                } : undefined,
                isInformationCorrectAgreement: true,
                location: { lat: Number(lat), lng: Number(lng) },
                photos: {
                    faceProfile: faceProfileCloudinary,
                    muzzle: muzzleCloudinary,
                    leftProfile: leftProfileCloudinary,
                    rightProfile: rightProfileCloudinary,
                    backView: backViewCloudinary,
                    tailView: tailViewCloudinary,
                    selfie: selfieCloudinary
                },
                aiMetadata: { isRegistered: false, status: 'PENDING' },
                currentStatus: productionStatus || undefined,
                healthStats: {
                    birthWeight: birthWeight ? Number(birthWeight) : undefined,
                    motherWeightAtCalving: motherWeightAtCalving ? Number(motherWeightAtCalving) : undefined,
                    healthStatus: healthStatus || undefined,
                    calvingCounter: calvingCounter ? Number(calvingCounter) : undefined
                }
            });

            const session = await mongoose.startSession();
            if ((req as any).isAborted) throw new Error('Client Closed Request');
            try {
                await session.withTransaction(async () => {
                    const [savedItems] = await Cattle.create([newCow], { session });
                    savedCow = savedItems;
                    await User.findByIdAndUpdate(farmer._id, { $push: { cows: savedCow._id } }, { session });
                });
            } finally {
                await session.endSession();
            }

            const FormData = require('form-data');
            const formData = new FormData();
            formData.append('cow_id', savedCow._id.toString());
            formData.append('farmer_id', farmer._id.toString());
            if (name) formData.append('cow_name', name);
            if (faceTelemetryCloudinary) formData.append('face_image_url', faceTelemetryCloudinary);
            if (muzzleTelemetryCloudinary) formData.append('muzzle_image_url', muzzleTelemetryCloudinary);
            formData.append('face_image', faceProfileFile.buffer, { filename: 'face.jpg' });
            formData.append('muzzle_image', muzzleFile.buffer, { filename: 'muzzle.jpg' });

            await dlApiClient.post(`/register`, formData, {
                headers: formData.getHeaders()
            });

            res.status(202).json({
                success: true,
                message: `Cow proxy registration accepted for farmer ${farmer.name}.`,
                data: savedCow
            });

        } catch (error: any) {
            logger.error(error.message || error, 'Error proxy registering cow (Rollback Triggered):');

            if (savedCow) {
                const session = await mongoose.startSession();
                try {
                    await session.withTransaction(async () => {
                        await Promise.all([
                            Cattle.findByIdAndDelete(savedCow._id, { session }),
                            User.findByIdAndUpdate(farmer._id, { $pull: { cows: savedCow._id } }, { session })
                        ]);
                    });
                } finally {
                    await session.endSession();
                }
            }
            if (uploadedFiles.length > 0) {
                await Promise.all(uploadedFiles.map(fileUrl => deleteFromCloudinary(fileUrl).catch(() => { })));
            }

            res.status(500).json({ success: false, message: error.message || 'Could not complete registration. Rolled back successfully.' });
        }
    } catch (error: any) {
        logger.error(error, 'Error in proxy registering cow outer block:');
        res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
};

export const deleteCattle = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ success: false, message: 'Cattle not found' });
        }
        const session = await mongoose.startSession();
        let deletedCattle: any = null;
        try {
            await session.withTransaction(async () => {
                deletedCattle = await Cattle.findByIdAndDelete(id, { session });
                if (deletedCattle && deletedCattle.farmerId) {
                    await User.findByIdAndUpdate(deletedCattle.farmerId, { $pull: { cows: deletedCattle._id } }, { session });
                }
            });
        } finally {
            await session.endSession();
        }

        if (!deletedCattle) {
            // Idempotent delete: if it's already gone, treat as success
            return res.status(200).json({ success: true, message: 'Cattle already deleted' });
        }

        // Background cleanup of cloud resources
        cleanupCowCloudResources(deletedCattle);

        res.status(200).json({ success: true, message: 'Cattle deleted successfully' });
    } catch (error: any) {
        logger.error(error, 'Error deleting cattle:');
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

export const updateCattle = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ success: false, message: 'Cattle not found' });
        }
        const updateData = req.body;

        // Prevent editing of images, system fields, and farmerId through this basic update route
        delete updateData._id;
        delete updateData.farmerId;
        delete updateData.photos;
        delete updateData.aiMetadata;
        delete updateData.createdAt;
        delete updateData.updatedAt;

        // Clean up nested fields if necessary, or just rely on mongoose $set
        const updatedCattle = await Cattle.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        ).populate('farmerId', 'name contact.phone location.village location.district');

        if (!updatedCattle) {
            return res.status(404).json({ success: false, message: 'Cattle not found' });
        }

        res.status(200).json({ success: true, message: 'Cattle updated successfully', data: updatedCattle });
    } catch (error: any) {
        logger.error(error, 'Error updating cattle:');
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

export const proxySearchCow = async (req: Request, res: Response) => {
    // Create an AbortController to cancel the DL API request if the client disconnects
    const abortController = new AbortController();

    res.on('close', () => {
        // If the socket closes before we could send our response, the client disconnected.
        if (!res.writableEnded) {
            abortController.abort();
        }
    });

    try {
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
            formData.append('user_id', 'admin_proxy');
            formData.append('role', 'admin');
            if (faceCloudinary) formData.append('face_image_url', faceCloudinary);
            if (muzzleCloudinary) formData.append('muzzle_image_url', muzzleCloudinary);
            formData.append('face_image', faceFile.buffer, { filename: 'face.jpg' });
            formData.append('muzzle_image', muzzleFile.buffer, { filename: 'muzzle.jpg' });

            const dlResponse = await dlApiClient.post(`/search`, formData, {
                headers: formData.getHeaders(),
                signal: abortController.signal,
                timeout: 120000 // 120 seconds timeout
            });

            // Wait for the unified DL-API response
            const { match, cow_id, distance, reason, telemetry } = dlResponse.data;

            if (telemetry) {
                // Asynchronously process and save telemetry log to MongoDB
                processTelemetry(telemetry, '/admin/proxy-search', match);
            }

            if (match === false || !cow_id) {
                return res.status(200).json({
                    success: true,
                    data: {
                        cowId: null,
                        cow: null,
                        confidence: 0,
                        match: false
                    },
                    message: reason || 'Cow not found. No suspects passed the AI evaluation.'
                });
            }

            const cow = await Cattle.findById(cow_id).populate('farmerId', 'name contact.phone');
            if (!cow) {
                return res.status(404).json({ success: false, message: 'Cow identified but does not exist in DB.' });
            }

            res.status(200).json({
                success: true,
                data: {
                    cowId: cow_id,
                    cow: cow,
                    confidence: 1 - distance, // Rough conversion of distance to confidence for UI
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
            logger.error(dlError?.response?.data || dlError.message, 'Error calling DL API proxy search:');
            const errorDetail = dlError?.response?.data?.detail || 'AI Service unavailable or could not process images.';
            return res.status(404).json({ success: false, message: errorDetail });
        }

    } catch (error: any) {
        logger.error(error, 'Error in proxy search:');
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
