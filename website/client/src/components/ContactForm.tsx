import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const contactFormSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters').max(50),
  lastName: z.string().min(2, 'Last name must be at least 2 characters').max(50),
  email: z.string().email('Invalid email address'),
  message: z.string().min(10, 'Message must be at least 10 characters').max(1000),
  website: z.string().optional(),
});

type ContactFormData = z.infer<typeof contactFormSchema>;

export default function ContactForm() {
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const isMounted = useRef(true);

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      message: '',
      website: '',
    },
  });

  const onSubmit = async (data: ContactFormData) => {
    if (data.website) {
      setSubmitStatus('success');
      reset();
      setTimeout(() => { if (isMounted.current) setSubmitStatus('idle'); }, 3000);
      return;
    }

    setSubmitStatus('loading');
    try {
      const { error } = await supabase
        .from('contact_submissions')
        .insert({
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.email,
          message: data.message,
        });

      if (error) throw error;

      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'contact', firstName: data.firstName, lastName: data.lastName, email: data.email, message: data.message }),
      }).catch(() => {});

      if (!isMounted.current) return;
      setSubmitStatus('success');
      reset();
      setTimeout(() => { if (isMounted.current) setSubmitStatus('idle'); }, 5000);
    } catch (err: any) {
      if (!isMounted.current) return;
      setSubmitStatus('error');
      setErrorMessage(err?.message || 'Failed to send message. Please try again.');
      setTimeout(() => { if (isMounted.current) setSubmitStatus('idle'); }, 5000);
    }
  };

  return (
    <div className="w-full">
      {submitStatus === 'success' && (
        <div className="mb-6 p-4 bg-green-900/20 border border-green-700/50 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <p className="text-sm text-green-300">
            Thank you! We'll be in touch soon.
          </p>
        </div>
      )}

      {submitStatus === 'error' && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-700/50 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <p className="text-sm text-red-300">{errorMessage}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="contact-first-name" className="block text-sm font-medium text-gray-300 mb-2">
            First Name
          </label>
          <Input
            id="contact-first-name"
            {...register('firstName')}
            placeholder="First name"
            className="w-full bg-slate-800/50 border-slate-700 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
            disabled={submitStatus === 'loading'}
          />
          {errors.firstName && (
            <p className="text-xs text-red-400 mt-1">{errors.firstName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="contact-last-name" className="block text-sm font-medium text-gray-300 mb-2">
            Last Name
          </label>
          <Input
            id="contact-last-name"
            {...register('lastName')}
            placeholder="Last name"
            className="w-full bg-slate-800/50 border-slate-700 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
            disabled={submitStatus === 'loading'}
          />
          {errors.lastName && (
            <p className="text-xs text-red-400 mt-1">{errors.lastName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="contact-email" className="block text-sm font-medium text-gray-300 mb-2">
            Email
          </label>
          <Input
            id="contact-email"
            {...register('email')}
            type="email"
            placeholder="your@email.com"
            className="w-full bg-slate-800/50 border-slate-700 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
            disabled={submitStatus === 'loading'}
          />
          {errors.email && (
            <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="contact-message" className="block text-sm font-medium text-gray-300 mb-2">
            Message
          </label>
          <Textarea
            id="contact-message"
            {...register('message')}
            placeholder="Tell us how we can help..."
            className="w-full bg-slate-800/50 border-slate-700 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500 resize-none"
            rows={4}
            disabled={submitStatus === 'loading'}
          />
          {errors.message && (
            <p className="text-xs text-red-400 mt-1">{errors.message.message}</p>
          )}
        </div>

        {/* Honeypot — positioned offscreen, aria-hidden, non-autofillable name */}
        <input
          {...register('website')}
          type="text"
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', opacity: 0 }}
          tabIndex={-1}
          autoComplete="off"
        />

        <Button
          type="submit"
          disabled={submitStatus === 'loading' || submitStatus === 'success'}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitStatus === 'loading' && (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sending...
            </>
          )}
          {submitStatus !== 'loading' && 'Contact us'}
        </Button>
      </form>
    </div>
  );
}
