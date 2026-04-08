import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import logo from '@/assets/realsync-logo.png';
import WaitlistSection from '@/components/WaitlistSection';

gsap.registerPlugin(ScrollTrigger);

export default function Landing() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const headerLogoRef = useRef<HTMLImageElement>(null);
  const contentStackRef = useRef<HTMLDivElement>(null);
  const sloganRef = useRef<HTMLDivElement>(null);
  const hookRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !stickyRef.current) return;

    const container = containerRef.current;
    const sticky = stickyRef.current;

    // Create the main scroll trigger for the sticky container
    const mainTrigger = ScrollTrigger.create({
      trigger: container,
      start: 'top top',
      end: 'bottom top',
      pin: sticky,
      pinSpacing: false,
      onUpdate: (self) => {
        const progress = self.progress;

        // Phase 1: Initial state (0%-20%)
        // Logo is large and centered, content stack hidden
        if (progress <= 0.2) {
          gsap.set(logoRef.current, {
            scale: 1.2,
            x: 0,
            y: 0,
            opacity: 1,
          });
          
          gsap.set(headerLogoRef.current, {
            scale: 0,
            opacity: 0,
          });
          
          gsap.set(contentStackRef.current, {
            opacity: 0,
            y: 50,
          });
        }
        // Phase 2: Logo moves to header, content stack appears (20%-50%)
        else if (progress <= 0.5) {
          const phaseProgress = (progress - 0.2) / (0.5 - 0.2);
          
          // Center logo scales down and moves to top-left
          const logoScale = gsap.utils.interpolate(1.2, 0.15, phaseProgress);
          const logoX = gsap.utils.interpolate(0, -window.innerWidth / 2 + 60, phaseProgress);
          const logoY = gsap.utils.interpolate(0, -window.innerHeight / 2 + 30, phaseProgress);
          const logoOpacity = gsap.utils.interpolate(1, 0, phaseProgress);
          
          gsap.set(logoRef.current, {
            scale: logoScale,
            x: logoX,
            y: logoY,
            opacity: logoOpacity,
          });
          
          // Header logo appears
          const headerLogoScale = gsap.utils.interpolate(0, 1, phaseProgress);
          gsap.set(headerLogoRef.current, {
            scale: headerLogoScale,
            opacity: 1,
          });
          
          // Content stack appears
          const contentOpacity = gsap.utils.interpolate(0, 1, phaseProgress);
          gsap.set(contentStackRef.current, {
            opacity: contentOpacity,
            y: gsap.utils.interpolate(50, 0, phaseProgress),
          });
          
          // Slogan visible, hook hidden
          gsap.set(sloganRef.current, {
            opacity: 1,
            scale: 1,
            y: 0,
          });
          
          gsap.set(hookRef.current, {
            opacity: 0,
            scale: 0.95,
            y: 20,
          });
        }
        // Phase 3: Slogan fades out, hook fades in (50%-80%)
        else if (progress <= 0.8) {
          const phaseProgress = (progress - 0.5) / (0.8 - 0.5);
          
          // Logo stays in header
          gsap.set(logoRef.current, {
            scale: 0,
            opacity: 0,
          });
          
          gsap.set(headerLogoRef.current, {
            scale: 1,
            opacity: 1,
          });
          
          // Content stack stays visible
          gsap.set(contentStackRef.current, {
            opacity: 1,
            y: 0,
          });
          
          // Slogan fades out
          const sloganOpacity = gsap.utils.interpolate(1, 0, phaseProgress);
          gsap.set(sloganRef.current, {
            opacity: sloganOpacity,
            scale: 1,
            y: 0,
          });
          
          // Hook fades in
          const hookOpacity = gsap.utils.interpolate(0, 1, phaseProgress);
          gsap.set(hookRef.current, {
            opacity: hookOpacity,
            scale: gsap.utils.interpolate(0.95, 1, phaseProgress),
            y: gsap.utils.interpolate(20, 0, phaseProgress),
          });
        }
        // Phase 4: Final state (80%-100%)
        else {
          // Logo in header
          gsap.set(logoRef.current, {
            scale: 0,
            opacity: 0,
          });
          
          gsap.set(headerLogoRef.current, {
            scale: 1,
            opacity: 1,
          });
          
          // Content stack visible
          gsap.set(contentStackRef.current, {
            opacity: 1,
            y: 0,
          });
          
          // Slogan completely hidden
          gsap.set(sloganRef.current, {
            opacity: 0,
            scale: 1,
            y: 0,
          });
          
          // Hook fully visible
          gsap.set(hookRef.current, {
            opacity: 1,
            scale: 1,
            y: 0,
          });
        }
      },
    });

    return () => {
      mainTrigger.kill();
    };
  }, []);

  return (
    <div className="bg-black">
      {/* Fixed header with logo dock */}
      <div
        ref={headerRef}
        className="fixed top-0 left-0 right-0 h-20 bg-gradient-to-b from-slate-950 to-slate-900/80 backdrop-blur-sm z-50 flex items-center px-8 border-b border-slate-800"
      >
        <img
          ref={headerLogoRef}
          src={logo}
          alt="RealSync Logo"
          className="h-12 w-12 object-contain"
          style={{
            transform: 'translate3d(0, 0, 0)',
          }}
        />
      </div>

      {/* Scroll-driven animation container */}
      <div
        ref={containerRef}
        className="relative w-full"
        style={{ height: '220vh' }}
      >
        {/* Sticky scroll container */}
        <div
          ref={stickyRef}
          className="relative w-full h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black flex items-center justify-center overflow-hidden"
        >
          {/* Center logo */}
          <img
            ref={logoRef}
            src={logo}
            alt="RealSync Logo"
            className="absolute w-48 h-48 object-contain will-change-transform"
            style={{
              transform: 'translate3d(0, 0, 0)',
            }}
          />

          {/* Content stack - slogan and hook stacked vertically */}
          <div
            ref={contentStackRef}
            className="absolute flex flex-col items-center justify-center gap-8 max-w-3xl px-6 will-change-transform"
            style={{
              transform: 'translate3d(0, 0, 0)',
            }}
          >
            {/* Slogan - appears first */}
            <div
              ref={sloganRef}
              className="text-center will-change-transform pointer-events-none"
              style={{
                transform: 'translate3d(0, 0, 0)',
              }}
            >
              <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight">
                See what's real
              </h1>
            </div>

            {/* Hook sentence - appears after slogan */}
            <div
              ref={hookRef}
              className="text-center will-change-transform pointer-events-none"
              style={{
                transform: 'translate3d(0, 0, 0)',
              }}
            >
              <p className="text-lg md:text-xl text-gray-300 leading-relaxed">
                Trust Every Voice. Verify Every Face. RealSync detects deepfake audio, video, and behavioral manipulation in real time — before fraud happens.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Waitlist section — flows naturally after the scroll animation */}
      <WaitlistSection />
    </div>
  );
}
