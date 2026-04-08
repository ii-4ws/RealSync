import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import BackgroundLayers from './BackgroundLayers';

gsap.registerPlugin(ScrollTrigger);

/* ── Animated Visuals ──────────────────────────────────────── */

function AudioWaveform() {
  return (
    <div className="flex items-end justify-center gap-1.5 h-40 md:h-56">
      {[0, 0.15, 0.3, 0.05, 0.2, 0.35, 0.1, 0.25].map((delay, i) => (
        <span
          key={i}
          className="eq-bar"
          style={{
            height: '30%',
            width: '6px',
            animationDelay: `${delay}s`,
            animationDuration: `${0.8 + i * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

function VideoScanGrid() {
  return (
    <div className="relative h-40 md:h-56 w-full flex items-center justify-center overflow-hidden">
      <svg viewBox="0 0 80 80" className="w-28 h-28 md:w-36 md:h-36 text-slate-700" fill="currentColor">
        <circle cx="40" cy="30" r="16" />
        <ellipse cx="40" cy="72" rx="24" ry="16" />
      </svg>
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: 'linear-gradient(rgba(59,130,246,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.3) 1px, transparent 1px)',
          backgroundSize: '12px 12px',
        }}
      />
      <div className="absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-blue-400/40 to-transparent scan-line" />
    </div>
  );
}

function BehavioralNetwork() {
  const nodes = [
    { cx: 15, cy: 15 }, { cx: 45, cy: 10 }, { cx: 75, cy: 20 },
    { cx: 10, cy: 45 }, { cx: 40, cy: 40 }, { cx: 70, cy: 45 },
    { cx: 25, cy: 70 }, { cx: 55, cy: 75 }, { cx: 85, cy: 65 },
    { cx: 50, cy: 55 },
  ];
  const edges = [
    [0, 1], [1, 2], [0, 3], [1, 4], [2, 5],
    [3, 4], [4, 5], [3, 6], [4, 7], [5, 8],
    [6, 7], [7, 8], [4, 9], [9, 7], [9, 5],
  ];

  return (
    <div className="flex items-center justify-center h-40 md:h-56">
      <svg viewBox="0 0 100 85" className="w-full max-w-xs h-full">
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a].cx} y1={nodes[a].cy}
            x2={nodes[b].cx} y2={nodes[b].cy}
            stroke="rgba(59,130,246,0.15)"
            strokeWidth="0.8"
          />
        ))}
        {nodes.map((n, i) => (
          <circle
            key={i}
            cx={n.cx} cy={n.cy} r="3.5"
            fill="rgba(96,165,250,0.9)"
            className="node-pulse"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </svg>
    </div>
  );
}

/* ── Phase data ────────────────────────────────────────────── */

const phases = [
  {
    label: 'Audio',
    title: 'Audio Detection',
    subtitle: 'Spectral Fingerprinting',
    description: 'Identifies synthetic voice cloning and AI-generated speech in real time. Our spectral analysis engine maps vocal harmonics, detecting even the most convincing voice deepfakes with sub-millisecond precision.',
    Visual: AudioWaveform,
    color: '#22D3EE',
  },
  {
    label: 'Video',
    title: 'Video Detection',
    subtitle: 'Temporal Consistency Analysis',
    description: 'Spots face-swapped and AI-manipulated video feeds frame by frame. Temporal consistency analysis catches artifacts that human eyes miss — micro-expressions, lighting inconsistencies, and compression anomalies.',
    Visual: VideoScanGrid,
    color: '#3B82F6',
  },
  {
    label: 'Behavioral',
    title: 'Behavioral Analysis',
    subtitle: 'Neural Pattern Correlation',
    description: 'Detects unnatural patterns in speech cadence, micro-expressions, and interaction timing. Multi-signal neural correlation builds a behavioral fingerprint that\'s nearly impossible to fake.',
    Visual: BehavioralNetwork,
    color: '#A855F7',
  },
];

/* ── Mobile fallback (stacked layout) ─────────────────────── */

function MobileFeatures() {
  return (
    <div className="lg:hidden space-y-16">
      {phases.map((phase, i) => (
        <motion.div
          key={phase.label}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, delay: i * 0.1 }}
        >
          <div className="rounded-2xl border border-white/[0.06] bg-[#0D1117]/80 backdrop-blur-sm p-6 overflow-hidden">
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-medium tracking-wide uppercase bg-blue-500/10 border border-blue-500/20 mb-5 font-mono"
              style={{ color: phase.color, borderColor: `${phase.color}33`, background: `${phase.color}10` }}
            >
              {phase.label}
            </span>

            <div className="mb-6">
              <phase.Visual />
            </div>

            <h3 className="font-headline text-2xl font-bold text-[#E6EDF3] mb-1">{phase.title}</h3>
            <p className="font-mono text-xs text-[#484F58] uppercase tracking-wider mb-3">{phase.subtitle}</p>
            <p className="font-body text-[#8B949E] leading-relaxed text-sm">{phase.description}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ── Desktop GSAP sticky scroll ───────────────────────────── */

function DesktopFeatures() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activePhase, setActivePhase] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    // Check for reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const trigger = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: `+=${phases.length * 100}%`,
      pin: true,
      scrub: 0.5,
      onUpdate: (self) => {
        const phase = Math.min(
          phases.length - 1,
          Math.floor(self.progress * phases.length)
        );
        setActivePhase(phase);
      },
    });

    return () => {
      trigger.kill();
    };
  }, []);

  return (
    <div ref={sectionRef} className="hidden lg:block min-h-screen">
      <div className="h-screen flex items-center">
        <div className="max-w-6xl mx-auto px-4 w-full">
          <div className="grid grid-cols-2 gap-12 items-center">
            {/* Left: Visual */}
            <div className="relative">
              {phases.map((phase, i) => (
                <div
                  key={phase.label}
                  className="transition-all duration-700 ease-out"
                  style={{
                    position: i === 0 ? 'relative' : 'absolute',
                    inset: i === 0 ? undefined : 0,
                    opacity: activePhase === i ? 1 : 0,
                    transform: activePhase === i ? 'scale(1)' : 'scale(0.95)',
                  }}
                >
                  <div className="rounded-2xl border border-white/[0.06] bg-[#0D1117]/60 p-8">
                    <phase.Visual />
                  </div>
                </div>
              ))}
            </div>

            {/* Right: Copy */}
            <div className="relative">
              {phases.map((phase, i) => (
                <div
                  key={phase.label}
                  className="transition-all duration-700 ease-out"
                  style={{
                    position: i === 0 ? 'relative' : 'absolute',
                    inset: i === 0 ? undefined : 0,
                    opacity: activePhase === i ? 1 : 0,
                    transform: activePhase === i ? 'translateY(0)' : 'translateY(20px)',
                  }}
                >
                  <span
                    className="inline-block px-3 py-1 rounded-full text-xs font-medium tracking-wide uppercase mb-5 font-mono"
                    style={{ color: phase.color, borderColor: `${phase.color}33`, background: `${phase.color}10`, border: `1px solid ${phase.color}33` }}
                  >
                    {phase.label}
                  </span>
                  <h3 className="font-headline text-3xl md:text-4xl font-bold text-[#E6EDF3] mb-2">{phase.title}</h3>
                  <p className="font-mono text-xs text-[#484F58] uppercase tracking-wider mb-4">{phase.subtitle}</p>
                  <p className="font-body text-[#8B949E] leading-relaxed text-base">{phase.description}</p>
                </div>
              ))}

              {/* Phase progress dots */}
              <div className="flex gap-2 mt-8">
                {phases.map((phase, i) => (
                  <div
                    key={i}
                    className="h-1.5 rounded-full transition-all duration-500"
                    style={{
                      width: activePhase === i ? '32px' : '8px',
                      background: activePhase === i ? phase.color : 'rgba(255,255,255,0.1)',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Section ──────────────────────────────────────────────── */

export default function FeaturesSection() {
  return (
    <section id="features" className="relative overflow-hidden">
      <BackgroundLayers section="features" />

      <div className="relative z-10">
        {/* Section header */}
        <div className="max-w-6xl mx-auto px-4 pt-24 md:pt-32 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <span className="font-mono text-[11px] font-medium tracking-[0.2em] uppercase text-[#3B82F6] mb-4 block">
              The Solution
            </span>
            <h2 className="font-headline text-3xl md:text-4xl lg:text-5xl font-bold text-[#E6EDF3] mb-4">
              Three layers of defense
            </h2>
            <p className="font-body text-[#8B949E] max-w-xl mx-auto">
              Working in concert to catch what humans can't see.
            </p>
          </motion.div>
        </div>

        {/* Desktop: GSAP sticky scroll */}
        <DesktopFeatures />

        {/* Mobile: stacked layout */}
        <div className="max-w-6xl mx-auto px-4 pb-24 md:pb-32">
          <MobileFeatures />
        </div>
      </div>
    </section>
  );
}
