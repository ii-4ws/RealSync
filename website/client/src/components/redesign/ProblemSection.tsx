import { motion } from 'framer-motion';
import AnimatedCounter from './AnimatedCounter';

export default function ProblemSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center bg-black">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-sm md:text-base tracking-[0.3em] uppercase text-gray-500 mb-6">
            Annual losses to deepfake fraud
          </p>

          <div className="relative inline-block glitch-burst">
            <AnimatedCounter
              from={2_600_000_000}
              target={2_700_000_000}
              prefix="$"
              duration={2.5}
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-white"
            />
          </div>

          <motion.p
            className="mt-8 text-lg md:text-xl text-gray-400 max-w-lg mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            And it's growing. Every call, every video, every transaction is a potential target.
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
