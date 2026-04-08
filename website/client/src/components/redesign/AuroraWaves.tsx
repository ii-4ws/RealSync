export default function AuroraWaves({
  opacity = 1,
  variant = 'default',
}: {
  opacity?: number;
  variant?: 'default' | 'red';
}) {
  const isRed = variant === 'red';

  const colors = isRed
    ? {
        wave1: 'rgba(239, 68, 68, 0.10)',
        wave2: 'rgba(185, 28, 28, 0.08)',
        wave3: 'rgba(248, 113, 113, 0.06)',
      }
    : {
        wave1: 'rgba(59, 130, 246, 0.08)',
        wave2: 'rgba(99, 102, 241, 0.06)',
        wave3: 'rgba(59, 130, 246, 0.05)',
      };

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
      style={{ opacity }}
    >
      {/* Wave 1 */}
      <div
        data-aurora
        className="absolute"
        style={{
          width: '600px',
          height: '600px',
          top: '10%',
          left: '-5%',
          background: colors.wave1,
          filter: 'blur(100px)',
          mixBlendMode: 'screen',
          animation: 'aurora-1 12s ease-in-out infinite',
          borderRadius: '40% 60% 60% 40% / 60% 30% 70% 40%',
        }}
      />

      {/* Wave 2 */}
      <div
        data-aurora
        className="absolute"
        style={{
          width: '500px',
          height: '500px',
          top: '40%',
          right: '-10%',
          background: colors.wave2,
          filter: 'blur(120px)',
          mixBlendMode: 'screen',
          animation: 'aurora-2 18s ease-in-out infinite',
          borderRadius: '50% 50% 40% 60% / 40% 60% 50% 50%',
        }}
      />

      {/* Wave 3 */}
      <div
        data-aurora
        className="absolute"
        style={{
          width: '700px',
          height: '400px',
          bottom: '5%',
          left: '20%',
          background: colors.wave3,
          filter: 'blur(80px)',
          mixBlendMode: 'screen',
          animation: 'aurora-3 25s ease-in-out infinite',
          borderRadius: '60% 40% 50% 50% / 50% 40% 60% 50%',
        }}
      />
    </div>
  );
}
