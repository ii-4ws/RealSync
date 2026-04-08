import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import baymaxGif from '@/assets/baymax1.gif';
import { waitlistSchema, submitWaitlist, type WaitlistData } from '@/lib/waitlist';

export default function WaitlistSection() {
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
    <section className="relative w-full bg-black">
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black to-transparent pointer-events-none" />

      <div className="relative max-w-2xl mx-auto px-6 py-24 md:py-32">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Get early access
          </h2>
          <p className="text-gray-400 text-lg leading-relaxed">
            Join the waitlist to know when RealSync launches.
          </p>
        </div>

        <div className="relative pt-20 md:pt-28">
          <img
            src={baymaxGif}
            alt=""
            aria-hidden="true"
            className="
              absolute bottom-71 left-140 -translate-x-1/2 z-10
              w-48 md:w-72
              object-contain pointer-events-none select-none
            "
          />

          <div className="relative rounded-2xl border border-slate-800/60 bg-slate-900/50 backdrop-blur-sm p-8 md:p-10">
            {submitted ? (
              <div className="text-center py-6">
                <p className="text-xl font-semibold text-white mb-2">
                  You're in!
                </p>
                <p className="text-gray-400">
                  We'll reach out as soon as RealSync is ready.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <label
                    htmlFor="waitlist-first-name"
                    className="block text-sm font-medium text-gray-300 mb-2"
                  >
                    First Name
                  </label>
                  <Input
                    id="waitlist-first-name"
                    {...register('firstName')}
                    placeholder="First name"
                    disabled={isSubmitting}
                    className="w-full bg-slate-800/50 border-slate-700 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
                  />
                  {errors.firstName && (
                    <p className="text-xs text-red-400 mt-1">{errors.firstName.message}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="waitlist-last-name"
                    className="block text-sm font-medium text-gray-300 mb-2"
                  >
                    Last Name
                  </label>
                  <Input
                    id="waitlist-last-name"
                    {...register('lastName')}
                    placeholder="Last name"
                    disabled={isSubmitting}
                    className="w-full bg-slate-800/50 border-slate-700 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
                  />
                  {errors.lastName && (
                    <p className="text-xs text-red-400 mt-1">{errors.lastName.message}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="waitlist-email"
                    className="block text-sm font-medium text-gray-300 mb-2"
                  >
                    Email
                  </label>
                  <Input
                    id="waitlist-email"
                    type="email"
                    {...register('email')}
                    placeholder="you@company.com"
                    disabled={isSubmitting}
                    className="w-full bg-slate-800/50 border-slate-700 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
                  />
                  {errors.email && (
                    <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>
                  )}
                </div>

                {/* Honeypot — positioned offscreen, aria-hidden, non-autofillable name */}
                <input
                  {...register('honeypot')}
                  type="text"
                  aria-hidden="true"
                  style={{ position: 'absolute', left: '-9999px', opacity: 0 }}
                  tabIndex={-1}
                  autoComplete="off"
                />

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
    </section>
  );
}
