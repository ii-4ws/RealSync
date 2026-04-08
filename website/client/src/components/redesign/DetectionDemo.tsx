import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AudioLines, Video, Brain } from 'lucide-react';
import DetectionOverlay from './DetectionOverlay';
import BackgroundLayers from './BackgroundLayers';

const annotations = [
  { label: 'Spectral Analysis', position: 'top-4 left-4 md:top-8 md:left-8' },
  { label: 'Temporal Consistency', position: 'top-4 right-4 md:top-8 md:right-8' },
  { label: 'Micro-Expression Mapping', position: 'bottom-14 left-4 md:bottom-20 md:left-8' },
];

const layers = [
  { Icon: AudioLines, label: 'Audio Layer', desc: 'Spectral fingerprinting', color: '#22D3EE' },
  { Icon: Video, label: 'Video Layer', desc: 'Frame-by-frame analysis', color: '#3B82F6' },
  { Icon: Brain, label: 'Behavioral Layer', desc: 'Neural pattern detection', color: '#A855F7' },
];

export default function DetectionDemo() {
  const [activeAnnotation, setActiveAnnotation] = useState(0);

  // Cycle through annotations in sync with detection
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveAnnotation((prev) => (prev + 1) % annotations.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="demo" className="relative py-24 md:py-32 overflow-hidden">
      <BackgroundLayers section="demo" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 w-full">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="font-mono text-[11px] font-medium tracking-[0.2em] uppercase text-[#3B82F6] mb-4 block">
            Live Detection
          </span>
          <h2 className="font-headline text-3xl md:text-4xl lg:text-5xl font-bold text-[#E6EDF3] mb-4">
            See It In Action
          </h2>
          <p className="font-body text-[#8B949E] max-w-xl mx-auto">
            Watch our AI analyze video feeds in real time, identifying synthetic manipulation across multiple dimensions.
          </p>
        </motion.div>

        {/* Large detection overlay */}
        <motion.div
          className="relative max-w-4xl mx-auto mb-12"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7 }}
        >
          <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl shadow-black/30">
            <DetectionOverlay />

            {/* Floating annotation callouts */}
            {annotations.map((ann, i) => (
              <div
                key={ann.label}
                className={`absolute ${ann.position} transition-all duration-500 ${
                  activeAnnotation === i ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                }`}
              >
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0D1117]/80 backdrop-blur-sm border border-white/[0.08]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE] animate-pulse" />
                  <span className="font-mono text-[10px] text-[#22D3EE] uppercase tracking-wider">
                    {ann.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* 3 analysis layer pills */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {layers.map((layer, i) => (
            <motion.div
              key={layer.label}
              className="flex items-center gap-3 p-4 rounded-xl bg-[#0D1117]/60 border border-white/[0.06] backdrop-blur-sm"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${layer.color}12`, border: `1px solid ${layer.color}25` }}
              >
                <layer.Icon className="w-5 h-5" style={{ color: layer.color }} />
              </div>
              <div>
                <div className="text-sm text-[#E6EDF3] font-medium">{layer.label}</div>
                <div className="text-xs text-[#484F58]">{layer.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
