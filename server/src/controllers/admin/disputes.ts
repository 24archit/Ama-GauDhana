import { Request, Response } from 'express';
import { Dispute } from '../../models/Dispute';
import { Cattle } from '../../models/Cattel';

export const getDisputes = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const status = req.query.status as string;
        
        const query: any = {};
        if (status) {
            query.status = status;
        }

        const skip = (page - 1) * limit;

        const disputes = await Dispute.find(query)
            .populate('cattleId', 'tagNumber name species breed photos aiMetadata')
            .populate('originalFarmerId', 'name contact.phone location')
            .populate('attemptingFarmerId', 'name contact.phone location')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Dispute.countDocuments(query);

        res.status(200).json({
            success: true,
            data: disputes,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page
        });
    } catch (error: any) {
        console.error('Error fetching disputes:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

export const resolveDispute = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { resolutionStatus, assignedFarmerId } = req.body; // resolutionStatus: 'resolved' | 'rejected'

        if (!['resolved', 'rejected'].includes(resolutionStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid resolution status' });
        }

        const dispute = await Dispute.findById(id);
        if (!dispute) {
            return res.status(404).json({ success: false, message: 'Dispute not found' });
        }

        dispute.status = resolutionStatus;
        await dispute.save();

        if (resolutionStatus === 'resolved' && assignedFarmerId && dispute.cattleId) {
            // Update cattle ownership
            await Cattle.findByIdAndUpdate(dispute.cattleId, {
                farmerId: assignedFarmerId,
                isDispute: false
            });
        }

        res.status(200).json({ success: true, data: dispute, message: 'Dispute resolved' });
    } catch (error: any) {
        console.error('Error resolving dispute:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
