# Landing Page Implementation

## Overview

A scroll-driven cinematic landing page that transitions through four phases: logo reveal, slogan appearance, hook message, and contact form. All animation is driven by scroll position using `framer-motion`'s `useScroll` + `useTransform`.

## Route

The landing page is the **default view** for unauthenticated users at `/`. It replaces the login screen as the first thing visitors see. Navigation to login and signup is available via the top-right buttons.

The `showLanding` state in `App.tsx` controls visibility:
- When `true` (default for unauthenticated users) — landing page is shown
- When `false` — login or signup screen is shown based on `authView`

The landing page renders **before** the prototype mode check, so it works whether or not Supabase is configured.

## File Structure

```
Front-End/src/components/landing/
├── LandingPage.tsx     Main scroll scene + all animations + navigation
└── ContactForm.tsx     Contact form component + submission handler
```

All animation transforms are computed in `LandingPage.tsx` and passed to child components. The logo, slogan, and hook are rendered inline in `LandingPage.tsx`.

## Debug Toggle

**File:** `Front-End/src/components/landing/LandingPage.tsx`
**Variable:** `DEBUG` (near top of file, after imports)

```typescript
const DEBUG = false;  // Set to true to force all elements visible
```

When `DEBUG = true`:
- All elements (slogan, hook, form) are forced to opacity 1, scale 1, translateY 0
- Coloured outlines appear around each section:
  - **Green** outline = Slogan
  - **Yellow** outline = Hook sentence
  - **Magenta** outline = Contact form
- A red "DEBUG MODE ON" badge appears at top-left
- The scroll scene collapses to 100vh (no scrolling needed)

Set `DEBUG = false` to restore scroll-driven animation.

## Editable Content

### Slogan text
**File:** `Front-End/src/components/landing/LandingPage.tsx`
**Variable:** `SLOGAN` (near top of file)
**Current value:** `"See what's real"`

### Hook sentence
**File:** `Front-End/src/components/landing/LandingPage.tsx`
**Variables:** `HOOK_HEADLINE` and `HOOK_BODY` (near top of file)
**Current values:**
- Headline: `"Trust Every Voice. Verify Every Face."`
- Body: `"RealSync detects deepfake audio, video, and behavioral manipulation in real time — before fraud happens."`

### Logo
**File:** `Front-End/src/components/landing/LandingPage.tsx`
**Import:** `logoDark` import near the top — change the import path to swap the logo asset.
**Current asset:** `src/assets/4401d6799dc4e6061a79080f8825d69ae920f198.png`

### CTA button text
**File:** `Front-End/src/components/landing/ContactForm.tsx`
**Location:** The submit button text near the bottom of the file.
**Current value:** `"Contact us"`

## Contact Form & Email Sending

### Client side
**File:** `Front-End/src/components/landing/ContactForm.tsx`
**Function:** `handleSubmit`

The form POSTs to `/api/contact` (proxied to backend at `:4000` by Vite). Includes:
- `name`, `email`, `message` — visible form fields
- `_honey` — hidden honeypot field (catches bots)

### Server side
**File:** `realsync-backend/index.js`
**Route:** `POST /api/contact`

The endpoint:
1. Checks the honeypot `_honey` field — if filled, silently returns `{ ok: true }` (bot trap)
2. Validates `name`, `email` (regex), and `message` are present and within length limits
3. Sends email via nodemailer (SMTP) to `CONTACT_TO_EMAIL` (default: `info@real-sync.app`)
4. If SMTP credentials are not configured, logs the message to console and returns success

### Required environment variables (backend `.env`)

```bash
# SMTP configuration (Zoho Mail)
SMTP_HOST=smtp.zoho.com        # Default if omitted
SMTP_PORT=465                  # Default if omitted (SSL)
SMTP_USER=info@real-sync.app   # Zoho Mail account email
SMTP_PASS=your-app-password    # Zoho Mail app-specific password

# Destination email for contact form submissions
CONTACT_TO_EMAIL=info@real-sync.app   # Default if omitted
```

### Testing locally without SMTP

If `SMTP_USER` and `SMTP_PASS` are not set, the endpoint logs submissions to console instead of sending email. This allows local testing without mail credentials.

## Scroll Animation Architecture

### Why inline styles (important for maintainers)

The Tailwind CSS in this project is **pre-built and static** — there is no Tailwind plugin in `vite.config.ts`. This means utility classes not used by existing components (like `sticky`) are missing from the generated CSS. The landing page uses **inline styles for all critical layout properties** to avoid depending on Tailwind utilities that may not exist.

### Container structure
- **Outer section:** `height: 220vh` — provides 120vh of scroll distance
- **Inner container:** `position: sticky; top: 0; height: 100vh` — pins the viewport (set via inline style, not Tailwind class)

### Layer structure
- **Layer 0 (z-index: 0):** Logo — centered, scales down + moves up as user scrolls
- **Layer 1 (z-index: 10):** Content stack — slogan, hook, form appear sequentially

### Scroll tracking
Uses `useScroll({ target: sectionRef, offset: ['start start', 'end end'] })` which tracks scrollYProgress from 0 to 1 specifically within the outer section element. This is more reliable than page-level scroll tracking.

### Animation timeline (driven by `scrollYProgress` 0→1)
| Phase | Scroll % | What happens |
|-------|----------|-------------|
| 1 — Initial | 0–15% | Logo large and centered, nothing else visible |
| 2 — Transition | 15–50% | Logo scales down (1.15→0.3), translates up (-180px). Slogan fades in |
| 3 — Message | 50–75% | Hook sentence fades in and slides up |
| 4 — Conversion | 75–100% | Contact form fades in and slides up |

### Rendering rules
- Slogan, hook, and form are **always mounted in the DOM** (no conditional rendering)
- Visibility is controlled ONLY via `opacity`, `transform: scale`, and `transform: translateY`
- No layout-triggering properties (width, height, margin, padding) are animated

## Light Mode Protection

The landing page forces `class="dark"` on `<html>` while mounted (via `useEffect`). This prevents `public/light-mode.css` rules like `html:not(.dark) .text-white { color: #111827 }` from affecting the dark cinematic background.

All text and layout styles use inline `style={{}}` rather than Tailwind classes.

## Accessibility

- All form inputs have visible `<label>` elements linked via `htmlFor`/`id`
- Focus states with visible cyan ring (`boxShadow` on focus)
- Form status messages use `role="status"` (success) and `role="alert"` (error)
- `prefers-reduced-motion` supported: scroll scene collapses to `100vh`, all content shown immediately with static values
- Scroll indicator hidden when reduced motion is preferred
- Honeypot field uses `aria-hidden="true"` and is positioned off-screen

## Dependencies

### Frontend
- `framer-motion` — scroll-driven animation (`useScroll`, `useTransform`, `motion`, `useReducedMotion`)
- `Outfit` Google Font — display typography for slogan and hook headline

### Backend
- `nodemailer` — SMTP email sending for contact form submissions

## Performance

- All animations use `transform` and `opacity` only (composited by GPU)
- `will-change: transform, opacity` applied to animated layers
- No layout thrashing or reflow-triggering properties
- Reduced motion preference collapses the scroll scene for instant content
