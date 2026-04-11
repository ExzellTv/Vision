#!/bin/bash
set -e

echo "=== Vision - AI-Powered Land Feasibility Intelligence ==="
echo ""

# ── Backend setup ──────────────────────────────────────────────
echo "[1/4] Installing Python dependencies..."
cd backend
pip install -q -r requirements.txt 2>/dev/null
cd ..

# ── Frontend setup ─────────────────────────────────────────────
echo "[2/4] Installing Node dependencies..."
cd frontend
npm install --silent 2>/dev/null
cd ..

# ── Start backend ──────────────────────────────────────────────
echo "[3/4] Starting backend on :8000..."
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# Wait for backend to be ready
echo "     Waiting for backend..."
for i in $(seq 1 30); do
  if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "     Backend ready!"
    break
  fi
  sleep 1
done

# ── Start frontend ─────────────────────────────────────────────
echo "[4/4] Starting frontend on :5173..."
cd frontend
npx vite --host 0.0.0.0 --port 5173

# Cleanup
kill $BACKEND_PID 2>/dev/null
