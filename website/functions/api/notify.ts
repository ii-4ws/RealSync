interface Env {
  RESEND_API_KEY: string;
  ALLOWED_ORIGINS?: string;
}

/** Escape HTML special characters to prevent injection. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Validate an email address format. */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

function getAllowedOrigin(request: Request, env: Env): string {
  const allowed = (env.ALLOWED_ORIGINS ?? 'https://real-sync.app')
    .split(',')
    .map(s => s.trim());
  const origin = request.headers.get('Origin') ?? '';
  return allowed.includes(origin) ? origin : allowed[0];
}

function getCorsHeaders(request: Request, env: Env) {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(request, env),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Simple per-IP rate limiter for the Worker (resets on cold start, good enough for burst protection)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const corsHeaders = getCorsHeaders(context.request, context.env);

  // Rate limiting
  const clientIp = context.request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ success: false, error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const body = await context.request.json() as {
      type: string;
      firstName: string;
      lastName: string;
      email: string;
      message?: string;
    };

    const { type, firstName, lastName, email, message } = body;

    // --- Server-side input validation ---
    if (type !== 'contact' && type !== 'waitlist') {
      return new Response(JSON.stringify({ success: false, error: 'Invalid type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    if (typeof firstName !== 'string' || firstName.length < 1 || firstName.length > 100) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid firstName' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    if (typeof lastName !== 'string' || lastName.length > 100) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid lastName' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    if (typeof email !== 'string' || !isValidEmail(email)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid email' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    if (type === 'contact' && (typeof message !== 'string' || message.length < 10 || message.length > 1000)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid message' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // --- Escape all user input before inserting into HTML ---
    const safeFirst = escapeHtml(firstName);
    const safeLast = escapeHtml(lastName);
    const safeEmail = escapeHtml(email);
    const safeMessage = message ? escapeHtml(message) : '';

    let subject: string;
    let html: string;

    if (type === 'contact') {
      subject = `New Contact Form: ${safeFirst} ${safeLast}`;
      html = `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${safeFirst} ${safeLast}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Message:</strong></p>
        <p>${safeMessage}</p>
      `;
    } else {
      subject = `New Waitlist Signup: ${safeFirst} ${safeLast}`;
      html = `
        <h2>New Waitlist Signup</h2>
        <p><strong>Name:</strong> ${safeFirst} ${safeLast}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
      `;
    }

    // Notify owner
    const ownerRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'RealSync <noreply@real-sync.app>',
        to: 'info@real-sync.app',
        subject,
        html,
      }),
    });

    if (!ownerRes.ok) {
      console.error('Resend owner error:', await ownerRes.text());
      return new Response(JSON.stringify({ success: false, error: 'Failed to send notification' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Send confirmation email to the validated email address
    const confirmSubject = type === 'contact'
      ? 'Thanks for reaching out to RealSync'
      : 'Welcome to the RealSync Waitlist!';

    const confirmHtml = type === 'contact'
      ? `
        <div style="font-family: 'Space Grotesk', Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #e2e8f0;">
          <div style="background: #0f172a; padding: 32px; border-radius: 12px;">
            <h2 style="color: #ffffff; margin-top: 0;">Hi ${safeFirst},</h2>
            <p style="color: #94a3b8; line-height: 1.6;">Thank you for contacting RealSync. We've received your message and will get back to you shortly.</p>
            <p style="color: #94a3b8; line-height: 1.6;">In the meantime, stay tuned — we're building real-time deepfake, identity, and fraud detection for video meetings.</p>
            <p style="color: #94a3b8; margin-bottom: 0;">— The RealSync Team</p>
          </div>
        </div>`
      : `
        <div style="font-family: 'Space Grotesk', Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #e2e8f0;">
          <div style="background: #0f172a; padding: 32px; border-radius: 12px;">
            <h2 style="color: #ffffff; margin-top: 0;">Welcome, ${safeFirst}!</h2>
            <p style="color: #94a3b8; line-height: 1.6;">You're on the RealSync waitlist. We'll notify you as soon as we launch.</p>
            <p style="color: #94a3b8; line-height: 1.6;">RealSync detects deepfake audio, video, and behavioral manipulation in real time — before fraud happens.</p>
            <p style="color: #94a3b8; margin-bottom: 0;">— The RealSync Team</p>
          </div>
        </div>`;

    const confirmRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'RealSync <noreply@real-sync.app>',
        to: email,
        subject: confirmSubject,
        html: confirmHtml,
      }),
    });

    if (!confirmRes.ok) {
      console.error('Resend confirm error:', await confirmRes.text());
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('Notify error:', err);
    return new Response(JSON.stringify({ success: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

export const onRequestOptions: PagesFunction<Env> = async (context) => {
  return new Response(null, {
    headers: getCorsHeaders(context.request, context.env),
  });
};
