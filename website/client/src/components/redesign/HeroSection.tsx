import { motion } from 'framer-motion';
import DetectionOverlay from './DetectionOverlay';
import BackgroundLayers from './BackgroundLayers';

function smoothScroll(href: string) {
  const el = document.querySelector(href);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function HeroSection() {
  return (
    <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <BackgroundLayers section="hero" />

      {/* Detection video as edge-to-edge background */}
      <DetectionOverlay fullWidth />

      {/* Extra gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#07090E]/70 via-[#07090E]/40 to-[#07090E]/80 z-[1]" />

      {/* Content — centered single column */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="font-mono text-[12px] font-medium tracking-[0.2em] uppercase text-[#22D3EE]">
            Real-Time Meeting Authenticity
          </span>
        </motion.div>

        <motion.h1
          className="font-headline text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-[5.5rem] font-extrabold text-[#E6EDF3] leading-[1.05] mt-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          See what's real.
        </motion.h1>

        <motion.p
          className="font-body text-base sm:text-lg md:text-xl text-[#8B949E] leading-relaxed mt-6 max-w-2xl mx-auto px-2 sm:px-0"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          AI-powered detection for deepfake audio, video, and behavioral manipulation — in real time.
        </motion.p>

        {/* Stat strip */}
        <motion.div
          className="flex items-center justify-center gap-0 mt-8"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          {[
            { value: '<5ms', label: 'Latency' },
            { value: '99.7%', label: 'Accuracy' },
            { value: '3-Layer', label: 'Analysis' },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className={`flex flex-col px-3 sm:px-5 ${i > 0 ? 'border-l border-white/[0.12]' : ''}`}
            >
              <span className="font-mono text-sm sm:text-lg md:text-xl font-bold text-[#E6EDF3]">{stat.value}</span>
              <span className="font-mono text-[9px] sm:text-[10px] text-[#484F58] uppercase tracking-wider mt-0.5">{stat.label}</span>
            </div>
          ))}
        </motion.div>

        {/* CTA button — scrolls to #cta */}
        <motion.div
          className="mt-10"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <a
            href="#cta"
            onClick={(e) => { e.preventDefault(); smoothScroll('#cta'); }}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#3B82F6] hover:bg-blue-600 text-white font-medium text-base transition-colors glow-blue"
          >
            Join the Waitlist
          </a>
        </motion.div>
      </div>

      {/* Bottom fade into next section */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#07090E] to-transparent z-[2]" />
    </section>
  );
}
