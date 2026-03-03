# RealSync Deployment Guide

This guide covers deploying RealSync's three services to production.

---

## 1. Prerequisites

Before starting, you need:

| Requirement | Purpose | Notes |
|---|---|---|
| **Supabase project** | Database + auth | You already have this |
| **Cloudflare account** | Frontend hosting (Pages) | Free tier works |
| **Cloud server** | Backend + AI service | AWS EC2, DigitalOcean, Railway, etc. |
| **Domain name** | Custom URL | Optional but recommended |
| **Node.js 20+** | Backend runtime | If not using Docker |
| **Python 3.10+** | AI service runtime | If not using Docker |
| **Docker** | Containerized deployment | Recommended for AI service |

---

## 2. Frontend Deployment (Cloudflare Pages)

### Steps

1. **Connect your GitHub repo** in the Cloudflare Pages dashboard
2. **Configure build settings:**
   - Build command: `cd Front-End && npm run build`
   - Build output directory: `Front-End/dist`
   - Root directory: `/` (leave as default)
3. **Set environment variables** in Cloudflare dashboard:

   | Variable | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://api.yourdomain.com` |
   | `VITE_WS_BASE_URL` | `wss://api.yourdomain.com` |
   | `VITE_SUPABASE_URL` | Your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | Your Supabase anon (public) key |

4. **SPA routing** is handled automatically by the `_redirects` file in `Front-End/public/`
5. Deploy triggers automatically on push to `main`

### Verify

- Visit the deployed URL
- Check browser console for API connection errors
- Confirm login/signup works (Supabase connectivity)

---

## 3. Backend Deployment (Cloud Server)

### Option A: Docker (Recommended)

```bash
# Build the image
cd realsync-backend
docker build -t realsync-backend .

# Run with env vars
docker run -d \
  --name realsync-backend \
  -p 4000:4000 \
  -e PORT=4000 \
  -e ALLOWED_ORIGIN=https://yourdomain.com \
  -e AI_SERVICE_URL=http://ai-service:5100 \
  -e AI_TIMEOUT_MS=5000 \
  -e AI_API_KEY=your-shared-secret \
  -e SUPABASE_URL=https://<your-project>.supabase.co \
  -e SUPABASE_SERVICE_KEY=<your-service-role-key> \
  -e REALSYNC_USE_GCP_STT=0 \
  -e REALSYNC_BOT_MODE=stub \
  -e LOG_LEVEL=info \
  realsync-backend
```

### Option B: Direct Node.js

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install dependencies
cd realsync-backend
npm ci --production

# Start with PM2 (process manager)
npm install -g pm2
pm2 start npm --name realsync-backend -- start
pm2 save
pm2 startup  # auto-start on reboot
```

### HTTPS with Reverse Proxy (Required)

WebSocket connections require HTTPS in production. Use Caddy (simplest) or nginx:

**Caddy** (auto-HTTPS with Let's Encrypt):
```
api.yourdomain.com {
    reverse_proxy localhost:4000
}
```

**nginx**:
```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

The `proxy_set_header Upgrade` and `Connection "upgrade"` lines are critical for WebSocket support.

---

## 4. AI Service Deployment

### Docker (Recommended)

Docker is strongly recommended because the AI service depends on OpenCV, PyTorch, and MediaPipe which have complex native dependencies.

```bash
cd RealSync-AI-Prototype
docker build -t realsync-ai .

docker run -d \
  --name realsync-ai \
  -p 5100:5100 \
  -e PORT=5100 \
  -e HOST=0.0.0.0 \
  -e AI_API_KEY=your-shared-secret \
  -e CORS_ALLOWED_ORIGIN=https://api.yourdomain.com \
  realsync-ai
```

### Resource Requirements

- **RAM**: ~4 GB minimum (ML models load into memory)
- **CPU**: 2+ cores recommended
- **GPU**: Not required (models run on CPU), but a GPU speeds up inference
- **Disk**: ~2 GB for models and dependencies

### Direct Python (Alternative)

```bash
cd RealSync-AI-Prototype
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run with gunicorn for production
pip install gunicorn
gunicorn serve.app:app -w 2 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:5100
```

---

## 5. Environment Variables Reference

### Frontend (`Front-End/.env`)

| Variable | Required | Example (Production) | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | Yes | `https://api.yourdomain.com` | Backend API URL |
| `VITE_WS_BASE_URL` | Yes | `wss://api.yourdomain.com` | Backend WebSocket URL |
| `VITE_SUPABASE_URL` | Yes | `https://<your-project>.supabase.co` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | `<your-supabase-anon-key>` | Supabase anon (public) key |

### Backend (`realsync-backend/.env`)

| Variable | Required | Example (Production) | Description |
|---|---|---|---|
| `PORT` | Yes | `4000` | Server port |
| `ALLOWED_ORIGIN` | Yes | `https://yourdomain.com` | Frontend URL for CORS |
| `AI_SERVICE_URL` | Yes | `http://ai-service:5100` | AI service URL (Docker service name or actual host URL) |
| `AI_TIMEOUT_MS` | No | `5000` | Timeout for AI requests (ms) |
| `AI_API_KEY` | Yes | `your-shared-secret` | Shared secret with AI service |
| `SUPABASE_URL` | Yes | `https://<your-project>.supabase.co` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | `<your-service-role-key>` | Supabase service_role key (keep secret!) |
| `REALSYNC_USE_GCP_STT` | No | `0` | Enable Google Cloud Speech-to-Text |
| `REALSYNC_BOT_MODE` | No | `stub` | Zoom bot mode (`stub` or `live`) |
| `LOG_LEVEL` | No | `info` | Logging level (`debug`, `info`, `warn`, `error`) |

### AI Service (`RealSync-AI-Prototype/.env`)

| Variable | Required | Example (Production) | Description |
|---|---|---|---|
| `PORT` | Yes | `5100` | Server port |
| `HOST` | Yes | `0.0.0.0` | Bind address |
| `AI_API_KEY` | Yes | `your-shared-secret` | Must match backend's `AI_API_KEY` |
| `CORS_ALLOWED_ORIGIN` | Yes | `https://api.yourdomain.com` | Backend URL for CORS |

---

## 6. Post-Deployment Checklist

After deploying all three services:

- [ ] **Health checks**: `curl https://api.yourdomain.com/health` returns 200
- [ ] **AI health**: `curl http://localhost:5100/health` returns 200 (from the server)
- [ ] **CORS**: Frontend can make API calls without CORS errors
- [ ] **WebSocket**: Dashboard connects and receives real-time updates
- [ ] **Supabase**: Login/signup works, sessions are stored
- [ ] **AI pipeline**: Start a session and verify deepfake detection scores appear
- [ ] **HTTPS**: All external traffic uses HTTPS/WSS (no mixed content)
- [ ] **Logs**: Check `pm2 logs` or `docker logs` for errors after first real usage

---

## Quick Start (Local Development)

```bash
# 1. Fill in Supabase credentials in all three .env files

# 2. Start AI service
cd RealSync-AI-Prototype
source .venv/bin/activate
python -m serve.app

# 3. Start backend
cd realsync-backend
npm install
npm start

# 4. Start frontend
cd Front-End
npm install
npm run dev

# Open http://localhost:5173
```
