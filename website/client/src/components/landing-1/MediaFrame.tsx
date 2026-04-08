import { cn } from '@/lib/utils';

interface MediaFrameProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Branded media frame for Landing-1 story sections.
 * Provides consistent border, radius, glow, and dark-theme styling
 * around any media content (video, image, or placeholder).
 */
export default function MediaFrame({ children, className }: MediaFrameProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-700/40 bg-slate-900/70 backdrop-blur-sm overflow-hidden',
        'shadow-[0_0_40px_rgba(59,130,246,0.08)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
