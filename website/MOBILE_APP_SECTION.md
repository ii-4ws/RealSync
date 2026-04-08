# Mobile App Section — Re-integration Guide

If we decide to release the mobile app, here's how to add the section back to the landing page.

## Backup Files (with mobile section included)

- `client/src/pages/LandingRedesignWithMobile.tsx` — Landing page with MobileAppSection
- `client/src/components/redesign/NavbarWithMobile.tsx` — Navbar with "Mobile App" nav link
- `client/src/components/redesign/MobileAppSection.tsx` — The full section component (kept in repo)
- `client/src/assets/screenshots/{dashboard,sessions,details}.webp` — Real app screenshots (kept in repo)

## Steps to Re-enable

1. **Replace LandingRedesign.tsx** with the backup:
   ```bash
   cp client/src/pages/LandingRedesignWithMobile.tsx client/src/pages/LandingRedesign.tsx
   ```

2. **Replace Navbar.tsx** with the backup:
   ```bash
   cp client/src/components/redesign/NavbarWithMobile.tsx client/src/components/redesign/Navbar.tsx
   ```

3. Build and deploy.

## What the Section Contains

- 3D interactive phone mockup with tilt effect (mouse-tracking, spring physics)
- Auto-rotating screenshot carousel (3.5s interval) showing real app screens:
  - Dashboard (91% Trust Score, live alerts)
  - Sessions (meeting history, trust scores)
  - Details (emotion analysis, identity, deepfake detection)
- Floating notification bubbles (Identity Verified, Deepfake Detected, etc.)
- Feature highlights grid (Live Alerts, Session Monitoring, Trust Scores, Offline Mode)
- App Store + Google Play "Coming Soon" badges
- Radar pulse rings + glow aura animations
- BorderBeam component on phone frame
- Fully responsive (mobile tilt disabled on touch devices)
