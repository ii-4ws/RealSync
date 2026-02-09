# RealSync Brand Identity

> Real-Time Meeting Intelligence Platform

---

## 1. Brand Essence

### Mission

To safeguard the authenticity of every digital conversation by providing real-time AI-powered detection of deepfakes, identity fraud, and emotional manipulation during video meetings.

### Vision

A world where every participant in a video call can be trusted — where organizations communicate with full confidence that the people on screen are who they claim to be.

### Brand Personality

RealSync embodies five core traits:

| Trait | Description |
|-------|-------------|
| **Vigilant** | Always watching, always protecting. Constant awareness without being intrusive or alarming. |
| **Intelligent** | Powered by advanced AI. Speaks with authority and precision. Does not oversimplify or overpromise. |
| **Trustworthy** | The foundational trait. Every visual and verbal choice reinforces reliability, stability, and confidence. |
| **Modern** | Clean, forward-looking, technologically sophisticated. The aesthetic signals cutting-edge capability. |
| **Premium** | Enterprise-grade quality in every detail. Dark interface, gradient accents, restrained color usage. |

### Taglines

| Context | Tagline |
|---------|---------|
| **Primary** | See What's Real. |
| **Secondary** | Trust Every Frame. |
| **Descriptive** | Real-Time Meeting Intelligence. |
| **Technical** | AI-Powered Authenticity Detection. |

### Brand Promise

When RealSync is active, you can trust what you see. Every face, every voice, every frame is verified in real time.

---

## 2. Logo System

### Logo Variants

| Variant | File | Usage |
|---------|------|-------|
| **Full Lockup** (eye + wordmark) | `Front-End/src/assets/4401d6799dc4e6061a79080f8825d69ae920f198.png` | Primary brand mark. Sidebar, login, reports, presentations. |
| **Eye-Only Icon** (brandmark) | `Front-End/src/assets/realsync-eye-only.png` | Favicons, app icons, compact spaces, social media profile. |

The logo features a stylized eye symbol with flowing wave lines rendered in a cyan-green-purple gradient, with "RealSync" wordmark beneath in a light, semi-transparent style.

### Sizing Rules

| Variant | Min Screen Size | Min Print Size | Standard Sizes |
|---------|----------------|----------------|----------------|
| Full Lockup | 120px width | 30mm width | Desktop: 256px (`w-64`), Mobile: 192px (`w-48`), Sidebar: 160px (`w-40`) |
| Eye-Only Icon | 24 x 24px | 8 x 8mm | 32px, 48px, 64px |

Below 120px width, always switch to the Eye-Only Icon.

### Clear Space

Maintain minimum clear space around the logo equal to the height of the "R" in the wordmark on all sides. No graphic elements, text, or edges may intrude into this zone.

### Background Rules

- The logo is designed for dark backgrounds (`#0F0F1E` or `#1A1A2E`)
- On backgrounds lighter than `#2A2A3E`, use a dark container behind the logo
- Never place the logo on busy photographic backgrounds without a solid or blurred overlay

### Logo Don'ts

- Do not rotate the logo
- Do not alter the gradient colors
- Do not add drop shadows, outlines, or glows
- Do not stretch or compress the aspect ratio
- Do not use the wordmark without the eye symbol
- Do not place on light backgrounds without testing contrast
- Do not rearrange the eye-above-wordmark stacking
- Do not recreate in a single flat color (the gradient is integral)

---

## 3. Color System

### 3.1 Primary Colors

The cyan-to-blue gradient is the signature visual element of RealSync.

| Token | Hex | RGB | HSL | Usage |
|-------|-----|-----|-----|-------|
| **Cyan 400** | `#22D3EE` | 34, 211, 238 | 188, 85%, 53% | Primary accent, CTA buttons, links, active highlights |
| **Blue 500** | `#3B82F6` | 59, 130, 246 | 217, 91%, 60% | Gradient endpoint, active navigation |
| **Blue 600** | `#2563EB` | 37, 99, 235 | 217, 83%, 53% | Sidebar active item, pagination active |

