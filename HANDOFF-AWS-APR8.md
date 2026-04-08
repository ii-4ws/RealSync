# RealSync Handoff — Ahmed → Aws (08-04-2026)

## Branch to Work From
**`wip/frontend-v2-recovered`** — pushed to origin. Contains all fixes below.

---

## What Changed This Session (Session 31b + 32)

### Infrastructure: Railway → Oracle VPS
- Backend **migrated from Railway to Oracle Cloud VPS** (ARM aarch64, Always Free tier)
- Public URL: `api.real-sync.app` via Cloudflare Tunnel
- PM2 manages the Node.js process: `pm2 restart realsync-backend`
- SSH: `ssh ubuntu@84.235.248.83 -i ~/.ssh/id_ed25519`
- Railway retired due to persistent Docker cache invalidation bugs

### Landing Page (realsync-landing-main) — All Pushed
- Team section + Mobile App section added
- Dashboard app deployed at `/app` with production backend URLs
- Backend pointed to `api.real-sync.app`
- Null safety fixes for deepfake metrics
- Alert sound toggle in settings

### AI Pipeline Fixes (RunPod)
- **Face detection fixed**: installed `libgles2-mesa libegl1-mesa libegl1` on RunPod — MediaPipe needs OpenGL ES
- **Visual scoring recalibrated for Zoom compression**:
  - `frequency_analyzer.py`: sigmoid center shifted from -7.0 → -8.0 (H.264 strips high-freq texture)
  - `inference.py`: adaptive ensemble weights — when freq_score < 0.55, CLIP weight increases from 50% → 65%, freq drops from 30% → 15%
  - Result: real faces now score 83-85% "low" risk instead of 67% "medium"
- **DEEPFAKE_AUTH_THRESHOLD_LOW_RISK**: lowered from 0.70 → 0.60 in config.py on RunPod

### Backend Fixes (Oracle VPS)
- **Bot mic mute**: changed from Puppeteer `.click()` to JS `el.click()` — footer toolbar was off-viewport
- **Audio signal detection**: `audioHandler.js` now checks RMS energy > 100 before sending to AI. Silence from virtual PulseAudio sink is skipped entirely.
- **Trust score**: `frameHandler.js` uses 2-signal weighting (video + behavior) when `session.audioHasSignal` is false, preventing 0% audio from dragging trust down
- **PulseAudio monitor source**: `ZoomBotAdapter.js` now reads from `PULSE_MONITOR_SOURCE` env var (default: `virtual_speaker.monitor`)
- **PulseAudio virtual sink**: installed and configured on VPS with systemd user service

### Frontend-v2 Recovered
- Original source was lost (never committed to git)
- **Decompiled from minified Vite bundle** — 19 source files reconstructed
- **Fully wired to backend**: Supabase auth, WebSocket real-time, REST API
- Located at `frontend-v2-recovered/` in the repo
- `VITE_PROTOTYPE_MODE=1` bypasses auth for demo

### RunPod Pod Update
- **Active pod**: `ujy33s2joosthz` (realsync-e2e-test)
- **SSH**: `ssh root@205.196.17.172 -p 13046 -i ~/.ssh/id_ed25519`
- **Old pod** `p32q2t4crhraji` is dead (SSH refused)
- All 6 models loaded: clip_deepfake, emotion, face_detection, audio, text, whisper
- After pod restart, run: `apt-get install -y -qq libgles2-mesa libegl1-mesa libegl1`

---

## E2E Test Results (08-04-2026)

| Component | Status |
|-----------|--------|
| Frontend (real-sync.app/app) | Serving |
| Backend (api.real-sync.app) | Healthy (AI ok, Supabase ok) |
| AI (RunPod) | 6/6 models loaded |
| Bot joins Zoom | Working (Playwright chromium on ARM) |
| Frame capture | ~2s interval, ~1MB frames |
| Face detection | Working (BlazeFace via MediaPipe) |
| SPRT on real face | Converges to "real" |
| Visual score (real face) | 83-85% low risk |
| Emotion detection | Working (Neutral 79%, Happy 63% seen) |
| Bot mic mute | Fixed (JS click) |
| Audio capture | BROKEN on VPS (silence from virtual sink) |
| Trust score | 2-signal fallback when no audio (~87%) |

---

## What's Remaining

### Critical (Before Code Freeze Apr 9)
1. **Merge your `clip-detection` branch into main** — your commits: SPRT recalibration, adaptive frequency weight, stub/mock cleanup, text payload size check. Resolve conflicts with ensemble work.
2. **Fix VPS audio capture** — install Xvfb, run Chrome non-headless with `DISPLAY=:99`, remove `--mute-audio` from Puppeteer args. See plan below.
3. **E2E test with deepfake** — test with Deep Live Cam to verify fake faces score LOW and trigger alerts

### Important (Before Suzan Demo Apr 10)
4. **Technical poster** — not started
5. **Verify frontend-v2-recovered works end-to-end** — create session, bot joins, dashboard shows live data
6. **Reports page** — verify PDF export works with real data

### Before Submission (Apr 13)
7. **Update final report** — add architecture change (Railway→VPS), AI scoring calibration, audio signal detection
8. **Demo video** — record with OpenScreen after Suzan meeting
9. **Invite professor to GitHub** — Atwani needs to invite `mayelbarachi`
10. **Scrub Claude traces** — no co-authored-by, no .claude files, no AI commit messages in final

---

## Audio Fix Plan (Xvfb Approach)

The audio capture fails because headless Chrome doesn't route WebRTC audio to PulseAudio. Fix:

```bash
# On Oracle VPS
sudo apt install -y xvfb dbus dbus-x11

# Start virtual display
Xvfb :99 -screen 0 1920x1080x24 -ac &
export DISPLAY=:99

# In ZoomBotAdapter.js, change:
# headless: 'new'  →  headless: process.env.DISPLAY ? false : 'new'

# Remove '--mute-audio' from Puppeteer launch args

# Restart backend
DISPLAY=:99 pm2 restart realsync-backend
```

PulseAudio virtual sink is already configured. Once Chrome runs non-headless against Xvfb, Zoom's WebRTC audio will route through PulseAudio → `parec` captures it → AI analyzes real voice data.

---

## Key Files Modified This Session

```
# AI Pipeline (deployed to RunPod via SCP)
RealSync-AI-Prototype/serve/frequency_analyzer.py   # sigmoid center fix
RealSync-AI-Prototype/serve/inference.py             # adaptive ensemble weights
RealSync-AI-Prototype/serve/config.py                # threshold on RunPod only (not in git)

# Backend (deployed to VPS via SCP)
realsync-backend/bot/ZoomBotAdapter.js               # mute fix + PulseAudio source
realsync-backend/services/audioHandler.js             # silence detection
realsync-backend/services/frameHandler.js             # trust score audio exclusion

# Frontend-v2 (new)
frontend-v2-recovered/                                # entire recovered + wired app
```

---

## Services & Access

| Service | URL/Access |
|---------|-----------|
| Frontend | https://real-sync.app + /app |
| Backend | https://api.real-sync.app (Oracle VPS via Cloudflare Tunnel) |
| AI | RunPod pod ujy33s2joosthz, proxy: https://ujy33s2joosthz-5100.proxy.runpod.net |
| Supabase | https://quoanhdzcplrxnwnewct.supabase.co |
| VPS SSH | `ssh ubuntu@84.235.248.83` |
| RunPod SSH | `ssh root@205.196.17.172 -p 13046` |
| GitHub | AtwaniGG/RealSync, branch: wip/frontend-v2-recovered |
| HuggingFace | hxmodex/realsync-weights (public) |
