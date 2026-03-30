#!/bin/bash
# Start RealSync — all 3 services in one command

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# M8: Graceful shutdown — SIGTERM first, then SIGKILL after 3s grace period
echo "Cleaning up old processes..."
PIDS=$(lsof -ti:5173,4000,5100 2>/dev/null)
if [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill -TERM 2>/dev/null
  sleep 3
  for pid in $PIDS; do kill -0 $pid 2>/dev/null && kill -9 $pid 2>/dev/null; done
fi
sleep 1

echo "Starting RealSync AI Service (port 5100)..."
cd "$ROOT_DIR/RealSync-AI-Prototype" && .venv/bin/python -m serve.app &
AI_PID=$!

# M9: Wait for AI service to be ready before starting backend
echo "Waiting for AI service..."
AI_READY=0
for i in $(seq 1 30); do
  if curl -sf http://localhost:5100/api/health >/dev/null 2>&1; then
    AI_READY=1
    break
  fi
  sleep 2
done
if [ "$AI_READY" -eq 0 ]; then
  echo "WARNING: AI service health check timed out after 60s. Starting backend anyway..."
fi

echo "Starting RealSync Backend (port 4000)..."
cd "$ROOT_DIR/realsync-backend" && node index.js &
BACKEND_PID=$!

echo "Starting RealSync Frontend (port 5173)..."
cd "$ROOT_DIR/Front-End" && npx vite --port 5173 &
FRONTEND_PID=$!

echo ""
echo "========================================"
echo "  RealSync is running!"
echo "========================================"
echo "  Frontend:   http://localhost:5173"
echo "  Backend:    http://localhost:4000"
echo "  AI Service: http://localhost:5100"
echo "========================================"
echo ""
echo "Press Ctrl+C to stop all services."

trap "kill $AI_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
