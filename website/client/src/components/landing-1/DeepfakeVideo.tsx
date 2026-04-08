import { useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import MediaFrame from './MediaFrame';

interface DeepfakeVideoProps {
  src: string;
  className?: string;
}

/**
 * Hover-to-play (desktop) / tap-to-play (mobile) video for Landing-1.
 *
 * Desktop: pointerenter → play from start if ended/never started; mid-play ignored.
 *          leave → stays frozen. Re-enter after ended → replays from start.
 * Mobile:  tap → same logic.
 * Ended:   freezes on last frame. No loop.
 */
export default function DeepfakeVideo({ src, className }: DeepfakeVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Force muted at runtime to satisfy autoplay policy
  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.muted = true;
    }
  }, []);

  const startPlayback = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;

    // Hard force muted + playsInline every time
    v.muted = true;

    // Restart if ended or near-end or never started
    if (v.ended || v.currentTime >= (v.duration || 0) - 0.05) {
      v.currentTime = 0;
    }

    v.play().catch(() => {});
  }, []);

  const handlePointerEnter = useCallback(() => {
    startPlayback();
  }, [startPlayback]);

  const handlePointerLeave = useCallback(() => {
    // Intentionally empty — video stays frozen on leave
  }, []);

  const handleClick = useCallback(() => {
    startPlayback();
  }, [startPlayback]);

  const handleEnded = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      // Do NOT reset currentTime — stay at last frame
    }
  }, []);

  return (
    <MediaFrame className={cn('select-none pointer-events-auto', className)}>
      {/* Hide any native browser play-button overlay */}
      <style>{`
        .dfv-video::-webkit-media-controls,
        .dfv-video::-webkit-media-controls-panel,
        .dfv-video::-webkit-media-controls-start-playback-button,
        .dfv-video::-webkit-media-controls-overlay-play-button {
          display: none !important;
          -webkit-appearance: none;
        }
      `}</style>

      <div
        className="relative z-10 aspect-[3/4] w-[320px] md:w-[560px] max-w-[42vw] overflow-hidden cursor-pointer pointer-events-auto"
        onPointerEnter={handlePointerEnter}
        onMouseEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
      >
        <video
          ref={videoRef}
          src={src}
          muted
          playsInline
          preload="auto"
          controls={false}
          loop={false}
          disablePictureInPicture
          className="dfv-video absolute inset-0 w-full h-full object-contain pointer-events-auto"
          onPointerEnter={handlePointerEnter}
          onMouseEnter={handlePointerEnter}
          onClick={handleClick}
          onEnded={handleEnded}
        />
      </div>
    </MediaFrame>
  );
}
