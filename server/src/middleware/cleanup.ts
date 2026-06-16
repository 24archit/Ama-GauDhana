import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import logger from '../utils/logger';

export const handleConnectionDrop = (req: Request, res: Response, next: NextFunction) => {
    req.on('aborted', () => {
        logger.warn('Client connection aborted. Cleaning up partial uploads...');
        
        // Flag for controllers to abort DB operations
        (req as any).isAborted = true;

        const files = req.files as { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[];
        
        if (files) {
            if (Array.isArray(files)) {
                files.forEach(file => cleanupFile(file));
            } else {
                for (const field in files) {
                    files[field].forEach(file => cleanupFile(file));
                }
            }
        }
        
        if (req.file) {
            cleanupFile(req.file);
        }
    });

    next();
};

function cleanupFile(file: Express.Multer.File) {
    if (file.buffer) {
        file.buffer = Buffer.alloc(0); // Clear memory buffer to prevent memory bloat
    }
    if (file.path && fs.existsSync(file.path)) {
        try {
            fs.unlinkSync(file.path);
        } catch (err) {
            logger.error(err, `Failed to delete orphaned file ${file.path}`);
        }
    }
}
