import { motion } from 'framer-motion';
import BackgroundLayers from './BackgroundLayers';

/* ── Animated Step Visuals ──────────────────────────────────── */

function RadarScan() {
  return (
    <div className="relative w-36 h-36 mx-auto">
      {/* Concentric rings */}
      {[1, 0.7, 0.4].map((scale, i) => (
        <div
          key={i}
          className="absolute inset-0 rounded-full border border-cyan-400/20"
          style={{ transform: `scale(${scale})`, top: `${(1 - scale) * 50}%`, left: `${(1 - scale) * 50}%`, width: `${scale * 100}%`, height: `${scale * 100}%` }}
        />
      ))}
      {/* Rotating sweep */}
      <div className="absolute inset-0 rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-1/2 w-1/2 h-1/2 origin-bottom-left"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0deg, rgba(34,211,238,0.3) 30deg, transparent 60deg)',
            animation: 'radar-sweep 3s linear infinite',
          }}
        />
      </div>
      {/* Center dot */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.6)]" />
      {/* Blips */}
      <div className="absolute top-[22%] left-[62%] w-2 h-2 rounded-full bg-cyan-400/80 radar-blip" style={{ animationDelay: '0.5s' }} />
      <div className="absolute top-[55%] left-[28%] w-1.5 h-1.5 rounded-full bg-cyan-400/60 radar-blip" style={{ animationDelay: '1.5s' }} />
      <div className="absolute top-[68%] left-[70%] w-1.5 h-1.5 rounded-full bg-red-400/80 radar-blip" style={{ animationDelay: '2.2s' }} />
    </div>
  );
}

function NeuralProcess() {
  const nodes = [
    // Input layer
    { x: 10, y: 20 }, { x: 10, y: 50 }, { x: 10, y: 80 },
    // Hidden layer 1
    { x: 38, y: 15 }, { x: 38, y: 40 }, { x: 38, y: 65 }, { x: 38, y: 85 },
    // Hidden layer 2
    { x: 65, y: 25 }, { x: 65, y: 50 }, { x: 65, y: 75 },
    // Output
    { x: 92, y: 50 },
  ];
  const edges = [
    [0,3],[0,4],[1,3],[1,4],[1,5],[2,4],[2,5],[2,6],
    [3,7],[3,8],[4,7],[4,8],[4,9],[5,8],[5,9],[6,8],[6,9],
    [7,10],[8,10],[9,10],
  ];

  return (
    <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Edges with flowing animation */}
        {edges.map(([a, b], i) => (
          <g key={i}>
            <line
              x1={nodes[a].x} y1={nodes[a].y}
              x2={nodes[b].x} y2={nodes[b].y}
              stroke="rgba(59,130,246,0.12)"
              strokeWidth="0.6"
            />
            {/* Flowing particle on edge */}
            <circle r="1" fill="#3B82F6" opacity="0.8">
              <animateMotion
                dur={`${1.5 + (i % 4) * 0.3}s`}
                repeatCount="indefinite"
                begin={`${(i % 5) * 0.3}s`}
                path={`M${nodes[a].x},${nodes[a].y} L${nodes[b].x},${nodes[b].y}`}
              />
              <animate attributeName="opacity" values="0;0.8;0" dur={`${1.5 + (i % 4) * 0.3}s`} repeatCount="indefinite" begin={`${(i % 5) * 0.3}s`} />
            </circle>
          </g>
        ))}
        {/* Nodes */}
        {nodes.map((n, i) => {
          const isOutput = i === 10;
          const isInput = i < 3;
          const fill = isOutput ? '#22C55E' : isInput ? '#22D3EE' : '#3B82F6';
          return (
            <circle
              key={i}
              cx={n.x} cy={n.y}
              r={isOutput ? 4 : 2.5}
              fill={fill}
              opacity={0.9}
              className="node-pulse"
              style={{ animationDelay: `${i * 0.15}s`, animationDuration: '3s' }}
            />
          );
        })}
        {/* Output glow */}
        <circle cx={92} cy={50} r={8} fill="none" stroke="#22C55E" strokeWidth="0.5" opacity="0.3" className="node-pulse" style={{ animationDuration: '2s' }} />
      </svg>
    </div>
  );
}

function ShieldPulse() {
  return (
    <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
      {/* Expanding pulse rings */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute inset-0 m-auto rounded-full border border-emerald-400/30 shield-pulse-ring"
          style={{
            width: '80%',
            height: '80%',
            animationDelay: `${i * 1.2}s`,
          }}
        />
      ))}
      {/* Shield icon */}
      <svg viewBox="0 0 24 24" className="w-14 h-14 relative z-10" fill="none">
        <path
          d="M12 2L4 6v5c0 5.25 3.4 10.15 8 11.25C16.6 21.15 20 16.25 20 11V6l-8-4z"
          fill="rgba(34,197,94,0.15)"
          stroke="#22C55E"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9 12l2 2 4-4"
          stroke="#22C55E"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="draw-on"
        />
      </svg>
    </div>
  );
}

/* ── Step data ──────────────────────────────────────────────── */

const steps = [
  {
    number: '01',
    title: 'Detect',
    description: 'AI monitors audio and video streams for synthetic manipulation signatures in real time.',
    Visual: RadarScan,
    color: '#22D3EE',
    gradient: 'from-cyan-500/20 to-cyan-500/0',
  },
  {
    number: '02',
    title: 'Analyze',
    description: 'Multi-layer neural networks cross-reference behavioral, vocal, and visual patterns simultaneously.',
    Visual: NeuralProcess,
    color: '#3B82F6',
    gradient: 'from-blue-500/20 to-blue-500/0',
  },
  {
    number: '03',
    title: 'Protect',
    description: 'Instant alerts flag threats before they cause damage — with full audit trail and confidence scoring.',
    Visual: ShieldPulse,
    color: '#22C55E',
    gradient: 'from-emerald-500/20 to-emerald-500/0',
  },
];

