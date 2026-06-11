import mongoose, { Schema, Document } from 'mongoose';

export interface IDispute extends Document {
    cattleId?: mongoose.Types.ObjectId;
    originalFarmerId: mongoose.Types.ObjectId;
    attemptingFarmerId: mongoose.Types.ObjectId;
    status: 'pending' | 'resolved' | 'rejected';
    reason: string;
    createdAt: Date;
    updatedAt: Date;
}

const DisputeSchema = new Schema<IDispute>({
    cattleId: { type: Schema.Types.ObjectId, ref: 'Cattle' },
    originalFarmerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    attemptingFarmerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
        type: String,
        enum: ['pending', 'resolved', 'rejected'],
        default: 'pending'
    },
    reason: { type: String, required: true }
}, { timestamps: true });

export const Dispute = mongoose.model<IDispute>('Dispute', DisputeSchema);
