import { useMotionValue, useTransform, animate } from 'framer-motion';
import { useEffect, useRef } from 'react';

export function useCountUp(target: number, duration: number, inView: boolean, decimals = 1) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => v.toFixed(decimals));
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (inView && !hasAnimated.current) {
      hasAnimated.current = true;
      animate(count, target, { duration, ease: 'easeOut' });
    }
  }, [inView, target, duration, count]);

  return rounded;
}
