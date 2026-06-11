export type CameraGuidanceType = 'muzzle' | 'face' | 'left' | 'right' | 'back' | 'tail' | 'selfie' | 'none';

export interface QualityReport {
    score: number;
    passed: boolean;
    feedback: string;
    targetScore: number;
}

export interface DetectionResult {
    conf: number;
    box: number[] | null;
}

export type Phase = 'idle' | 'preview' | 'recording' | 'analyzing' | 'result' | 'no-match';
