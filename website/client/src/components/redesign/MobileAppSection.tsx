import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Shield, Eye, Activity, ShieldCheck, Zap, Bell, Smartphone } from 'lucide-react';
import BackgroundLayers from './BackgroundLayers';
import { BorderBeam } from '@/components/ui/border-beam';
import dashboardImg from '@/assets/screenshots/dashboard.webp';
import sessionsImg from '@/assets/screenshots/sessions.webp';
import detailsImg from '@/assets/screenshots/details.webp';

/* ── Screen Data ────────────────────────────────────────────── */

const screens = [
  { key: 'dashboard', src: dashboardImg, alt: 'Dashboard with 91% Trust Score and live meeting alerts' },
  { key: 'sessions', src: sessionsImg, alt: 'Sessions view with meeting history and trust scores' },
  { key: 'details', src: detailsImg, alt: 'Emotion analysis, identity consistency, and deepfake detection' },
];

/* ── Screen Carousel ─────────────────────────────────────────── */

function ScreenCarousel() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActive((p) => (p + 1) % screens.length), 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-[13.2%/6.6%]">
      <AnimatePresence mode="wait">
        <motion.div
          key={screens[active].key}
          initial={{ scale: 0.95, opacity: 0, filter: 'blur(6px)' }}
          animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
          exit={{ scale: 1.05, opacity: 0, filter: 'blur(6px)' }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="absolute inset-0"
        >
          <img src={screens[active].src} alt={screens[active].alt}
               className="absolute inset-0 w-full h-full object-cover object-top" />
        </motion.div>
      </AnimatePresence>
      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-20">
        {screens.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? 'w-5 bg-cyan-400' : 'w-1.5 bg-white/20'}`}
            aria-label={`Screen ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Floating Notification Bubbles ───────────────────────────── */

const floatingAlerts = [
  { Icon: ShieldCheck, text: 'Identity Verified', color: '#22C55E', position: 'top-[8%] -right-[15%] lg:-right-[30%]' },
  { Icon: Zap, text: 'Deepfake Detected', color: '#EF4444', position: 'top-[35%] -left-[10%] lg:-left-[28%]' },
  { Icon: Eye, text: 'Emotion: Confident', color: '#3B82F6', position: 'bottom-[30%] -right-[12%] lg:-right-[26%]' },
  { Icon: Activity, text: 'Session Active', color: '#22D3EE', position: 'bottom-[8%] -left-[8%] lg:-left-[22%]' },
  { Icon: Bell, text: 'Alert Triggered', color: '#F59E0B', position: 'top-[62%] -right-[8%] lg:-right-[32%]' },
];

function FloatingAlert({ Icon, text, color, position, delay }: typeof floatingAlerts[number] & { delay: number }) {
  return (
    <motion.div
      className={`absolute ${position} z-20 hidden sm:block`}
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
    >
      <motion.div
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0D1117]/90 backdrop-blur-md border border-white/[0.08] shadow-2xl shadow-black/40"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3 + delay, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}15`, border: `1px solid ${color}30` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <span className="text-[10px] text-[#E6EDF3] font-medium whitespace-nowrap">{text}</span>
      </motion.div>
    </motion.div>
  );
}

/* ── Store Badges ────────────────────────────────────────────── */

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M3 20.5v-17c0-.83.52-1.28 1-1.45.48-.17 1.2-.13 1.82.3L22 12l-16.18 9.65c-.62.43-1.34.47-1.82.3-.48-.17-1-.62-1-1.45z" />
    </svg>
  );
}

/* ── Interactive 3D Tilt Phone ────────────────────────────────── */

