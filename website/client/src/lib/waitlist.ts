import { z } from 'zod';
import { supabase } from './supabase';

export const waitlistSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
  honeypot: z.string().optional(),
});

export type WaitlistData = z.infer<typeof waitlistSchema>;

/**
 * Submit a waitlist signup to Supabase and fire a notification email.
 * Returns 'new' for first-time signups, 'duplicate' for already-registered emails.
 */
export async function submitWaitlist(
  data: { firstName: string; lastName: string; email: string }
): Promise<'new' | 'duplicate'> {
  const { error } = await supabase
    .from('waitlist_signups')
    .insert({
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      source: 'landing',
    });

  if (error) {
    if (error.code === '23505') return 'duplicate';
    throw error;
  }

  // Fire-and-forget email notification (only for new signups)
  fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'waitlist',
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
    }),
  }).catch(() => {});

  return 'new';
}
