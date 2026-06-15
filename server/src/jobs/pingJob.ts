import axios from 'axios';
import logger from '../utils/logger';

export const startPingJob = () => {
    // DISABLED: Preventing unnecessary pings to DL-API to save compute resources.
    // const DL_API_URL = process.env.DL_API_URL;
    // if (DL_API_URL) {
    //     logger.info('[Jobs] Starting DL-API Ping Job (10m interval)');
    //     setInterval(async () => {
    //         try {
    //             await axios.get(`${DL_API_URL}/docs`, { timeout: 5000 });
    //         } catch (error: any) {
    //             logger.error(error.message, "[PingJob] Internal Ping Failed:");
    //         }
    //     }, 10 * 60 * 1000); // 10 minutes
    // }
};
