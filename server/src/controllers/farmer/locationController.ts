import { Request, Response } from 'express';
import { Location } from '../../models/Location';

// 1. Get all unique states (Usually just 'Odisha' in your case)
export const getStates = async (req: Request, res: Response): Promise<void> => {
    try {
        const states = await Location.distinct('state');
        res.status(200).json(states.sort());
    } catch (error) {
        res.status(500).json({ message: 'Error fetching states', error });
    }
};

// 2. Get districts based on the selected state
export const getDistricts = async (req: Request, res: Response): Promise<void> => {
    try {
        const { state } = req.query;
        if (!state) {
            res.status(400).json({ message: 'State parameter is required' });
            return;
        }

        const districts = await Location.distinct('district', { state });
        res.status(200).json(districts.sort());
    } catch (error) {
        res.status(500).json({ message: 'Error fetching districts', error });
    }
};

// 3. Get blocks based on the selected district
export const getBlocks = async (req: Request, res: Response): Promise<void> => {
    try {
        const { district } = req.query;
        if (!district) {
            res.status(400).json({ message: 'District parameter is required' });
            return;
        }

        const blocks = await Location.distinct('block', { district });
        res.status(200).json(blocks.sort());
    } catch (error) {
        res.status(500).json({ message: 'Error fetching blocks', error });
    }
};

// 4. Get villages based on the selected block
export const getVillages = async (req: Request, res: Response): Promise<void> => {
    try {
        const { block } = req.query;
        if (!block) {
            res.status(400).json({ message: 'Block parameter is required' });
            return;
        }

        const villages = await Location.distinct('village', { block });
        res.status(200).json(villages.sort());
    } catch (error) {
        res.status(500).json({ message: 'Error fetching villages', error });
    }
};