import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface GlitchTextProps {
  children: ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'span' | 'p';
  className?: string;
  burst?: boolean;
}

export default function GlitchText({ children, as: Tag = 'span', className, burst }: GlitchTextProps) {
  const text = typeof children === 'string' ? children : '';

  return (
    <Tag
      className={cn('glitch', burst && 'glitch-burst', className)}
      data-text={text}
    >
      {children}
    </Tag>
  );
}
