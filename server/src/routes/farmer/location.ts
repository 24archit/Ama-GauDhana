import express from 'express';
import { getStates, getDistricts, getBlocks, getVillages } from '../../controllers/farmer/locationController';

const router = express.Router();

router.get('/states', getStates);
router.get('/districts', getDistricts);
router.get('/blocks', getBlocks);
router.get('/villages', getVillages);

export default router;
