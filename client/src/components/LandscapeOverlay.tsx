import React from 'react';
import { Box, Typography } from '@mui/material';
import { ScreenRotation } from '@mui/icons-material';

interface LandscapeOverlayProps {
    isLandscape: boolean;
}

const LandscapeOverlay: React.FC<LandscapeOverlayProps> = ({ isLandscape }) => {
    if (!isLandscape) return null;

    return (
        <Box
            sx={{
                position: 'fixed',
                inset: 0,
                zIndex: 99999, // Super high z-index to cover everything including dialogs
                backgroundColor: 'rgba(0, 0, 0, 0.95)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                p: 4,
                textAlign: 'center',
                backdropFilter: 'blur(10px)',
            }}
        >
            <ScreenRotation sx={{ fontSize: 80, mb: 3, color: '#F97D09', animation: 'spin 2s infinite linear', '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(90deg)' } } }} />
            <Typography variant="h4" fontWeight="bold" gutterBottom>
                Rotate your device
            </Typography>
            <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.7)', maxWidth: 400 }}>
                Use of this app in landscape mode is not allowed. Please rotate your phone back to portrait mode to continue.
            </Typography>
        </Box>
    );
};

export default LandscapeOverlay;