function InteractivePhone() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    // Detect touch-primary devices (phones/tablets) to disable tilt
    setIsTouchDevice(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  // Mouse position as motion values (raw → spring-smoothed)
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [12, -12]), { stiffness: 150, damping: 20 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-12, 12]), { stiffness: 150, damping: 20 });
  // Glare position follows mouse
  const glareX = useSpring(useTransform(mouseX, [-0.5, 0.5], [20, 80]), { stiffness: 150, damping: 20 });
  const glareY = useSpring(useTransform(mouseY, [-0.5, 0.5], [20, 80]), { stiffness: 150, damping: 20 });
  const glareBackground = useTransform(
    [glareX, glareY],
    ([x, y]) => `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,0.08) 0%, transparent 60%)`
  );

  const updatePosition = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set((clientX - rect.left) / rect.width - 0.5);
    mouseY.set((clientY - rect.top) / rect.height - 0.5);
  }, [mouseX, mouseY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isTouchDevice) return;
    updatePosition(e.clientX, e.clientY);
  }, [updatePosition, isTouchDevice]);

  const resetPosition = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
  }, [mouseX, mouseY]);

  return (
    <div className="relative">
      {/* Radar pulse rings behind phone — smaller on mobile */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute rounded-full border border-cyan-400/10 phone-radar-ring"
            style={{
              width: `min(${280 + i * 80}px, ${75 + i * 15}vw)`,
              height: `min(${280 + i * 80}px, ${75 + i * 15}vw)`,
              animationDelay: `${i * 1.5}s`,
            }}
          />
        ))}
      </div>

      {/* Glow aura — responsive size */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px] sm:w-[300px] h-[240px] sm:h-[300px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(34,211,238,0.08) 0%, rgba(59,130,246,0.04) 50%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* Floating notification bubbles — hidden on mobile (sm:block already in FloatingAlert) */}
      {floatingAlerts.map((alert, i) => (
        <FloatingAlert key={alert.text} {...alert} delay={0.3 + i * 0.15} />
      ))}

      {/* Interactive tilt container — desktop only (no touch-none, no touch events) */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={resetPosition}
        className={`relative ${isTouchDevice ? '' : 'cursor-grab active:cursor-grabbing'}`}
        style={{ perspective: '1000px' }}
      >
        <motion.div
          className="relative phone-float"
          style={isTouchDevice ? {} : { rotateX, rotateY, transformStyle: 'preserve-3d' }}
          initial={{ opacity: 0, y: 60 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <div className="relative w-[200px] sm:w-[240px] md:w-[270px] lg:w-[290px]">
            {/* Specular glare overlay — desktop only */}
            {!isTouchDevice && (
              <motion.div
                className="absolute inset-0 z-[4] rounded-[17%/8.3%] pointer-events-none"
                style={{ background: glareBackground }}
              />
            )}

            {/* Screen content */}
            <div
              className="absolute z-[1] overflow-hidden"
              style={{
                left: '4.9%',
                top: '2.18%',
                width: '89.95%',
                height: '95.64%',
                borderRadius: '13.2% / 6.6%',
              }}
            >
              <ScreenCarousel />
            </div>

            {/* iPhone SVG frame */}
            <svg
              viewBox="0 0 433 882"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="relative z-[2] w-full pointer-events-none"
            >
              <defs>
                <mask id="screenPunchMobile" maskUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="433" height="882" fill="white" />
                  <rect x="21.25" y="19.25" width="389.5" height="843.5" rx="55.75" ry="55.75" fill="black" />
                </mask>
              </defs>
              <g mask="url(#screenPunchMobile)">
                <path d="M2 73C2 32.6832 34.6832 0 75 0H357C397.317 0 430 32.6832 430 73V809C430 849.317 397.317 882 357 882H75C34.6832 882 2 849.317 2 809V73Z" fill="#404040" />
                <path d="M0 171C0 170.448 0.447715 170 1 170H3V204H1C0.447715 204 0 203.552 0 203V171Z" fill="#404040" />
                <path d="M1 234C1 233.448 1.44772 233 2 233H3.5V300H2C1.44772 300 1 299.552 1 299V234Z" fill="#404040" />
                <path d="M1 319C1 318.448 1.44772 318 2 318H3.5V385H2C1.44772 385 1 384.552 1 384V319Z" fill="#404040" />
                <path d="M430 279H432C432.552 279 433 279.448 433 280V384C433 384.552 432.552 385 432 385H430V279Z" fill="#404040" />
                <path d="M6 74C6 35.3401 37.3401 4 76 4H356C394.66 4 426 35.3401 426 74V808C426 846.66 394.66 878 356 878H76C37.3401 878 6 846.66 6 808V74Z" fill="#262626" />
              </g>
              <path opacity="0.5" d="M174 5H258V5.5C258 6.60457 257.105 7.5 256 7.5H176C174.895 7.5 174 6.60457 174 5.5V5Z" fill="#404040" />
              <path d="M21.25 75C21.25 44.2101 46.2101 19.25 77 19.25H355C385.79 19.25 410.75 44.2101 410.75 75V807C410.75 837.79 385.79 862.75 355 862.75H77C46.2101 862.75 21.25 837.79 21.25 807V75Z" fill="transparent" stroke="#404040" strokeWidth="0.5" mask="url(#screenPunchMobile)" />
              <path d="M154 48.5C154 38.2827 162.283 30 172.5 30H259.5C269.717 30 278 38.2827 278 48.5C278 58.7173 269.717 67 259.5 67H172.5C162.283 67 154 58.7173 154 48.5Z" fill="#262626" />
              <path d="M249 48.5C249 42.701 253.701 38 259.5 38C265.299 38 270 42.701 270 48.5C270 54.299 265.299 59 259.5 59C253.701 59 249 54.299 249 48.5Z" fill="#262626" />
              <path d="M254 48.5C254 45.4624 256.462 43 259.5 43C262.538 43 265 45.4624 265 48.5C265 51.5376 262.538 54 259.5 54C256.462 54 254 51.5376 254 48.5Z" fill="#404040" />
            </svg>

            {/* Border beam glow */}
            <div className="absolute inset-0 z-[3] rounded-[17%/8.3%] overflow-hidden pointer-events-none">
              <BorderBeam size={120} duration={8} colorFrom="#22D3EE" colorTo="#3B82F6" borderWidth={2} />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/* ── Main Section ────────────────────────────────────────────── */

export default function MobileAppSection() {
  return (
    <section id="mobile-app" className="relative py-24 lg:py-36 overflow-hidden">
      <BackgroundLayers section="mobileApp" />

      <div className="relative z-10 max-w-6xl mx-auto px-4">
        {/* Two-column layout: Copy left, Phone right */}
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-8">

          {/* Left: Copy + Store badges */}
          <div className="flex-1 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5 }}
              className="inline-block font-mono text-xs uppercase tracking-widest text-cyan-400 mb-4"
            >
              Mobile App
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="font-headline text-3xl sm:text-4xl lg:text-5xl font-bold text-[#E6EDF3] mb-5"
            >
              Security In<br className="hidden lg:block" /> Your Pocket
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="font-body text-[#8B949E] text-base sm:text-lg max-w-lg mx-auto lg:mx-0 mb-8"
            >
              Every alert, every report, every live session — right where you need it. Real-time protection that travels with you.
            </motion.p>

            {/* Feature highlights */}
            <motion.div
              className="grid grid-cols-2 gap-3 max-w-sm mx-auto lg:mx-0 mb-10"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              {[
                { Icon: Shield, label: 'Live Alerts', color: '#22D3EE' },
                { Icon: Eye, label: 'Session Monitoring', color: '#3B82F6' },
                { Icon: Activity, label: 'Trust Scores', color: '#22C55E' },
                { Icon: Smartphone, label: 'Offline Mode', color: '#A855F7' },
              ].map((f, i) => (
                <motion.div
                  key={f.label}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]"
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: 0.4 + i * 0.08 }}
                >
                  <f.Icon className="w-4 h-4 flex-shrink-0" style={{ color: f.color }} />
                  <span className="text-xs text-[#E6EDF3] font-medium">{f.label}</span>
                </motion.div>
              ))}
            </motion.div>

            {/* Store Badges */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="flex flex-col sm:flex-row justify-center lg:justify-start gap-3"
            >
              <div className="flex items-center gap-3 px-5 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-cyan-500/20 hover:bg-white/[0.04] transition-all group">
                <AppleIcon />
                <div>
                  <div className="text-[10px] text-[#484F58] group-hover:text-[#8B949E] leading-none transition-colors">Coming Soon on</div>
                  <div className="text-sm font-semibold text-[#E6EDF3]">App Store</div>
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-cyan-500/20 hover:bg-white/[0.04] transition-all group">
                <PlayIcon />
                <div>
                  <div className="text-[10px] text-[#484F58] group-hover:text-[#8B949E] leading-none transition-colors">Coming Soon on</div>
                  <div className="text-sm font-semibold text-[#E6EDF3]">Google Play</div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right: Interactive 3D tilt phone with effects */}
          <div className="flex-1 flex justify-center">
            <InteractivePhone />
          </div>
        </div>
      </div>
    </section>
  );
}
