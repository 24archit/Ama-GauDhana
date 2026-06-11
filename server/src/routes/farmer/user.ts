import express from 'express';
import { requireAuth } from '../../middleware/auth';
import { getUserProfile, updateUserProfile, logoutUser } from '../../controllers/farmer/userController';

const router = express.Router();

// Apply auth middleware to all user routes
router.use(requireAuth);

router.get('/profile', getUserProfile);
router.put('/profile', updateUserProfile);
router.post('/logout', logoutUser);

export default router;
