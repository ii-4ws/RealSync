import { useState, useEffect, useRef } from 'react';
import deepfakeVideo from '@/assets/deepfake.webm';

interface DetectionOverlayProps {
  fullWidth?: boolean;
}

export default function DetectionOverlay({ fullWidth }: DetectionOverlayProps) {
  const [phase, setPhase] = useState<'analyzing' | 'detected'>('analyzing');
  const [confidence, setConfidence] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const cycle = () => {
      setPhase('analyzing');
      setConfidence(0);

      const fillStart = setTimeout(() => {
        setConfidence(94);
      }, 500);

      const detectTimeout = setTimeout(() => {
        setPhase('detected');
      }, 3000);

      const resetTimeout = setTimeout(() => {
        cycle();
      }, 6000);

      return () => {
        clearTimeout(fillStart);
        clearTimeout(detectTimeout);
        clearTimeout(resetTimeout);
      };
    };

    const cleanup = cycle();
    return cleanup;
  }, []);

  const containerClass = fullWidth
    ? 'absolute inset-0 w-full h-full overflow-hidden'
    : 'relative w-full aspect-video rounded-xl overflow-hidden border border-white/[0.06] bg-[#0D1117]';

  return (
    <div className={containerClass}>
      {/* Video */}
      <video
        ref={videoRef}
        src={deepfakeVideo}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="absolute inset-0 w-full h-full object-cover object-[center_20%]"
      />

      {/* Dark overlay for readability */}
      <div className={`absolute inset-0 ${fullWidth ? 'bg-black/50' : 'bg-black/30'}`} />

      {/* Corner bracket viewfinder marks */}
      {!fullWidth && (
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 225" fill="none" preserveAspectRatio="none">
          <path d="M20 40 L20 20 L40 20" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
          <path d="M360 20 L380 20 L380 40" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
          <path d="M20 185 L20 205 L40 205" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
          <path d="M360 205 L380 205 L380 185" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}

      {/* Cyan scanning line */}
      <div
        className="absolute left-0 right-0 h-[2px]"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, #22D3EE 30%, #22D3EE 70%, transparent 100%)',
          boxShadow: '0 0 12px rgba(34, 211, 238, 0.4)',
          animation: 'scan-h 2.5s linear infinite',
        }}
      />

      {/* Status badge */}
      <div className={`absolute ${fullWidth ? 'top-6 left-5' : 'top-4 left-3'} flex items-center gap-2`}>
        <div
          className={`
            px-2.5 py-1 rounded font-mono text-[11px] font-medium uppercase tracking-wider
            backdrop-blur-sm border transition-all duration-500
            ${phase === 'analyzing'
              ? 'bg-blue-500/20 border-blue-500/30 text-blue-300'
              : 'bg-red-500/20 border-red-500/30 text-red-300'
            }
          `}
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
              phase === 'analyzing' ? 'bg-blue-400 animate-pulse' : 'bg-red-400'
            }`}
          />
          {phase === 'analyzing' ? 'Analyzing...' : 'Deepfake Detected'}
        </div>
      </div>

      {/* Confidence meter */}
      <div className={`absolute ${fullWidth ? 'bottom-8 left-6 right-6' : 'bottom-7 left-4 right-4'}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[10px] text-white/60 uppercase tracking-wider">Confidence</span>
          <span className={`font-mono text-[11px] font-medium transition-colors duration-500 ${
            phase === 'detected' ? 'text-red-400' : 'text-blue-300'
          }`}>
            {phase === 'detected' ? '94%' : '...'}
          </span>
        </div>
        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-[2500ms] ease-out ${
              phase === 'detected' ? 'bg-red-500' : 'bg-blue-500'
            }`}
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>
    </div>
  );
}
