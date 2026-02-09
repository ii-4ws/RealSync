#!/bin/bash
# Start RealSync — all 3 services in one command

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting RealSync AI Service (port 5100)..."
cd "$ROOT_DIR/RealSync-AI-Prototype/serve" && python3 app.py &
AI_PID=$!

echo "Starting RealSync Backend (port 4000)..."
cd "$ROOT_DIR/realsync-backend" && node index.js &
BACKEND_PID=$!

echo "Starting RealSync Frontend (port 3000)..."
cd "$ROOT_DIR/Front-End" && npm run dev &
FRONTEND_PID=$!

echo ""
echo "========================================"
echo "  RealSync is running!"
echo "========================================"
echo "  Frontend:   http://localhost:3000"
echo "  Backend:    http://localhost:4000"
echo "  AI Service: http://localhost:5100"
echo "========================================"
echo ""
echo "Press Ctrl+C to stop all services."

trap "kill $AI_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
