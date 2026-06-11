import { objectStorageClient, queueClient, OCI_NAMESPACE, OCI_BUCKET_NAME, OCI_QUEUE_ID } from '../config/ociConfig';
import * as oci from 'oci-sdk';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const IS_LOCAL_DEV = process.env.IS_LOCAL_DEV === 'true';
const LOCAL_UPLOAD_DIR = path.join(__dirname, '../../uploads');

if (IS_LOCAL_DEV && !fs.existsSync(LOCAL_UPLOAD_DIR)) {
    fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
}

import { v2 as cloudinary } from 'cloudinary';

/**
 * Uploads a buffer directly to OCI Object Storage and returns the object name.
 */
export const uploadImageToOCI = async (fileBuffer: Buffer, originalName: string, mimeType: string, folderName: string = ''): Promise<string> => {
    // Easily reversible Cloudinary fallback:
    if (process.env.CLOUDINARY_URL) {
        return new Promise((resolve, reject) => {
            const options: any = { resource_type: 'image', format: originalName.split('.').pop() || 'jpg' };
            if (folderName) {
                options.folder = folderName;
            }
            const uploadStream = cloudinary.uploader.upload_stream(
                options,
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result!.secure_url);
                }
            );
            uploadStream.end(fileBuffer);
        });
    }

    const fileExtension = originalName.split('.').pop() || 'jpg';
    const objectName = `${uuidv4()}.${fileExtension}`;

    if (IS_LOCAL_DEV) {
        fs.writeFileSync(path.join(LOCAL_UPLOAD_DIR, objectName), fileBuffer);
        return objectName;
    }

    const putObjectRequest: oci.objectstorage.requests.PutObjectRequest = {
        namespaceName: OCI_NAMESPACE,
        bucketName: OCI_BUCKET_NAME,
        objectName: objectName,
        putObjectBody: fileBuffer,
        contentType: mimeType,
    };

    await objectStorageClient.putObject(putObjectRequest);
    return objectName;
};

/**
 * Publishes a fast job to OCI Queue for the DL-API to process asynchronously.
 */
export const publishDlJob = async (jobPayload: any) => {
    if (IS_LOCAL_DEV) {
         // Simulate queue by directly hitting the local DL-API in a fire-and-forget background manner
         const dlApiUrl = process.env.DL_MODEL_SERVER_LINK || 'http://localhost:8000';
         axios.post(`${dlApiUrl}/local-queue-trigger`, jobPayload).catch(e => console.error("Local queue trigger failed:", e.message));
         return { message: "Dispatched to local background endpoint" };
    }

    const putMessagesDetails: oci.queue.models.PutMessagesDetails = {
        messages: [{
            content: JSON.stringify(jobPayload)
        }]
    };

    const putMessagesRequest: oci.queue.requests.PutMessagesRequest = {
        queueId: OCI_QUEUE_ID,
        putMessagesDetails: putMessagesDetails
    };

    const response = await queueClient.putMessages(putMessagesRequest);
    return response.putMessages;
};
