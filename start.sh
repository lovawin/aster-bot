#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "🤖 Aster Perps Bot"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Kill anything on 8000/3000
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
sleep 1

# Backend
echo "▶ Starting backend..."
cd "$ROOT/backend"
"$ROOT/venv/bin/python" server.py > "$ROOT/logs/backend.log" 2>&1 &
BACKEND_PID=$!

# Wait for backend
sleep 3
if ! curl -sf http://localhost:8000/status > /dev/null; then
  echo "✗ Backend failed to start. Check logs/backend.log"
  exit 1
fi
echo "✓ Backend running → http://localhost:8000"

# Frontend
echo "▶ Starting frontend..."
cd "$ROOT/frontend"
npm run dev > "$ROOT/logs/frontend.log" 2>&1 &
FRONTEND_PID=$!
sleep 4

echo "✓ Frontend running → http://localhost:3000"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "UI:  http://localhost:3000"
echo "API: http://localhost:8000"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Ctrl+C to stop both"

trap "echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Done.'" EXIT INT TERM
wait
