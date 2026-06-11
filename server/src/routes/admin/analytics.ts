import express from 'express';
import { getSystemStats, getAiLogs, getAiLogById, deleteAiLog, updateAiLog, exportAiLogs } from '../../controllers/admin/analytics';
import { requireAuth, authorizeRoles } from '../../middleware/auth';

const router = express.Router();

router.use(requireAuth, authorizeRoles('admin'));

router.get('/stats', getSystemStats);
router.get('/ai-logs/export', exportAiLogs);
router.get('/ai-logs', getAiLogs);
router.get('/ai-logs/:id', getAiLogById);
router.put('/ai-logs/:id', updateAiLog);
router.delete('/ai-logs/:id', deleteAiLog);

export default router;
