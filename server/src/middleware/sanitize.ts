import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Basic NoSQL Injection Prevention Middleware
 * Recursively scans request payloads, queries, and parameters.
 * If it detects a MongoDB operator (keys containing '$' or '.'), it deletes the key
 * to prevent malicious DB execution.
 */
export const noSqlSanitize = (req: Request, res: Response, next: NextFunction) => {
    const sanitize = (obj: any) => {
        if (obj instanceof Object) {
            for (const key in obj) {
                // If a key starts with $ (MongoDB operators like $gt, $ne, $where)
                if (key.startsWith('$') || key.includes('.')) {
                    logger.warn(`🛑 Blocked malicious NoSQL injection attempt: ${key}`);
                    delete obj[key];
                } else {
                    sanitize(obj[key]);
                }
            }
        }
    };

    sanitize(req.body);
    sanitize(req.query);
    sanitize(req.params);
    
    next();
};
