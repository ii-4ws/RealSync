import { motion } from 'framer-motion';
import WaitlistForm from './WaitlistForm';
import ContactForm from '@/components/ContactForm';
import BackgroundLayers from './BackgroundLayers';
import { BorderBeam } from '@/components/ui/border-beam';
import bgVideo from '@/assets/realsync-bg.mp4';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';

export default function CtaSection() {
  return (
    <section id="cta" className="relative py-24 md:py-32 overflow-hidden">
      <BackgroundLayers section="cta" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-stretch">
          {/* Left — Editorial quote + background video */}
          <motion.div
            className="relative rounded-2xl overflow-hidden min-h-[240px] md:min-h-[320px] flex items-end p-6 sm:p-8 md:p-12"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            {/* Video background */}
            <video
              src={bgVideo}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#07090E] via-[#07090E]/80 to-[#07090E]/40" />

            {/* Scanning line overlay */}
            <div
              className="absolute left-0 right-0 h-[1px] opacity-30"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, #22D3EE 30%, #22D3EE 70%, transparent 100%)',
                animation: 'scan-h 4s linear infinite',
              }}
            />

            {/* Quote */}
            <div className="relative z-10">
              <blockquote className="font-headline text-xl md:text-2xl lg:text-3xl font-bold text-[#E6EDF3] leading-snug">
                "In 2026, seeing is no longer believing.
                <span className="text-[#3B82F6]"> Be ready.</span>"
              </blockquote>
            </div>
          </motion.div>

          {/* Right — Waitlist form card with BorderBeam */}
          <motion.div
            className="relative rounded-2xl border border-white/[0.06] bg-[#0D1117]/80 backdrop-blur-sm p-6 sm:p-8 md:p-10 flex flex-col justify-center overflow-hidden"
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            {/* BorderBeam glow */}
            <BorderBeam size={100} duration={10} colorFrom="#3B82F6" colorTo="#22D3EE" borderWidth={1.5} />

            <h2 className="font-headline text-2xl md:text-3xl font-bold text-[#E6EDF3] mb-2">
              Be first to know.
            </h2>
            <p className="font-body text-[#8B949E] mb-8">
              Join the waitlist and get early access when we launch.
            </p>

            <WaitlistForm id="cta" />

            {/* Contact dialog */}
            <div className="mt-6 text-center">
              <Dialog>
                <DialogTrigger asChild>
                  <button className="font-body text-sm text-[#484F58] hover:text-[#3B82F6] underline underline-offset-4 transition-colors">
                    Have a question? Contact us
                  </button>
                </DialogTrigger>
                <DialogContent className="bg-[#0D1117] border-white/[0.08] text-white max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-[#E6EDF3] font-headline">Contact Us</DialogTitle>
                    <DialogDescription className="text-[#8B949E] font-body">
                      Send us a message and we'll get back to you.
                    </DialogDescription>
                  </DialogHeader>
                  <ContactForm />
                </DialogContent>
              </Dialog>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
