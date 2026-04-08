import { motion } from 'framer-motion';
import { Building2, Landmark, Radio, Scale, HeartPulse } from 'lucide-react';
import BackgroundLayers from './BackgroundLayers';

const industries = [
  { Icon: Building2, label: 'Financial Services' },
  { Icon: Landmark, label: 'Government' },
  { Icon: Radio, label: 'Media' },
  { Icon: Scale, label: 'Legal' },
  { Icon: HeartPulse, label: 'Healthcare' },
];

const metrics = [
  { value: '99.7%', label: 'Accuracy' },
  { value: '<5ms', label: 'Latency' },
  { value: '3', label: 'AI Models' },
  { value: '24/7', label: 'Monitoring' },
];

export default function SocialProofSection() {
  return (
    <section id="proof" className="relative py-24 md:py-32 overflow-hidden">
      <BackgroundLayers section="socialProof" />

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
            Built For
          </span>
          <h2 className="font-headline text-3xl md:text-4xl lg:text-5xl font-bold text-[#E6EDF3] mb-4">
            Trusted Across Industries
          </h2>
          <p className="font-body text-[#8B949E] max-w-xl mx-auto">
            Designed for organizations where authenticity is mission-critical.
          </p>
        </motion.div>

        {/* Industry pills */}
        <motion.div
          className="flex flex-wrap justify-center gap-3 mb-16"
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {industries.map((industry, i) => (
            <motion.div
              key={industry.label}
              className="flex items-center gap-2.5 px-5 py-3 rounded-full border border-white/[0.08] bg-[#0D1117]/60 backdrop-blur-sm hover:border-blue-500/20 hover:bg-white/[0.03] transition-all"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: 0.15 + i * 0.08 }}
            >
              <industry.Icon className="w-4 h-4 text-[#3B82F6]" />
              <span className="text-sm text-[#E6EDF3] font-medium">{industry.label}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Metrics row */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="text-center p-4 sm:p-6 rounded-2xl border border-white/[0.06] bg-[#0D1117]/40"
            >
              <div className="font-mono text-xl sm:text-2xl md:text-3xl font-bold text-[#E6EDF3] mb-1">
                {metric.value}
              </div>
              <div className="font-mono text-[10px] text-[#484F58] uppercase tracking-wider">
                {metric.label}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