### 3.2 Secondary & Accent Colors

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| **Purple 400** | `#A855F7` | 168, 85, 247 | Tertiary accent, chart segments |
| **Purple 700** | `#6D28D9` | 109, 40, 217 | Logo gradient component only |
| **Orange 400** | `#FB923C` | 251, 146, 60 | Warning indicators, behavior confidence |
| **Orange 500** | `#F97316` | 249, 115, 22 | High-severity badge background |

### 3.3 Semantic / Severity Colors

The severity system is central to RealSync's core function.

| Severity | Text Color | Hex | Badge Pattern | Example |
|----------|-----------|-----|---------------|---------|
| **Low / Safe** | `text-green-400` | `#4ADE80` | `bg-green-500/20 text-green-400` | Low risk, completed, system online |
| **Medium** | `text-yellow-400` | `#FACC15` | `bg-yellow-500/20 text-yellow-400` | Medium risk, caution, trust 85-94% |
| **High** | `text-orange-400` | `#FB923C` | `bg-orange-500/20 text-orange-400` | High risk, urgent alerts |
| **Critical** | `text-red-400` | `#F87171` | `bg-red-500/20 text-red-400` | Critical alerts, flagged, trust <85% |
| **Error** | `text-red-400` | `#F87171` | `bg-red-500/10 border-red-500/30` | Form errors, auth failures |
| **Info** | `text-blue-400` | `#60A5FA` | `bg-blue-500/10 border-blue-500/30` | Informational panels |

**Rule**: Status colors are reserved exclusively for severity/risk communication. Never use green, yellow, or red as decorative accents.

### 3.4 Neutral / Background Scale

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| **Deep Background** | `#0A0A14` | 10, 10, 20 | Login screen background (deepest surface) |
| **Base Background** | `#0F0F1E` | 15, 15, 30 | App page background |
| **Recessed Surface** | `#141427` | 20, 20, 39 | Nested containers, transcript area |
| **Card Surface** | `#1A1A2E` | 26, 26, 46 | Cards, sidebar, dialogs, tables |
| **Elevated Surface** | `#2A2A3E` | 42, 42, 62 | Hover states, input backgrounds, progress tracks |
| **Hover Elevated** | `#3A3A4E` | 58, 58, 78 | Scrollbar thumb hover, tertiary hover |

### Text Neutrals

| Token | Tailwind | Hex | Usage |
|-------|----------|-----|-------|
| **White** | `text-white` | `#FFFFFF` | Headings, primary text, metric values |
| **Gray 200** | `text-gray-200` | `#E5E7EB` | Transcript lines, secondary content |
| **Gray 300** | `text-gray-300` | `#D1D5DB` | Table data, form labels, outline button text |
| **Gray 400** | `text-gray-400` | `#9CA3AF` | Descriptions, inactive nav, table headers |
| **Gray 500** | `text-gray-500` | `#6B7280` | Timestamps, helper text, placeholders |
| **Gray 700** | `border-gray-700` | `#374151` | Input borders, outline button borders |
| **Gray 800** | `border-gray-800` | `#1F2937` | Card borders, table dividers, separators |

### 3.5 Gradient Definitions

**Primary Brand Gradient** (Signature)
```css
background: linear-gradient(to right, #22D3EE, #3B82F6);
/* Tailwind: bg-gradient-to-r from-cyan-400 to-blue-500 */
```
Used for: Primary CTA buttons, trust score ring, progress bars, avatar fallback.

**Primary Hover Gradient**
```css
background: linear-gradient(to right, #06B6D4, #2563EB);
/* Tailwind: hover:from-cyan-500 hover:to-blue-600 */
```

**Feature Card Gradients** (Login Screen)
```css
/* Cyan feature */
background: linear-gradient(to right, rgba(6, 182, 212, 0.1), transparent);
border: 1px solid rgba(6, 182, 212, 0.2);

/* Blue feature */
background: linear-gradient(to right, rgba(59, 130, 246, 0.1), transparent);
border: 1px solid rgba(59, 130, 246, 0.2);

/* Orange feature */
background: linear-gradient(to right, rgba(249, 115, 22, 0.1), transparent);
border: 1px solid rgba(249, 115, 22, 0.2);
```

