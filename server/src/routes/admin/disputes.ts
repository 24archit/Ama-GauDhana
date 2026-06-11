import express from 'express';
import { getDisputes, resolveDispute } from '../../controllers/admin/disputes';
import { requireAuth, authorizeRoles } from '../../middleware/auth';

const router = express.Router();

router.use(requireAuth, authorizeRoles('admin'));

router.get('/', getDisputes);
router.patch('/:id/resolve', resolveDispute);

export default router;
