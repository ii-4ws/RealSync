# Deployment Blockers

Identified during comprehensive 6-agent audit (2026-03-02). Address before production deployment.

## Docker / Container

1. **`.dockerignore` excludes `*.pth`** — AI model weights won't be included in Docker images. Need a model delivery mechanism (volume mount, S3 download, or Git LFS).
2. **No model weight delivery mechanism** — No script or process to download/provision model weights at deploy time.
3. **No backend `.dockerignore`** — `.env` and other secrets could leak into the Docker image.
4. **PyTorch installs full CUDA (~2.5GB) on CPU** — `Dockerfile` should pin `torch+cpu` wheel to reduce image size from ~4GB to ~1.5GB.

## Railway / Platform

5. **No `railway.toml` platform config** — No health check, build, or start commands configured for Railway.
6. **`/api/health` returns 503** — When models fail to load, health endpoint returns 503, causing Railway to restart in a loop.
7. **AI cold start 25-50s** — Model loading exceeds Railway's default health check timeout. Need readiness probe or lazy loading.

## Security

8. **Live Supabase `service_role` key in `.env`** — Rotate key; use environment variable injection at deploy time, never commit.
9. **AI service `.gitignore` missing `.env`** — Risk of accidentally committing secrets.
10. **AI service no authentication** — `/api/analyze/*` endpoints are unauthenticated. Any network-adjacent client can call them.

## Models

11. **Emotion model silent random weights** — When `.pth` missing, model initializes with random weights and silently produces garbage. *(Also a demo blocker — fixed separately.)*
12. **FaceNet downloads at runtime** — `facenet_pytorch` downloads VGGFace2 weights on first run, adding 30s+ to cold start and failing without internet.

## Operations

13. **No CI/CD pipeline** — No automated tests, linting, or deployment pipeline.
14. **Sessions without `endedAt` leak memory** — In-memory sessions map grows unbounded if sessions are never ended. Need TTL-based cleanup.