**Ambient Background Orbs** (Login/Signup only)
```css
/* Cyan orb */  background: rgba(6, 182, 212, 0.2); filter: blur(48px);
/* Blue orb */  background: rgba(59, 130, 246, 0.2); filter: blur(48px);
/* Orange orb */ background: rgba(249, 115, 22, 0.1); filter: blur(48px);
```

**Divider Gradient**
```css
background: linear-gradient(to right, transparent, #374151, transparent);
/* Tailwind: bg-gradient-to-r from-transparent via-gray-700 to-transparent */
```

**PDF Report Accent Strip**
```
Purple (#6D28D9) → Blue (#3B82F6) → Cyan (#22D3EE)
```

### 3.6 Color Usage Ratio — 70-20-10

| Percentage | Colors | Role |
|------------|--------|------|
| **70%** | `#0F0F1E`, `#1A1A2E`, `#2A2A3E` | Backgrounds, surfaces, structural elements |
| **20%** | `gray-200` through `gray-500` | All text content, borders, subtle UI elements |
| **10%** | Cyan, blue gradients; green/yellow/red for status | CTAs, highlights, severity indicators |

**Rules**:
- Cyan (`#22D3EE`) is the dominant accent — buttons, links, data identifiers
- Blue (`#3B82F6` / `#2563EB`) is secondary — active nav, pagination
- Status colors (green/yellow/red) are **reserved for severity only**
- Orange is for warnings and behavior confidence only
- Purple is tertiary — charts and logo gradient only, never in buttons or links

---

## 4. Typography System

### 4.1 Recommended Font Pairing

