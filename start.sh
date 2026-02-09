#!/bin/bash
# Start RealSync — backend + frontend in one command

echo "Starting RealSync Backend (port 4000)..."
cd "$(dirname "$0")/realsync-backend" && node index.js &
BACKEND_PID=$!

echo "Starting RealSync Frontend (port 3000)..."
cd "$(dirname "$0")/Front-End" && npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Backend:  http://localhost:4000"
echo "✅ Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
