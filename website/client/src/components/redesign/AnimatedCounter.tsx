import { useInView, motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface AnimatedCounterProps {
  target: number;
  from?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  decimals?: number;
  className?: string;
}

function formatNumber(n: number, decimals?: number): string {
  if (decimals !== undefined) {
    return n.toFixed(decimals);
  }
  return Math.round(n).toLocaleString('en-US');
}

export default function AnimatedCounter({
  target,
  from = 0,
  prefix = '',
  suffix = '',
  duration = 2,
  decimals,
  className,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const count = useMotionValue(from);
  const display = useTransform(count, (v) => formatNumber(v, decimals));
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (isInView && !hasAnimated.current) {
      hasAnimated.current = true;
      animate(count, target, { duration, ease: 'easeOut' });
    }
  }, [isInView, target, duration, count]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      <motion.span>{display}</motion.span>
      {suffix}
    </span>
  );
}
