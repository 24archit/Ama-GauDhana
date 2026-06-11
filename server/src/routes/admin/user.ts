import express from 'express';
import { getFarmers, getFarmerDetails, deleteFarmer, getFarmerCattle, updateFarmer } from '../../controllers/admin/user';
import { requireAuth, authorizeRoles } from '../../middleware/auth';

const router = express.Router();

router.use(requireAuth, authorizeRoles('admin'));

router.get('/farmers', getFarmers);
router.get('/farmers/:id', getFarmerDetails);
router.put('/farmers/:id', updateFarmer);
router.get('/farmers/:id/cattle', getFarmerCattle);
router.delete('/farmers/:id', deleteFarmer);

export default router;
