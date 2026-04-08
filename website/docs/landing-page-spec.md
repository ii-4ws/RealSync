# Landing Page Specification

## Purpose

This landing page is a scroll-driven contact and interest capture page.

The goal is to create a premium cinematic experience where the logo transitions into a slogan, then into a hook sentence, and finally into a contact form.

The primary conversion goal is form submission.

---

## Assets

Logo location (repo-relative path, do not move file):
Front-End/src/assets/4401d6799dc4e6061a79080f8825d69ae920f198.png

Rules:
- Do NOT duplicate the logo file.
- If the project is Vite/React: import the logo from the path above.
- If the project is Next.js and importing from src/assets is problematic: copy the logo ONCE into `public/brand/logo.png` and reference it via `/brand/logo.png` (only if required by the framework).

---

## Scroll Scene Structure

The landing page must use a sticky scroll scene.

Outer container height: 220vh (minimum; can be 200–240vh if needed)  
Inner container: position: sticky; height: 100vh

Scroll progress defines animation state.

---

## Rendering Rules (Mandatory)

Slogan, hook sentence, and form MUST always be mounted in the DOM.

- Do NOT conditionally render them based on scroll progress.
- Visibility must be controlled ONLY using:
  - opacity
  - transform: scale
  - transform: translateY

This prevents “logo-only” partial outcomes caused by broken scroll thresholds.

---

## Animation Timeline

### Phase 1: Initial State (0%–15% scroll)

- Logo is centered horizontally and vertically
- Logo is large and dominant
- Logo scale: large (example: 1.0–1.2)
- Slogan is invisible or very low opacity
- Hook sentence is not visible (opacity 0)
- Form is not visible (opacity 0)

---

### Phase 2: Logo Transition (15%–50%)

- Logo scales down smoothly
- Logo remains centered (no jump)
- Logo scale reduces gradually to smaller size (example: 0.25–0.4)
- Slogan begins appearing
- Slogan opacity increases gradually
- Slogan scale increases gradually

---

### Phase 3: Message Reveal (50%–75%)

- Slogan is now dominant element
- Hook sentence fades in below slogan
- Hook sentence slides upward slightly during appearance (translateY)
- Form is still hidden (opacity 0)

---

### Phase 4: Conversion State (75%–100%)

- Contact form fades in below hook sentence
- Form slides upward slightly during appearance (translateY)
- Form includes:
  - Name field
  - Email field
  - Message field
  - Submit button

Form must be clearly readable and accessible.

---

## Animation Technical Constraints

Allowed animation properties:

- transform: scale
- transform: translateY
- opacity

Do NOT animate:

- width
- height
- margin
- padding
- position offsets (top/left/right/bottom)

All animation must be smooth and mobile performant.

---

## Text Content

Slogan:
See what's real

Hook sentence (single paragraph):
Trust Every Voice. Verify Every Face. RealSync detects deepfake audio, video, and behavioral manipulation in real time — before fraud happens.

CTA button text:
Contact us

---

## Visual Style

Theme:
- Dark mode
- Minimal
- Premium
- Modern

Form container should feel clean and professional.

Avoid excessive effects.

---

## Form Behavior (Mandatory)

On submit, the form must send the message to:
info@real-sync.app

Implementation rules:
- The client must submit to a server endpoint (e.g., `/api/contact` or the equivalent for the chosen stack).
- The server must send the email (do NOT send email directly from the browser).
- Secrets must be stored in environment variables (no keys in frontend).
- UX must include:
  - loading state (disable submit button while sending)
  - success state (clear confirmation message)
  - error state (clear error message)
- Include a hidden honeypot field for basic spam reduction.

---

## Routing

Implement the landing page at:
/landing

Do NOT modify existing homepage routes or break existing app functionality.

---

## Performance Requirements

Must be smooth on mobile.

Must follow performance guidance from skills.md files.

Use scroll-driven transform/opacity animation only.