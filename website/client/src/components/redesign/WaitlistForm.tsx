import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { waitlistSchema, submitWaitlist, type WaitlistData } from '@/lib/waitlist';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, CheckCircle } from 'lucide-react';

interface WaitlistFormProps {
  id: string;
}

export default function WaitlistForm({ id }: WaitlistFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
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
      toast.success("You're on the list!");
      setSubmitted(true);
      reset();
      return;
    }

    setLoading(true);
    try {
      const result = await submitWaitlist({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
      });

      if (!isMounted.current) return;

      if (result === 'duplicate') {
        toast.info("You're already on the waitlist!");
      } else {
        toast.success("You're on the list! We'll notify you at launch.");
        setSubmitted(true);
        reset();
      }
    } catch {
      if (!isMounted.current) return;
      toast.error('Something went wrong. Please try again.');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center justify-center gap-3 py-6 px-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
        <CheckCircle className="w-6 h-6 text-emerald-400" />
        <span className="text-lg font-medium text-[#E6EDF3] font-body">You're in!</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={`${id}-first-name`} className="sr-only">First name</label>
          <Input
            id={`${id}-first-name`}
            {...register('firstName')}
            placeholder="First name"
            className="w-full bg-[#0D1117]/80 border-white/[0.08] text-[#E6EDF3] placeholder-[#484F58] focus:border-[#3B82F6] focus:ring-[#3B82F6] font-body"
            disabled={loading}
          />
          {errors.firstName && (
            <p className="text-xs text-red-400 mt-1 font-body">{errors.firstName.message}</p>
          )}
        </div>
        <div>
          <label htmlFor={`${id}-last-name`} className="sr-only">Last name</label>
          <Input
            id={`${id}-last-name`}
            {...register('lastName')}
            placeholder="Last name"
            className="w-full bg-[#0D1117]/80 border-white/[0.08] text-[#E6EDF3] placeholder-[#484F58] focus:border-[#3B82F6] focus:ring-[#3B82F6] font-body"
            disabled={loading}
          />
          {errors.lastName && (
            <p className="text-xs text-red-400 mt-1 font-body">{errors.lastName.message}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
        <Input
          id={`${id}-email`}
          {...register('email')}
          type="email"
          placeholder="your@email.com"
          className="w-full bg-[#0D1117]/80 border-white/[0.08] text-[#E6EDF3] placeholder-[#484F58] focus:border-[#3B82F6] focus:ring-[#3B82F6] font-body"
          disabled={loading}
        />
        {errors.email && (
          <p className="text-xs text-red-400 mt-1 font-body">{errors.email.message}</p>
        )}
      </div>

      {/* Honeypot */}
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
        disabled={loading}
        className="w-full bg-[#3B82F6] hover:bg-blue-600 text-white font-medium py-2.5 rounded-lg glow-blue-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-body"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Joining...
          </>
        ) : (
          'Join the Waitlist'
        )}
      </Button>
    </form>
  );
}
