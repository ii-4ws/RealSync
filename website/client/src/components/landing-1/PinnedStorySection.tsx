import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface PinnedStorySectionProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Full-viewport overlay container for pinned story sections in Landing-1.
 * Positioned absolute inside the sticky scroll viewport.
 * GSAP controls opacity / transforms from the parent via a forwarded ref.
 */
const PinnedStorySection = forwardRef<HTMLDivElement, PinnedStorySectionProps>(
  ({ children, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('absolute inset-0 will-change-transform', className)}
        style={{ transform: 'translate3d(0, 0, 0)' }}
      >
        {children}
      </div>
    );
  },
);

PinnedStorySection.displayName = 'PinnedStorySection';

export default PinnedStorySection;
