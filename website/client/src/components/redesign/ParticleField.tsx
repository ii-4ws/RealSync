import { useMemo } from 'react';
import { motion } from 'framer-motion';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  duration: number;
  dx: number;
  dy: number;
}

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 1 + Math.random() * 2,
    opacity: 0.2 + Math.random() * 0.4,
    duration: 8 + Math.random() * 12,
    dx: (Math.random() - 0.5) * 60,
    dy: (Math.random() - 0.5) * 60,
  }));
}

export default function ParticleField() {
  const particles = useMemo(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    return generateParticles(isMobile ? 15 : 30);
  }, []);

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-blue-400"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
          }}
          animate={{
            x: [0, p.dx, -p.dx * 0.5, 0],
            y: [0, p.dy, -p.dy * 0.5, 0],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}