/* ── Data stream connector ──────────────────────────────────── */

function DataStream({ from, to }: { from: string; to: string }) {
  return (
    <div className="hidden md:flex items-center justify-center w-16 flex-shrink-0">
      <div className="relative h-full w-[2px]">
        {/* Static line */}
        <div className={`absolute inset-0 bg-gradient-to-b ${from === '#22D3EE' ? 'from-cyan-500/30' : 'from-blue-500/30'} ${to === '#22C55E' ? 'to-emerald-500/30' : 'to-blue-500/30'}`} />
        {/* Flowing particle */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-1.5 h-6 rounded-full data-stream-particle"
          style={{ background: `linear-gradient(to bottom, transparent, ${from}, ${to}, transparent)` }}
        />
      </div>
    </div>
  );
}

/* ── Section ────────────────────────────────────────────────── */

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative py-24 md:py-32 overflow-hidden">
      <BackgroundLayers section="howItWorks" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 w-full">
        {/* Header */}
        <motion.div
          className="text-center mb-16 md:mb-20"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="font-mono text-[11px] font-medium tracking-[0.2em] uppercase text-[#3B82F6] mb-4 block">
            How It Works
          </span>
          <h2 className="font-headline text-3xl md:text-4xl lg:text-5xl font-bold text-[#E6EDF3] mb-4">
            From detection to protection
          </h2>
          <p className="font-body text-[#8B949E] max-w-xl mx-auto">
            Three stages working in concert, end-to-end in milliseconds.
          </p>
        </motion.div>

        {/* Desktop: Horizontal flow */}
        <div className="hidden md:flex items-stretch justify-center gap-0 mb-12">
          {steps.map((step, i) => (
            <div key={step.number} className="contents">
              <motion.div
                className="relative flex-1 max-w-[320px] rounded-2xl border border-white/[0.08] bg-[#0D1117]/80 backdrop-blur-sm overflow-hidden group"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.6, delay: i * 0.2 }}
                whileHover={{ y: -8, transition: { duration: 0.3 } }}
              >
                {/* Top glow gradient */}
                <div
                  className={`absolute top-0 left-0 right-0 h-32 bg-gradient-to-b ${step.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                />

                {/* Background number */}
                <span className="absolute -top-2 -right-2 text-[7rem] font-bold select-none pointer-events-none leading-none font-headline" style={{ color: `${step.color}08` }}>
                  {step.number}
                </span>

                <div className="relative z-10 p-8">
                  {/* Animated visual */}
                  <div className="mb-8">
                    <step.Visual />
                  </div>

                  {/* Step label */}
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className="font-mono text-xs font-bold tracking-wider"
                      style={{ color: step.color }}
                    >
                      {step.number}
                    </span>
                    <div className="h-px flex-1" style={{ background: `linear-gradient(to right, ${step.color}30, transparent)` }} />
                  </div>

                  <h3 className="font-headline text-2xl font-bold text-[#E6EDF3] mb-3">{step.title}</h3>
                  <p className="font-body text-[#8B949E] leading-relaxed text-sm">{step.description}</p>
                </div>

                {/* Bottom accent line */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `linear-gradient(to right, transparent, ${step.color}60, transparent)` }}
                />
              </motion.div>

              {/* Connector between cards */}
              {i < steps.length - 1 && (
                <div className="flex items-center justify-center w-12 flex-shrink-0">
                  <div className="relative">
                    {/* Arrow connector */}
                    <svg width="40" height="24" viewBox="0 0 40 24" fill="none" className="overflow-visible">
                      <line x1="0" y1="12" x2="32" y2="12" stroke={`${steps[i].color}40`} strokeWidth="1.5" strokeDasharray="4 3" />
                      <path d="M28 6 L36 12 L28 18" stroke={steps[i + 1].color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
                      {/* Flowing dot */}
                      <circle r="2.5" fill={steps[i].color} opacity="0.9">
                        <animateMotion dur="2s" repeatCount="indefinite" path="M0,12 L36,12" />
                        <animate attributeName="opacity" values="0;0.9;0" dur="2s" repeatCount="indefinite" />
                      </circle>
                    </svg>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Mobile: Vertical flow */}
        <div className="md:hidden space-y-6 mb-12">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              className="relative rounded-2xl border border-white/[0.08] bg-[#0D1117]/80 p-6 overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <span className="absolute -top-1 -right-1 text-6xl font-bold select-none pointer-events-none leading-none font-headline" style={{ color: `${step.color}08` }}>
                {step.number}
              </span>

              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 flex-shrink-0 [&>div]:!w-full [&>div]:!h-full [&>div]:!mx-0">
                  <step.Visual />
                </div>
                <div>
                  <span className="font-mono text-[10px] font-bold tracking-wider" style={{ color: step.color }}>{step.number}</span>
                  <h3 className="font-headline text-xl font-bold text-[#E6EDF3]">{step.title}</h3>
                </div>
              </div>
              <p className="font-body text-[#8B949E] text-sm leading-relaxed">{step.description}</p>

              {/* Mobile connector */}
              {i < steps.length - 1 && (
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-px h-6" style={{ background: `linear-gradient(to bottom, ${step.color}30, transparent)` }} />
              )}
            </motion.div>
          ))}
        </div>

        {/* Summary badge */}
        <motion.div
          className="flex justify-center"
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full border border-white/[0.06] bg-[#0D1117]/60">
            <div className="w-2 h-2 rounded-full bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            <span className="font-mono text-sm text-[#E6EDF3] font-medium">
              &lt;5ms end-to-end
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