| Role | Font | Why |
|------|------|-----|
| **Headings + Body** | **Space Grotesk** (300, 400, 500, 700) | Geometric sans-serif with a distinctive technical/futuristic character. Clean, modern, and highly legible. Designed by Florian Karsten, open source (SIL OFL). |
| **Data / Monospace** | **JetBrains Mono** (400, 500) | Designed for code readability, ideal for session IDs, timestamps, metric values. |
| **Fallback (sans)** | `ui-sans-serif, system-ui, sans-serif` | Current system stack, still used as fallback |
| **Fallback (mono)** | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` | Current system stack |

### 4.2 Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| **Display XL** | 48px / 3rem | 400 | 1.1 | Trust score percentage |
| **Display LG** | 30px / 1.875rem | 400 | 1.2 | Large stat values |
| **Heading 1** | 24px / 1.5rem | 500 | 1.3 | Page titles, section headings |
| **Heading 2** | 20px / 1.25rem | 500 | 1.4 | Card titles, table section headings |
| **Heading 3** | 18px / 1.125rem | 500 | 1.5 | Card sub-headings |
| **Body** | 16px / 1rem | 400 | 1.5 | Default text, descriptions |
| **Body Small** | 14px / 0.875rem | 400 | 1.5 | Table data, form labels |
| **Caption** | 12px / 0.75rem | 400 | 1.5 | Timestamps, helper text, metadata |

### 4.3 Weight Rules

- **400 (Regular)**: Body text, descriptions, form inputs
- **500 (Medium)**: Headings, labels, buttons, nav items
- **600 (SemiBold)**: Feature titles, emphasis within headings
- **700 (Bold)**: Reserved for PDF report headings only

### 4.4 Color Rules

- All headings: `text-white` on dark backgrounds
- Descriptions beneath headings: `text-gray-400`
- Never use bold (700) for body text
- Data values (metrics, scores, percentages) use Display sizes in white

---

## 5. Iconography

### Icon Set

**Lucide React** is the single icon source. No other icon libraries.

```typescript
import { Shield, Lock, ScanFace, Eye, AlertTriangle, ... } from 'lucide-react';
```

### Size Scale

| Size | Dimensions | Usage |
|------|-----------|-------|
| **Tiny** | `w-3 h-3` (12px) | Metadata indicators |
| **Small** | `w-4 h-4` (16px) | Button-leading icons, dropdown items |
| **Default** | `w-5 h-5` (20px) | Navigation, table actions |
| **Large** | `w-8 h-8` (32px) | Feature cards, hero icons |

Stroke width: Lucide default (2px) — do not customize.

### Color Rules

| Context | Color | Example |
|---------|-------|---------|
| **Inactive navigation** | `text-gray-400` | Sidebar items |
| **Active navigation** | `text-white` (on `bg-blue-600`) | Selected sidebar item |
| **Alert / Error** | `text-red-400` | `AlertCircle` icon |
| **Warning** | `text-orange-400` | `AlertTriangle` icon |
| **Success** | `text-green-400` | Status dot, check marks |
| **Feature accent** | Matches feature color | `text-cyan-400`, `text-blue-400`, `text-orange-400` |
| **Primary button** | `text-black` | Icons inside cyan buttons |
| **Outline button** | `text-gray-300` | Icons inside outline buttons |

### Icon Categories

| Category | Icons |
|----------|-------|
| **Navigation** | LayoutDashboard, Video, FileText, Settings, HelpCircle |
| **Security** | Shield, Lock, ScanFace, Eye, EyeOff |
| **Actions** | Plus, Download, Share2, Archive, Trash2, Upload |
| **Status** | AlertTriangle, AlertCircle, Check |
| **Data** | Search, Filter, MoreVertical, ChevronLeft, ChevronRight |
| **Communication** | Mail, Bell |
| **Settings** | User, SlidersHorizontal, Cloud |

---

## 6. UI Component Patterns

### 6.1 Cards

```
Background: #1A1A2E
Border:     1px solid #1F2937 (gray-800)
Radius:     12px (rounded-xl)
Padding:    24px (p-6)
```

**Variants**:
- **Standard**: `bg-[#1a1a2e] rounded-xl p-6 border border-gray-800`
- **Dialog/Modal**: Same + `backdrop-blur-xl` with `/80` opacity
- **Recessed**: `bg-[#141427] rounded-lg border border-gray-800 p-3`
- **Info panel**: `bg-blue-500/10 border border-blue-500/30 rounded-xl p-6`
- **Error panel**: `bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2`

### 6.2 Buttons

**Primary CTA (Solid Cyan)**
```
bg-cyan-400 hover:bg-cyan-500 text-black
Height: h-12 (48px) for page-level, h-9 (36px) for inline
```

**Primary CTA (Gradient)** — Login page
```
bg-gradient-to-r from-cyan-400 to-blue-500
hover:from-cyan-500 hover:to-blue-600
text-white
shadow-lg shadow-cyan-500/25
```

**Outline / Secondary**
```
bg-transparent border-gray-700 text-gray-300
hover:bg-gray-800 hover:border-gray-600 hover:text-white
```

**Destructive**
```
text-red-400 hover:bg-gray-800 hover:text-red-300
```

**Pagination Active**: `bg-blue-600 border-blue-600 text-white`
**Pagination Inactive**: `bg-transparent border-gray-700 text-gray-400`

### 6.3 Inputs

```
Background:  #0F0F1E (on card) or #2A2A3E (in settings)
Border:      border-gray-700
Text:        text-white
Placeholder: text-gray-500
Height:      h-12 (prominent) or h-9 (default)
Focus:       border-cyan-400 ring-cyan-400
Error:       border-red-500 focus:border-red-500 focus:ring-red-500
```

### 6.4 Badges (Severity)

All badges: `bg-{color}-500/20 text-{color}-400` — 20% opacity background, full-saturation text.

| State | Classes |
|-------|---------|
| Low / Completed | `bg-green-500/20 text-green-400` |
| Medium | `bg-yellow-500/20 text-yellow-400` |
| High / Flagged | `bg-red-500/20 text-red-400` |

### 6.5 Tables

```
Container:    bg-[#1a1a2e] rounded-xl border border-gray-800
Header cells: text-gray-400
Body rows:    border-gray-800 hover:bg-[#2a2a3e]
Body cells:   text-gray-300 (default), text-white (name/title), text-cyan-400 (IDs)
```

### 6.6 Progress Bars

```
Track:          h-2 bg-[#2a2a3e] rounded-full
Fill (default): bg-cyan-400
Fill (gradient): bg-gradient-to-r from-cyan-400 to-blue-500
Fill (risk):    bg-green-400 | bg-yellow-400 | bg-red-400
```

### 6.7 Avatars

```
Size:     w-10 h-10 (TopBar), w-32 h-32 (Settings)
Fallback: bg-gradient-to-br from-cyan-400 to-blue-500, white initials
Hover:    ring-2 ring-cyan-400 transition-all
Shape:    rounded-full
```

---

## 7. Motion & Animation

### Principles

1. **Subtle over dramatic** — Barely noticeable, contributing polish without drawing attention
2. **Purposeful** — Every animation communicates a state change
3. **Performance-first** — Prefer `transform` and `opacity`. Avoid layout-triggering properties
4. **Consistent timing** — `cubic-bezier(0.4, 0, 0.2, 1)` with `150ms` default duration

### Established Animations

| Animation | Target | Duration | Usage |
|-----------|--------|----------|-------|
| **Pulse** | Status dot | `2s infinite` | System online indicator (TopBar) |
| **Pulse (staggered)** | Background orbs | `2s infinite` (0s, 1s, 2s delays) | Login/Signup ambient effect only |
| **Transition colors** | All interactive | `150ms ease` | Buttons, nav items, links, rows |
| **Spin** | Loading spinner | `1s linear infinite` | Loading states |

### Recommended Additions

```css
/* Progress bar width changes */
transition: width 300ms cubic-bezier(0.4, 0, 0.2, 1);

/* Trust score ring */
transition: stroke-dasharray 500ms cubic-bezier(0.4, 0, 0.2, 1);

/* Card entrance (page navigation) */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
animation: fadeIn 200ms ease-out;

/* Alert entrance */
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(8px); }
  to   { opacity: 1; transform: translateX(0); }
}
animation: slideInRight 300ms ease-out;
```

### Motion Don'ts

- No spring/bounce animations — conflicts with serious security tone
- No color animation on severity badges — color must change instantly for clarity
- No loading spinners longer than 2s without explanatory text
- No logo animation — the logo's power comes from stillness
- Respect `prefers-reduced-motion` — wrap all animations in a media query check

---

## 8. Tone of Voice

### Overall Tone

RealSync communicates as a **calm, authoritative security advisor** — direct, technical but accessible, confident, measured.

### Formality by Context

| Context | Formality | Example |
|---------|-----------|---------|
| **Critical alert** | High, imperative | "Potential visual manipulation detected." |
| **Warning alert** | Medium, descriptive | "Elevated anger expression detected." |
| **OK status** | Low, reassuring | "All systems normal." |
| **UI labels** | Neutral, concise | "Live Trust Score", "Identity Consistency" |
| **Empty states** | Friendly, instructive | "No transcript yet. Start captions and speak into your mic." |
| **Errors** | Direct, non-blaming | "Microphone permission denied." |
| **Success** | Brief, positive | "Session started." |
| **Marketing** | Professional, aspirational | "Detect deepfakes in real-time and ensure the authenticity of your video conferences." |

### Urgency Levels

| Level | Color | Pattern |
|-------|-------|---------|
| **Critical** | Red | "[Threat type] detected. [Recommended action]." |
| **Warning** | Orange/Yellow | "Elevated [signal] detected. Monitor participant." |
| **Info** | Blue/Cyan | "[System/feature] is [state]. [Additional context]." |
| **Success** | Green | "[Action] completed." |

### Writing Rules

1. Sentence case for all UI text (not Title Case), except "RealSync"
2. Alert messages under 60 characters
3. No exclamation marks in alerts or errors (reserve for success toasts)
4. No anthropomorphizing — "Analysis indicates..." not "RealSync thinks..."
5. Active voice — "Detected anomaly" not "Anomaly was detected"
6. Technical terms are acceptable: "embedding shift", "authenticity score", "trust score"
7. Time: relative when recent ("2 min ago"), absolute when historical ("Nov 16, 2025")

---

## 9. Brand Applications

### 9.1 App UI

The primary brand surface. Dark-only — no light mode.

**Layout Structure**:
```
[Sidebar 256px] [Main Content Area]
  [TopBar 80px]
  [Content with p-8 padding]
```

**Grid**: `grid-cols-3 gap-6` for dashboard cards; `grid-cols-4 gap-6` for stats.

### 9.2 PDF Reports

| Element | Specification |
|---------|---------------|
| **Header banner** | `#1A1A2E` background, full-width, page 1 only |
| **Logo** | Embedded as base64, within header banner |
| **Accent strips** | Purple → Blue → Cyan gradient, `roundedRect` 3.5x9 |
| **Severity cards** | Color-coded top bars: green/yellow/orange/red |
| **Tables** | Dark header row, colored severity text |
| **Footer** | Logo + gradient line + page numbers on every page |
| **Font** | Helvetica (built into jsPDF) |

### 9.3 Presentation Slides

- **Background**: `#0F0F1E` solid or with subtle grid overlay
- **Title slides**: Logo centered, Space Grotesk Bold heading in white, subtitle in gray-400
- **Content slides**: Left-aligned white headings, gray-300 body, cyan highlights
- **Charts**: Primary = cyan-to-blue gradient, secondary = orange, tertiary = purple
- **Slide accent**: 4px cyan-to-blue gradient bar at bottom
- **Never**: White backgrounds, stock photography, clip art

### 9.4 Email Templates

- **Header**: Dark banner (`#1A1A2E`) with full logo, 600px max-width
- **Body**: `#0F0F1E` background, white headings, `#D1D5DB` body text
- **CTA button**: Cyan-to-blue gradient, rounded-md, white text
- **Alert emails**: Severity color bar (4px) at top of content
- **Footer**: Gray-500 text, unsubscribe link in cyan-400

### 9.5 Social Media

- **Profile image**: Eye-Only Icon on `#0F0F1E` with subtle cyan glow
- **Cover banner**: Dark background, grid pattern, full logo, "See What's Real." in gray-300
- **Posts**: Dark card style (`#1A1A2E`), cyan accent headlines, white body text
- **Rule**: Always maintain dark theme on social — never use light backgrounds

---

## 10. Quick Reference — CSS Design Tokens

```css
:root {
  /* Backgrounds */
  --rs-bg-deep:      #0A0A14;
  --rs-bg-base:      #0F0F1E;
  --rs-bg-recessed:  #141427;
  --rs-bg-card:      #1A1A2E;
  --rs-bg-elevated:  #2A2A3E;
  --rs-bg-hover:     #3A3A4E;

  /* Primary Accents */
  --rs-cyan:         #22D3EE;
  --rs-cyan-hover:   #06B6D4;
  --rs-blue:         #3B82F6;
  --rs-blue-active:  #2563EB;

  /* Secondary Accents */
  --rs-purple:       #A855F7;
  --rs-purple-deep:  #6D28D9;
  --rs-orange:       #FB923C;
  --rs-orange-dark:  #F97316;

  /* Severity */
  --rs-severity-low:      #4ADE80;
  --rs-severity-medium:   #FACC15;
  --rs-severity-high:     #FB923C;
  --rs-severity-critical: #F87171;
  --rs-info:              #60A5FA;

  /* Borders */
  --rs-border-default:  #1F2937;
  --rs-border-input:    #374151;
  --rs-border-subtle:   #4B5563;

  /* Radii */
  --rs-radius-sm:   8px;
  --rs-radius-md:   12px;
  --rs-radius-lg:   16px;
  --rs-radius-full: 9999px;

  /* Spacing */
  --rs-space-xs:  8px;
  --rs-space-sm:  12px;
  --rs-space-md:  16px;
  --rs-space-lg:  24px;
  --rs-space-xl:  32px;

  /* Typography */
  --rs-font-sans:  'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
  --rs-font-mono:  'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;

  /* Gradients */
  --rs-gradient-primary: linear-gradient(to right, #22D3EE, #3B82F6);
  --rs-gradient-hover:   linear-gradient(to right, #06B6D4, #2563EB);
  --rs-gradient-accent:  linear-gradient(to right, #6D28D9, #3B82F6, #22D3EE);
  --rs-gradient-divider: linear-gradient(to right, transparent, #374151, transparent);
}
```

---

*RealSync Brand Identity v1.0 — February 2026*
