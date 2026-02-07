#!/bin/bash
# Development startup script - runs both Next.js and Python API

echo "🚀 Starting Better-IMDB Development Environment..."

# Kill any existing processes
echo "Cleaning up existing processes..."
fuser -k 3000/tcp 2>/dev/null
fuser -k 8000/tcp 2>/dev/null
sleep 2

# Start Python API in background
echo "📦 Starting Python API on port 8000..."
cd cenima-cli
export PYTHONPATH=$PWD
python3 -m uvicorn cenima.api:app --reload --port 8000 > ../logs/python-api.log 2>&1 &
PYTHON_PID=$!
cd ..

# Wait for Python API to start
sleep 3
if curl -s http://localhost:8000/health > /dev/null; then
    echo "✅ Python API started successfully (PID: $PYTHON_PID)"
else
    echo "❌ Python API failed to start"
    exit 1
fi

# Start Next.js
echo "🎬 Starting Next.js on port 3000..."
echo ""
echo "======================================"
echo "  Both services running:"
echo "  • Next.js: http://localhost:3000"
echo "  • Python API: http://localhost:8000"
echo "======================================"
echo ""

npm run dev

# Cleanup on exit
trap "kill $PYTHON_PID 2>/dev/null" EXIT
