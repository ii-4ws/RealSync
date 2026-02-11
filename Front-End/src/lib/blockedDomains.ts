// ── Blocked personal email domains ───────────────────────────────────
// Shared between SignUpScreen (form validation) and App.tsx (OAuth guard)

export const BLOCKED_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'live.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'mail.com',
  'protonmail.com',
  'proton.me',
  'ymail.com',
  'gmx.com',
  'gmx.net',
  'zoho.com',
];

/** Returns `true` if the email belongs to a personal/blocked domain. */
export function isBlockedDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return BLOCKED_DOMAINS.includes(domain);
}
