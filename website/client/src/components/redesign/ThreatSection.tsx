import { motion } from 'framer-motion';
import AnimatedCounter from './AnimatedCounter';
import GlitchText from './GlitchText';
import BackgroundLayers from './BackgroundLayers';

const threatPills = ['Voice Cloning', 'Face Swaps', 'Synthetic Video', 'AI Manipulation'];

export default function ThreatSection() {
  return (
    <section id="threat" className="relative py-24 md:py-32 overflow-hidden">
      <BackgroundLayers section="threat" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <span className="font-mono text-[11px] font-medium tracking-[0.2em] uppercase text-red-400 mb-6 block">
            The Threat
          </span>

          {/* Large animated counter with glitch */}
          <div className="mb-4">
            <GlitchText as="span" className="font-mono text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold text-[#E6EDF3] leading-none">
              <AnimatedCounter
                target={2700000000}
                from={2600000000}
                prefix="$"
                duration={2.5}
              />
            </GlitchText>
          </div>

          <motion.p
            className="font-mono text-sm text-red-400/80 mb-8"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            Annual losses from deepfake fraud — growing <span className="text-red-300 font-bold">+40% YoY</span>
          </motion.p>
        </motion.div>

        <motion.p
          className="font-body text-lg md:text-xl text-[#8B949E] leading-relaxed max-w-2xl mx-auto text-center mb-10"
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Deepfake technology is evolving faster than traditional security can respond.
          From CEO impersonation to synthetic identity fraud, the threat landscape is expanding exponentially.
        </motion.p>

        {/* Threat pills */}
        <motion.div
          className="flex flex-wrap justify-center gap-3"
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          {threatPills.map((tag, i) => (
            <motion.span
              key={tag}
              className="font-mono text-[11px] uppercase tracking-wider text-red-300/70 px-4 py-2 rounded-full border border-red-500/15 bg-red-500/[0.06]"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: 0.5 + i * 0.1 }}
            >
              {tag}
            </motion.span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
