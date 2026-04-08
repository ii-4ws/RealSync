export default function PerspectiveGrid({ opacity = 1 }: { opacity?: number }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
      style={{ opacity }}
    >
      {/* Perspective grid receding to vanishing point */}
      <div
        className="absolute inset-0"
        style={{
          perspective: '800px',
          perspectiveOrigin: '50% 40%',
        }}
      >
        <div
          data-grid-breathe
          className="absolute inset-0"
          style={{
            transform: 'rotateX(55deg) translateZ(0)',
            transformOrigin: '50% 0%',
            backgroundImage: `
              linear-gradient(rgba(59, 130, 246, 0.04) 1px, transparent 1px),
              linear-gradient(90deg, rgba(59, 130, 246, 0.04) 1px, transparent 1px)
            `,
            backgroundSize: '80px 80px',
            animation: 'grid-breathe 8s ease-in-out infinite',
            height: '200%',
            width: '120%',
            left: '-10%',
            top: '-20%',
          }}
        />
      </div>

      {/* Glow nodes at some intersections */}
      {[
        { top: '30%', left: '20%', delay: 0 },
        { top: '45%', left: '50%', delay: 2 },
        { top: '55%', left: '75%', delay: 4 },
        { top: '40%', left: '35%', delay: 6 },
        { top: '60%', left: '60%', delay: 1 },
        { top: '35%', left: '85%', delay: 3 },
      ].map((node, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 rounded-full"
          style={{
            top: node.top,
            left: node.left,
            background: 'rgba(59, 130, 246, 0.3)',
            boxShadow: '0 0 8px rgba(59, 130, 246, 0.2)',
            animation: `grid-breathe 8s ease-in-out infinite`,
            animationDelay: `${node.delay}s`,
          }}
        />
      ))}

      {/* Fade-out gradient at bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1/3"
        style={{
          background: 'linear-gradient(to bottom, transparent, #07090E)',
        }}
      />
    </div>
  );
}
