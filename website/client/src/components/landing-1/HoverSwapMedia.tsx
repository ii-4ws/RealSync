import { useState } from 'react';
import { cn } from '@/lib/utils';
import MediaFrame from './MediaFrame';

interface HoverSwapMediaProps {
  /** URL for the "real" state media. `null` renders a placeholder. */
  realSrc: string | null;
  /** URL for the "deepfake" state media. `null` renders a placeholder. */
  fakeSrc: string | null;
  className?: string;
}

/**
 * Tap-to-switch media card for Landing-1.
 * Toggles between REAL / DEEPFAKE states on click/tap.
 * When realSrc / fakeSrc are null, shows branded placeholder cards.
 */
export default function HoverSwapMedia({
  realSrc,
  fakeSrc,
  className,
}: HoverSwapMediaProps) {
  const [showFake, setShowFake] = useState(false);

  const toggle = () => setShowFake((prev) => !prev);

  const hasMedia = realSrc && fakeSrc;

  return (
    <MediaFrame className={cn('select-none', className)}>
      <button
        type="button"
        onClick={toggle}
        className="relative w-[320px] h-[220px] md:w-[400px] md:h-[280px] focus:outline-none overflow-hidden"
        aria-label={showFake ? 'Showing deepfake – tap to switch' : 'Showing real – tap to switch'}
      >
        {hasMedia ? (
          /* ── Real media ─────────────────────────────── */
          <>
            <img
              src={showFake ? fakeSrc : realSrc}
              alt={showFake ? 'Deepfake sample' : 'Real sample'}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
            />
            <span
              className={cn(
                'absolute top-3 left-3 text-xs font-bold tracking-widest px-3 py-1 rounded-full uppercase',
                showFake
                  ? 'bg-red-500/90 text-white'
                  : 'bg-emerald-500/90 text-white',
              )}
            >
              {showFake ? 'Deepfake' : 'Real'}
            </span>
          </>
        ) : (
          /* ── Placeholder ────────────────────────────── */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900">
            {/* Scan-line pattern for texture */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.5) 3px, rgba(255,255,255,0.5) 4px)',
              }}
            />

            {/* State badge */}
            <span
              className={cn(
                'relative z-10 text-sm font-bold tracking-[0.25em] uppercase px-5 py-2 rounded-full border transition-all duration-500',
                showFake
                  ? 'border-red-500/60 text-red-400 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
                  : 'border-emerald-500/60 text-emerald-400 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.15)]',
              )}
            >
              {showFake ? 'Deepfake' : 'Real'}
            </span>

            {/* Tap hint */}
            <span className="relative z-10 text-[11px] text-slate-500 tracking-wide">
              Tap to switch
            </span>

            {/* Subtle corner accents */}
            <div className="absolute top-3 left-3 w-6 h-6 border-t border-l border-slate-700/50 rounded-tl-md" />
            <div className="absolute top-3 right-3 w-6 h-6 border-t border-r border-slate-700/50 rounded-tr-md" />
            <div className="absolute bottom-3 left-3 w-6 h-6 border-b border-l border-slate-700/50 rounded-bl-md" />
            <div className="absolute bottom-3 right-3 w-6 h-6 border-b border-r border-slate-700/50 rounded-br-md" />
          </div>
        )}
      </button>
    </MediaFrame>
  );
}
