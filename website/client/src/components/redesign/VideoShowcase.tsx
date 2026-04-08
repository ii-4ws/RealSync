import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import laptopVideo from '@/assets/laptop-scroll.webm';

export default function VideoShowcase() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          videoRef.current?.play();
        } else {
          videoRef.current?.pause();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} id="demo" className="relative py-24 md:py-32 overflow-hidden">
      <div className="max-w-5xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 30 }}
          animate={isVisible ? { opacity: 1, scale: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="relative"
        >
          {/* Radial blue glow behind */}
          <div
            className="absolute -inset-12 md:-inset-20 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.08) 0%, transparent 70%)',
            }}
          />

          {/* Browser mockup */}
          <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-[#0D1117] shadow-2xl">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 bg-[#161B22] border-b border-white/[0.06]">
              {/* Traffic lights */}
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#484F58]/60" />
                <div className="w-3 h-3 rounded-full bg-[#484F58]/60" />
                <div className="w-3 h-3 rounded-full bg-[#484F58]/60" />
              </div>
              {/* Address bar */}
              <div className="flex-1 flex justify-center">
                <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-[#0D1117] border border-white/[0.06] max-w-xs w-full">
                  <svg className="w-3 h-3 text-[#484F58]" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM4.75 8a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5z" />
                  </svg>
                  <span className="font-mono text-[11px] text-[#8B949E]">real-sync.app</span>
                </div>
              </div>
              <div className="w-[52px]" />
            </div>

            {/* Video content */}
            <div className="aspect-video">
              <video
                ref={videoRef}
                src={laptopVideo}
                muted
                playsInline
                loop
                preload="metadata"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
