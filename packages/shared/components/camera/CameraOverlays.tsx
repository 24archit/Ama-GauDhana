import React from 'react';
import { Box, Typography } from '@mui/material';
import type { CameraGuidanceType } from './types';
import { RING_R, RING_CIRCUM } from './constants';

export const ProgressRing: React.FC<{ progress: number; recording: boolean }> = ({ progress, recording }) => (
    <svg width="90" height="90" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
        <circle cx="45" cy="45" r={RING_R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="5" />
        <circle
            cx="45"
            cy="45"
            r={RING_R}
            fill="none"
            stroke="#4ADE80"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUM}
            strokeDashoffset={RING_CIRCUM - (progress / 100) * RING_CIRCUM}
            style={{ transition: recording ? 'stroke-dashoffset 80ms linear' : 'none' }}
        />
    </svg>
);

export const CountdownDisplay: React.FC<{ secondsLeft: number }> = ({ secondsLeft }) => (
    <Box sx={{ position: 'absolute', top: '18%', left: '50%', transform: 'translateX(-50%)', zIndex: 20, pointerEvents: 'none' }}>
        <Typography sx={{
            fontSize: 72,
            fontWeight: 800,
            color: 'white',
            textShadow: '0 0 24px rgba(74,222,128,0.5), 0 2px 10px rgba(0,0,0,0.95)',
            fontFamily: '"SF Pro Display", "Helvetica Neue", sans-serif',
            lineHeight: 1,
        }}>
            {secondsLeft}
        </Typography>
    </Box>
);

export const OvalGuide: React.FC<{ recording: boolean; guidanceType: CameraGuidanceType }> = ({ recording, guidanceType }) => {
    if (guidanceType === 'none') return null;

    const labelMap: Record<Exclude<CameraGuidanceType, 'none'>, string> = {
        face: 'Align the face inside the guide',
        muzzle: 'Align the muzzle inside the guide',
        left: 'Frame the left side of the animal',
        right: 'Frame the right side of the animal',
        back: 'Frame the back view inside the guide',
        tail: 'Frame the tail or udder area clearly',
        selfie: 'Fit yourself and the animal in frame',
    };

    const strokeColor = recording ? '#4ADE80' : 'rgba(74,222,128,0.85)';
    const glowColor = recording ? 'rgba(74,222,128,0.4)' : 'rgba(74,222,128,0.2)';
    const cornerLen = 28;
    // Oval extents (matches the ellipse below)
    const cx = 130, cy = 160, rx = 118, ry = 148;
    // Four corner bracket positions (top-left, top-right, bottom-left, bottom-right)
    const corners = [
        { x: cx - rx, y: cy - ry, d: `M${cx - rx + cornerLen},${cy - ry} Q${cx - rx},${cy - ry} ${cx - rx},${cy - ry + cornerLen}` },
        { x: cx + rx, y: cy - ry, d: `M${cx + rx - cornerLen},${cy - ry} Q${cx + rx},${cy - ry} ${cx + rx},${cy - ry + cornerLen}` },
        { x: cx - rx, y: cy + ry, d: `M${cx - rx},${cy + ry - cornerLen} Q${cx - rx},${cy + ry} ${cx - rx + cornerLen},${cy + ry}` },
        { x: cx + rx, y: cy + ry, d: `M${cx + rx - cornerLen},${cy + ry} Q${cx + rx},${cy + ry} ${cx + rx},${cy + ry - cornerLen}` },
    ];

    return (
        <Box sx={{ position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {/* Subtle glow behind the oval */}
            <Box sx={{
                position: 'absolute',
                width: 242, height: 306,
                borderRadius: '50%',
                background: glowColor,
                filter: 'blur(18px)',
                transition: 'background 0.4s ease',
            }} />

            <svg viewBox="0 0 260 320" width="260" height="320" style={{ overflow: 'visible' }}>
                {/* Main ellipse guide — dashed when idle, solid when recording */}
                <ellipse
                    cx={cx}
                    cy={cy}
                    rx={rx}
                    ry={ry}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={recording ? 2 : 1.5}
                    strokeDasharray={recording ? '0' : '8 5'}
                    opacity={0.55}
                    style={{ transition: 'stroke 0.35s ease, stroke-dasharray 0.35s ease, opacity 0.35s ease' }}
                />

                {/* Corner bracket accents */}
                {corners.map((c, i) => (
                    <path
                        key={i}
                        d={c.d}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={recording ? 3.5 : 3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ transition: 'stroke 0.35s ease, stroke-width 0.35s ease' }}
                        filter={recording ? `drop-shadow(0 0 4px ${glowColor})` : undefined}
                    />
                ))}

                {/* Center crosshair dot */}
                <circle
                    cx={cx}
                    cy={cy}
                    r={recording ? 5 : 4}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={1.5}
                    opacity={0.7}
                    style={{ transition: 'all 0.35s ease' }}
                />
                <circle
                    cx={cx}
                    cy={cy}
                    r={recording ? 1.5 : 1.5}
                    fill={strokeColor}
                    opacity={0.9}
                    style={{ transition: 'all 0.35s ease' }}
                />
            </svg>

            {/* Guidance label */}
            <Box sx={{
                mt: 1.5,
                px: 2.5,
                py: 0.6,
                borderRadius: '20px',
                bgcolor: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(8px)',
                border: `1px solid ${strokeColor}30`,
            }}>
                <Typography sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: recording ? '#4ADE80' : 'rgba(255,255,255,0.9)',
                    textAlign: 'center',
                    letterSpacing: 0.2,
                    transition: 'color 0.3s ease',
                }}>
                    {recording ? '● Hold still…' : labelMap[guidanceType]}
                </Typography>
            </Box>
        </Box>
    );
};

export const AnalysisOverlay: React.FC<{ status: string; progress: number }> = ({ status, progress }) => (
    <Box sx={{
        position: 'absolute', inset: 0, zIndex: 100,
        bgcolor: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 3,
    }}>
        {/* Spinning ring */}
        <Box sx={{ position: 'relative', width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{
                position: 'absolute', inset: 0,
                border: '3px solid rgba(74,222,128,0.15)',
                borderTopColor: '#4ADE80',
                borderRadius: '50%',
                animation: 'spin 0.85s linear infinite',
            }} />
            <Typography sx={{ color: '#4ADE80', fontSize: 15, fontWeight: 800, fontFamily: 'monospace' }}>
                {Math.round(progress)}%
            </Typography>
        </Box>

        <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ color: 'white', fontWeight: 700, fontSize: 17, mb: 0.5 }}>
                {status}
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                Analysing frames for best match
            </Typography>
        </Box>

        {/* Progress bar */}
        <Box sx={{ width: 200, height: 4, bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{
                height: '100%',
                width: `${progress}%`,
                bgcolor: '#4ADE80',
                borderRadius: 2,
                transition: 'width 0.25s ease',
                boxShadow: '0 0 8px rgba(74,222,128,0.6)',
            }} />
        </Box>

        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </Box>
);
