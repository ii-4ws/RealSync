import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import logo from '@/assets/realsync-logo.png';
import baymaxGif from '@/assets/baymax1.gif';
import deepfakeWebm from '@/assets/deepfake.webm';
import laptopScrollWebm from '@/assets/laptop-scroll.webm';
import realsyncBg from '@/assets/realsync-bg.mp4';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PinnedStorySection from '@/components/landing-1/PinnedStorySection';
import DeepfakeVideo from '@/components/landing-1/DeepfakeVideo';
import MediaFrame from '@/components/landing-1/MediaFrame';
import { waitlistSchema, submitWaitlist, type WaitlistData } from '@/lib/waitlist';

gsap.registerPlugin(ScrollTrigger);

// ── Inline form component (lives inside the sticky viewport) ──────────
function InlineWaitlistForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<WaitlistData>({
    resolver: zodResolver(waitlistSchema),
    defaultValues: { firstName: '', lastName: '', email: '', honeypot: '' },
  });

  const onSubmit = async (data: WaitlistData) => {
    if (data.honeypot) {
      setSubmitted(true);
      reset();
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await submitWaitlist({ firstName: data.firstName, lastName: data.lastName, email: data.email });
      if (!isMounted.current) return;
      if (result === 'duplicate') {
        toast.info("You're already on the list!");
      } else {
        toast.success("You're on the list! We'll notify you at launch.");
      }
      setSubmitted(true);
      reset();
    } catch {
      if (!isMounted.current) return;
      toast.error('Something went wrong. Please try again.');
    } finally {
      if (isMounted.current) setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
        Get early access
      </h2>
      <p className="text-gray-400 text-base leading-relaxed mb-8">
        Join the waitlist to know when RealSync launches.
      </p>

      <div className="relative pt-16 md:pt-24">
        <img
          src={baymaxGif}
          alt=""
          aria-hidden="true"
          className="absolute bottom-67 left-100 -translate-x-1/2 z-10 w-40 md:w-56 object-contain pointer-events-none select-none"
        />

        <div className="relative rounded-2xl border border-slate-800/60 bg-slate-900/50 backdrop-blur-sm p-6 md:p-8">
          {submitted ? (
            <div className="text-center py-6">
              <p className="text-xl font-semibold text-white mb-2">You're in!</p>
              <p className="text-gray-400">We'll reach out as soon as RealSync is ready.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label htmlFor="v1-first-name" className="block text-sm font-medium text-gray-300 mb-2">
                  First Name
                </label>
                <Input
                  id="v1-first-name"
                  {...register('firstName')}
                  placeholder="First name"
                  disabled={isSubmitting}
                  className="w-full bg-slate-800/50 border-slate-700 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
                />
                {errors.firstName && <p className="text-xs text-red-400 mt-1">{errors.firstName.message}</p>}
              </div>

              <div>
                <label htmlFor="v1-last-name" className="block text-sm font-medium text-gray-300 mb-2">
                  Last Name
                </label>
                <Input
                  id="v1-last-name"
                  {...register('lastName')}
                  placeholder="Last name"
                  disabled={isSubmitting}
                  className="w-full bg-slate-800/50 border-slate-700 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
                />
                {errors.lastName && <p className="text-xs text-red-400 mt-1">{errors.lastName.message}</p>}
              </div>

              <div>
                <label htmlFor="v1-email" className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <Input
                  id="v1-email"
                  type="email"
                  {...register('email')}
                  placeholder="you@company.com"
                  disabled={isSubmitting}
                  className="w-full bg-slate-800/50 border-slate-700 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
                />
                {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>}
              </div>

              <input {...register('honeypot')} type="text" aria-hidden="true" style={{ position: 'absolute', left: '-9999px', opacity: 0 }} tabIndex={-1} autoComplete="off" />

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Joining...
                  </>
                ) : (
                  'Join the waitlist'
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────
export default function Landing1() {
  // Original refs
  const containerRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const headerLogoRef = useRef<HTMLImageElement>(null);
  const contentStackRef = useRef<HTMLDivElement>(null);
  const sloganRef = useRef<HTMLDivElement>(null);
  const hookRef = useRef<HTMLDivElement>(null);
  const formPanelRef = useRef<HTMLDivElement>(null);

  // Section A refs (Deepfake demo + definition)
  const sectionARef = useRef<HTMLDivElement>(null);
  const sectionATextRef = useRef<HTMLDivElement>(null);

  // Section B refs (Laptop demo + stats)
  const sectionBRef = useRef<HTMLDivElement>(null);
  const sectionBMediaRef = useRef<HTMLDivElement>(null);
  const sectionBTextRef = useRef<HTMLDivElement>(null);
  const laptopVideoRef = useRef<HTMLVideoElement>(null);

  // 50/50 split background ref
  const splitBgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !stickyRef.current) return;

    const container = containerRef.current;
    const sticky = stickyRef.current;
    let isMounted = true;

    // Read viewport dimensions live inside onUpdate to handle resize/rotate
    const getVw = () => window.innerWidth;
    const getVh = () => window.innerHeight;
    const getIsMobile = () => window.innerWidth < 768;

    const laptopWrap = sectionBMediaRef.current;
    const getLaptopCenterX = () => {
      if (!laptopWrap) return 0;
      return (getVw() / 2) - (laptopWrap.getBoundingClientRect().left + laptopWrap.getBoundingClientRect().width / 2);
    };
    // Cache initial value for non-onUpdate usage
    let laptopCenterX = getLaptopCenterX();

    // Helper: hide both story sections
    const hideSections = () => {
      gsap.set(sectionARef.current, { opacity: 0, y: 0 });
      gsap.set(sectionATextRef.current, { opacity: 0, y: 60 });
      gsap.set(sectionBRef.current, { opacity: 0, y: 0 });
      // Laptop: pre-position for next P6 entry (centered, big)
      gsap.set(sectionBMediaRef.current, { x: laptopCenterX, scale: 1.3 });
      // Number: hidden, ready for timeline reveal
      gsap.set(sectionBTextRef.current, { opacity: 0, x: 0, y: 60 });
    };

    // Helper: set form panel + split bg to off-screen initial state
    const hideForm = () => {
      gsap.set(formPanelRef.current, {
        opacity: 0,
        x: isMobile ? 0 : vw * 0.5,
        y: isMobile ? 100 : 0,
      });
      gsap.set(splitBgRef.current, { opacity: 0 });
    };

    const mainTrigger = ScrollTrigger.create({
      trigger: container,
      start: 'top top',
      end: 'bottom top',
      pin: sticky,
      pinSpacing: false,
      onUpdate: (self) => {
        const progress = self.progress;
        const vw = getVw();
        const vh = getVh();
        const isMobile = getIsMobile();
        laptopCenterX = getLaptopCenterX();

        // ─── P1: Logo large + centered (0% – 3.5%) ────────────────
        if (progress <= 0.035) {
          gsap.set(logoRef.current, { scale: 1.2, x: 0, y: 0, opacity: 1 });
          gsap.set(headerLogoRef.current, { scale: 0, opacity: 0 });
          gsap.set(contentStackRef.current, { opacity: 0, x: 0, y: 50 });
          gsap.set(sloganRef.current, { opacity: 0 });
          gsap.set(hookRef.current, { opacity: 0, y: 20 });
          hideSections();
          hideForm();
        }

        // ─── P2: Logo docks to header, slogan appears (3.5% – 8%) ──
        else if (progress <= 0.080) {
          const p = (progress - 0.035) / 0.045;

          gsap.set(logoRef.current, {
            scale: gsap.utils.interpolate(1.2, 0.15, p),
            x: gsap.utils.interpolate(0, -vw / 2 + 60, p),
            y: gsap.utils.interpolate(0, -vh / 2 + 30, p),
            opacity: gsap.utils.interpolate(1, 0, p),
          });
          gsap.set(headerLogoRef.current, {
            scale: gsap.utils.interpolate(0, 1, p),
            opacity: 1,
          });
          gsap.set(contentStackRef.current, {
            opacity: gsap.utils.interpolate(0, 1, p),
            x: 0,
            y: gsap.utils.interpolate(50, 0, p),
          });
          gsap.set(sloganRef.current, { opacity: 1 });
          gsap.set(hookRef.current, { opacity: 0, y: 20 });
          hideSections();
          hideForm();
        }

        // ─── P3: Cross-fade — content out, Section A in (8% – 10.4%) ──
        else if (progress <= 0.104) {
          const p = (progress - 0.080) / 0.024;

          gsap.set(logoRef.current, { scale: 0, opacity: 0 });
          gsap.set(headerLogoRef.current, { scale: 1, opacity: 1 });
          gsap.set(contentStackRef.current, {
            opacity: gsap.utils.interpolate(1, 0, p),
            x: 0,
            y: 0,
          });
          gsap.set(sloganRef.current, { opacity: 1 });
          gsap.set(hookRef.current, { opacity: 0, y: 20 });

          // Section A fades in
          gsap.set(sectionARef.current, {
            opacity: gsap.utils.interpolate(0, 1, p),
            y: 0,
          });
          gsap.set(sectionATextRef.current, { opacity: 0, y: 60 });

          // Section B hidden
          gsap.set(sectionBRef.current, { opacity: 0, y: 0 });
          gsap.set(sectionBMediaRef.current, { x: laptopCenterX, scale: 1.3 });
          gsap.set(sectionBTextRef.current, { opacity: 0, x: 0, y: 60 });
          hideForm();
        }

        // ─── P4: Section A active — text enters from below (10.4% – 16.7%) ──
        else if (progress <= 0.167) {
          const p = (progress - 0.104) / 0.063;

          gsap.set(logoRef.current, { scale: 0, opacity: 0 });
          gsap.set(headerLogoRef.current, { scale: 1, opacity: 1 });
          gsap.set(contentStackRef.current, { opacity: 0, x: 0, y: 0 });
          gsap.set(hookRef.current, { opacity: 0, y: 20 });

          // Section A: media visible, text animates in
          gsap.set(sectionARef.current, { opacity: 1, y: 0 });
          gsap.set(sectionATextRef.current, {
            opacity: gsap.utils.interpolate(0, 1, p),
            y: gsap.utils.interpolate(60, 0, p),
          });

          // Section B hidden
          gsap.set(sectionBRef.current, { opacity: 0, y: 0 });
          gsap.set(sectionBMediaRef.current, { x: laptopCenterX, scale: 1.3 });
          gsap.set(sectionBTextRef.current, { opacity: 0, x: 0, y: 60 });
          hideForm();
        }

        // ─── P5: Section A exit — fade out + move up (16.7% – 18.4%) ──
        else if (progress <= 0.184) {
          const p = (progress - 0.167) / 0.017;

          gsap.set(logoRef.current, { scale: 0, opacity: 0 });
          gsap.set(headerLogoRef.current, { scale: 1, opacity: 1 });
          gsap.set(contentStackRef.current, { opacity: 0, x: 0, y: 0 });
          gsap.set(hookRef.current, { opacity: 0, y: 20 });

          // Section A fades out + moves up
          gsap.set(sectionARef.current, {
            opacity: gsap.utils.interpolate(1, 0, p),
            y: gsap.utils.interpolate(0, -40, p),
          });
          gsap.set(sectionATextRef.current, { opacity: 1, y: 0 });

          // Section B starts entering
          gsap.set(sectionBRef.current, {
            opacity: gsap.utils.interpolate(0, 1, p),
            y: 0,
          });
          gsap.set(sectionBMediaRef.current, { x: laptopCenterX, scale: 1.3 });
          gsap.set(sectionBTextRef.current, { opacity: 0, x: 0, y: 60 });
          hideForm();
        }

        // ─── P6: Section B active — timeline controls video + number (18.4% – 67.9%) ──
        else if (progress <= 0.679) {
          gsap.set(logoRef.current, { scale: 0, opacity: 0 });
          gsap.set(headerLogoRef.current, { scale: 1, opacity: 1 });
          gsap.set(contentStackRef.current, { opacity: 0, x: 0, y: 0 });
          gsap.set(hookRef.current, { opacity: 0, y: 20 });

          // Section A fully hidden
          gsap.set(sectionARef.current, { opacity: 0, y: -40 });
          gsap.set(sectionATextRef.current, { opacity: 0, y: 0 });

          // Section B visible — video scrub, laptop movement, number handled by timeline
          gsap.set(sectionBRef.current, { opacity: 1, y: 0 });
          // sectionBMediaRef + sectionBTextRef controlled by dedicated timeline
          hideForm();
        }

        // ─── P7: Section B exit — fade out + move up (67.9% – 69.6%) ──
        else if (progress <= 0.696) {
          const p = (progress - 0.679) / 0.017;

          gsap.set(logoRef.current, { scale: 0, opacity: 0 });
          gsap.set(headerLogoRef.current, { scale: 1, opacity: 1 });
          gsap.set(contentStackRef.current, {
            opacity: gsap.utils.interpolate(0, 1, p),
            x: 0,
            y: 0,
          });
          gsap.set(sloganRef.current, { opacity: 1 });
          gsap.set(hookRef.current, { opacity: 0, y: 20 });

          // Section A hidden
          gsap.set(sectionARef.current, { opacity: 0, y: -40 });
          gsap.set(sectionATextRef.current, { opacity: 0, y: 0 });

          // Section B fades out + moves up
          gsap.set(sectionBRef.current, {
            opacity: gsap.utils.interpolate(1, 0, p),
            y: gsap.utils.interpolate(0, -40, p),
          });
          gsap.set(sectionBMediaRef.current, { x: 0, scale: 1 });
          gsap.set(sectionBTextRef.current, { opacity: 1, x: 0, y: 0 });
          hideForm();
        }

        // ─── P8: Hook fades in below slogan (69.6% – 74.2%) ──
        else if (progress <= 0.742) {
          const p = (progress - 0.696) / 0.046;

          gsap.set(logoRef.current, { scale: 0, opacity: 0 });
          gsap.set(headerLogoRef.current, { scale: 1, opacity: 1 });
          gsap.set(contentStackRef.current, { opacity: 1, x: 0, y: 0 });
          gsap.set(sloganRef.current, { opacity: 1 });
          gsap.set(hookRef.current, {
            opacity: gsap.utils.interpolate(0, 1, p),
            y: gsap.utils.interpolate(20, 0, p),
          });
          hideSections();
          hideForm();
        }

        // ─── P9: Content slides left, form slides in, split bg appears (74.2% – 87.4%) ──
        else if (progress <= 0.874) {
          const p = (progress - 0.742) / 0.132;

          gsap.set(logoRef.current, { scale: 0, opacity: 0 });
          gsap.set(headerLogoRef.current, { scale: 1, opacity: 1 });

          // Content stack slides to left-half center
          if (isMobile) {
            gsap.set(contentStackRef.current, {
              opacity: 1,
              x: 0,
              y: gsap.utils.interpolate(0, -vh * 0.15, p),
            });
          } else {
            gsap.set(contentStackRef.current, {
              opacity: 1,
              x: gsap.utils.interpolate(0, -vw * 0.25, p),
              y: 0,
            });
          }

          gsap.set(sloganRef.current, { opacity: 1 });
          gsap.set(hookRef.current, { opacity: 1, y: 0 });
          hideSections();

          // Form slides in from right
          if (isMobile) {
            gsap.set(formPanelRef.current, {
              opacity: gsap.utils.interpolate(0, 1, Math.min(1, p * 4)),
              x: 0,
              y: gsap.utils.interpolate(100, 0, p),
            });
          } else {
            gsap.set(formPanelRef.current, {
              opacity: 1,
              x: gsap.utils.interpolate(vw * 0.5, 0, p),
              y: 0,
            });
          }

          // 50/50 split background fades in
          gsap.set(splitBgRef.current, {
            opacity: isMobile ? 0 : gsap.utils.interpolate(0, 1, Math.min(1, p * 2)),
          });
        }

        // ─── P10: Settled split-screen (87.4% – 100%) ──────────────
        else {
          gsap.set(logoRef.current, { scale: 0, opacity: 0 });
          gsap.set(headerLogoRef.current, { scale: 1, opacity: 1 });

          if (isMobile) {
            gsap.set(contentStackRef.current, { opacity: 1, x: 0, y: -vh * 0.15 });
          } else {
            gsap.set(contentStackRef.current, { opacity: 1, x: -vw * 0.25, y: 0 });
          }

          gsap.set(sloganRef.current, { opacity: 1 });
          gsap.set(hookRef.current, { opacity: 1, y: 0 });
          hideSections();
          gsap.set(formPanelRef.current, { opacity: 1, x: 0, y: 0 });
          gsap.set(splitBgRef.current, { opacity: isMobile ? 0 : 1 });
        }

        // ─── Sync pointer-events with visibility for ALL overlapping layers ───
        // Invisible absolute layers still capture pointer events and block
        // hover on sections underneath. Disable pointer-events when opacity ≈ 0.
        [contentStackRef, sectionARef, sectionBRef, formPanelRef].forEach((ref) => {
          if (ref.current) {
            const op = parseFloat(ref.current.style.opacity || '1');
            ref.current.style.pointerEvents = op < 0.01 ? 'none' : 'auto';
          }
        });
      },
    });

    // ─── GSAP timeline: laptop cinematic entrance + video scrub + number reveal ───
    // Phase 1 (0→0.75): laptop shrinks from big/centered to final left position
    //                    while video.currentTime scrubs 0→duration simultaneously.
    // Phase 2 (0.75→1.0): number fades in + rises into place next to laptop.
    const vid = laptopVideoRef.current;
    let videoTimeline: gsap.core.Timeline | null = null;

    const setupVideoScrub = () => {
      if (!isMounted || !vid || !vid.duration || isNaN(vid.duration)) return;
      const videoDuration = vid.duration;
      const totalScroll = container.scrollHeight - window.innerHeight;
      // P6 range expressed as fraction of total scroll
      const P6_START = 0.184;
      const P6_END = 0.679;

      videoTimeline = gsap.timeline({
        scrollTrigger: {
          trigger: container,
          start: `top+=${P6_START * totalScroll} top`,
          end: `top+=${P6_END * totalScroll} top`,
          scrub: 1,
        },
      });

      // Phase 1a: scrub video (timeline 0 → 0.75)
      videoTimeline.fromTo(
        vid,
        { currentTime: 0 },
        { currentTime: videoDuration, ease: 'none', duration: 0.75 },
        0,
      );

      // Phase 1b: laptop shrinks from centered/big to final flex position (timeline 0 → 0.75)
      if (laptopWrap) {
        videoTimeline.fromTo(
          laptopWrap,
          { x: laptopCenterX, scale: 1.3 },
          { x: 0, scale: 1, ease: 'power2.inOut', duration: 0.75 },
          0,
        );
      }

      // Phase 2: number reveal (timeline 0.75 → 1.0)
      videoTimeline.fromTo(
        sectionBTextRef.current,
        { opacity: 0, y: 60 },
        { opacity: 1, y: 0, ease: 'power2.out', duration: 0.25 },
        0.75,
      );
    };

    if (vid) {
      if (vid.readyState >= 1) {
        setupVideoScrub();
      } else {
        vid.addEventListener('loadedmetadata', setupVideoScrub, { once: true });
      }
    }

    return () => {
      isMounted = false;
      if (vid) vid.removeEventListener('loadedmetadata', setupVideoScrub);
      videoTimeline?.scrollTrigger?.kill();
      videoTimeline?.kill();
      mainTrigger.kill();
    };
  }, []);

  return (
    <div className="bg-black">
      {/* Fixed header */}
      <div className="fixed top-0 left-0 right-0 h-20 bg-gradient-to-b from-slate-950 to-slate-900/80 backdrop-blur-sm z-50 flex items-center px-8 border-b border-slate-800">
        <img
          ref={headerLogoRef}
          src={logo}
          alt="RealSync Logo"
          className="h-12 w-12 object-contain"
          style={{ transform: 'translate3d(0, 0, 0)' }}
        />
      </div>

      {/* Scroll container — extended height for story sections */}
      <div ref={containerRef} className="relative w-full" style={{ height: '1100vh' }}>
        {/* Sticky viewport */}
        <div
          ref={stickyRef}
          className="relative w-full h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black flex items-center justify-center overflow-hidden"
        >
          {/* ── Fullscreen background video ───────────────────── */}
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
            src={realsyncBg}
          />
          {/* Dark overlay for text readability */}
          <div
            className="absolute inset-0 z-[0] pointer-events-none"
            style={{
              background: 'linear-gradient(to bottom, rgba(5,10,20,0.7), rgba(5,10,20,0.8))',
            }}
          />

          {/* ── Center logo (P1–P2) ───────────────────────────── */}
          <img
            ref={logoRef}
            src={logo}
            alt="RealSync Logo"
            className="absolute w-48 h-48 object-contain will-change-transform"
            style={{ transform: 'translate3d(0, 0, 0)' }}
          />

          {/* ── Content stack: slogan + hook ───────────────────── */}
          <div
            ref={contentStackRef}
            className="absolute z-[5] flex flex-col items-center md:items-start justify-center gap-8 max-w-xl px-6 will-change-transform"
            style={{ transform: 'translate3d(0, 0, 0)' }}
          >
            <div
              ref={sloganRef}
              className="text-center md:text-left will-change-transform pointer-events-none"
              style={{ transform: 'translate3d(0, 0, 0)' }}
            >
              <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight">
                See what's real
              </h1>
            </div>

            <div
              ref={hookRef}
              className="text-center md:text-left will-change-transform pointer-events-none"
              style={{ transform: 'translate3d(0, 0, 0)' }}
            >
              <p className="text-lg md:text-xl text-gray-300 leading-relaxed">
                Trust Every Voice. Verify Every Face. RealSync detects deepfake audio, video, and
                behavioral manipulation in real time — before fraud happens.
              </p>
            </div>
          </div>

          {/* ── Section A: Deepfake demo + definition ─────────── */}
          {/* FIX 1: 3-column grid keeps media DEAD CENTER on desktop */}
          <PinnedStorySection ref={sectionARef}>
            <div
              className="
                h-full flex flex-col items-center justify-center gap-8 px-6 pt-20
                md:pt-0 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-14 lg:gap-20 md:px-12 lg:px-20
              "
            >
              {/* Ghost spacer — balances the text column so media stays centered */}
              <div className="hidden md:block" aria-hidden="true" />

              {/* Center column — media dead center horizontally */}
              <div className="flex-shrink-0 md:justify-self-center">
                <DeepfakeVideo src={deepfakeWebm} />
              </div>

              {/* Right column — definition text, lines no wider than heading */}
              <div
                ref={sectionATextRef}
                className="text-center md:text-left md:justify-self-start will-change-transform"
                style={{ transform: 'translate3d(0, 0, 0)' }}
              >
                <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white uppercase tracking-tight mb-4">
                  What is Deepfake
                </h2>
                <p className="text-base md:text-lg text-gray-300 leading-relaxed max-w-[36ch]">
                  A deepfake is fake media—video, audio, or images—created using AI to make someone
                  appear to say or do things they never did.
                </p>
              </div>
            </div>
          </PinnedStorySection>

          {/* ── Section B: Laptop + giant number (flex layout) ── */}
          <PinnedStorySection ref={sectionBRef}>
            <div
              className="
                h-full flex flex-col items-center justify-center gap-8 px-6 pt-20
                md:pt-0 md:flex-row md:items-center md:justify-center md:gap-10 lg:gap-14 md:px-12 lg:px-20
              "
            >
              {/* Laptop — scroll-scrubbed video in flex flow */}
              <div ref={sectionBMediaRef} className="flex-shrink-0">
                <MediaFrame className="w-[300px] h-[190px] md:w-[420px] md:h-[270px] relative overflow-hidden">
                  <video
                    ref={laptopVideoRef}
                    src={laptopScrollWebm}
                    muted
                    playsInline
                    preload="auto"
                    controls={false}
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  />
                </MediaFrame>
              </div>

              {/* Giant number — timeline reveals AFTER video scrub completes */}
              <div
                ref={sectionBTextRef}
                className="text-center md:text-left will-change-transform"
                style={{ transform: 'translate3d(0, 0, 0)', opacity: 0 }}
              >
                <span className="block text-gray-400 text-xs md:text-sm tracking-[0.25em] uppercase mb-2 md:mb-3">
                  Annual losses (USD)
                </span>
                <span
                  className="block font-bold text-white leading-none whitespace-nowrap"
                  style={{ fontSize: 'clamp(44px, 5vw, 88px)' }}
                >
                  <span className="text-gray-500" style={{ fontSize: '0.45em', verticalAlign: 'super' }}>$</span>
                  2,700,000,000
                </span>
              </div>
            </div>
          </PinnedStorySection>

          {/* ── FIX 3: True 50/50 split background — no transforms, exact halves ── */}
          <div
            ref={splitBgRef}
            className="absolute inset-0 z-[1] pointer-events-none hidden md:block"
            style={{ opacity: 0 }}
          >
            {/* Left half — reinforced dark */}
            <div className="absolute left-0 top-0 bottom-0 w-1/2 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />
            {/* Right half — blue accent, clean edge at 50% */}
            <div className="absolute left-1/2 top-0 bottom-0 w-1/2 bg-blue-950/50" />
          </div>

          {/* ── Form panel — right half, slides in from right ───── */}
          <div
            ref={formPanelRef}
            className="
              absolute z-[5] will-change-transform
              w-full px-6
              md:w-1/2 md:left-1/2 md:top-0 md:bottom-0 md:px-0
              flex items-center justify-center
            "
            style={{ transform: 'translate3d(0, 0, 0)' }}
          >
            <div className="relative z-10 w-full px-6 md:px-12">
              <InlineWaitlistForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
