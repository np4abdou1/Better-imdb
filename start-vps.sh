#!/bin/bash
# VPS Production Startup Script
# Runs both Next.js and Python API in production mode

set -e

echo "🚀 Starting Better-IMDB Production Server..."

# Kill any existing processes
echo "Cleaning up existing processes..."
pkill -f "uvicorn cenima.api" 2>/dev/null || true
pkill -f "node.*server.js" 2>/dev/null || true
sleep 2

# Create logs directory
mkdir -p logs

# Start Python API in background
echo "📦 Starting Python API on port 8000..."

# Check if venv exists in root directory first, then cenima-cli
if [ -d "venv" ]; then
    VENV_PATH="venv"
elif [ -d "cenima-cli/venv" ]; then
    VENV_PATH="cenima-cli/venv"
else
    echo "❌ Virtual environment not found! Run ./setup-vps.sh first"
    exit 1
fi

source "$VENV_PATH/bin/activate"
cd cenima-cli
export PYTHONPATH=$PWD
nohup python -m uvicorn cenima.api:app --host 0.0.0.0 --port 8000 > ../logs/python-api.log 2>&1 &
PYTHON_PID=$!
deactivate
cd ..

# Wait for Python API to start
echo "Waiting for Python API to initialize..."
sleep 5
if curl -s http://localhost:8000/health > /dev/null; then
    echo "✅ Python API started successfully (PID: $PYTHON_PID)"
else
    echo "❌ Python API failed to start. Check logs/python-api.log"
    exit 1
fi

# Start Next.js in production mode
echo "🎬 Starting Next.js production server on port 80..."

# Check if build exists
if [ ! -f ".next/standalone/server.js" ]; then
    echo "Building Next.js application..."
    npm run build
fi

# Allow Node to bind to port 80 without sudo
if ! getcap .next/standalone/server.js 2>/dev/null | grep -q cap_net_bind_service; then
    echo "Setting capabilities to bind to port 80..."
    sudo setcap cap_net_bind_service=+ep $(which node)
fi

# Start Next.js production server
cd .next/standalone
export PORT=80
export HOSTNAME=0.0.0.0
nohup node server.js > ../../logs/nextjs.log 2>&1 &
NEXTJS_PID=$!
cd ../..

# Wait for Next.js to start
echo "Waiting for Next.js to initialize..."
sleep 5
if curl -s http://localhost:80 > /dev/null; then
    echo "✅ Next.js started successfully (PID: $NEXTJS_PID)"
else
    echo "❌ Next.js failed to start. Check logs/nextjs.log"
    exit 1
fi

echo ""
echo "======================================"
echo "  ✅ Better-IMDB is running!"
echo "======================================"
echo "  • Python API (internal): http://localhost:8000"
echo "  • Next.js (public): http://YOUR_VPS_IP"
echo ""
echo "  PIDs:"
echo "    - Python API: $PYTHON_PID"
echo "    - Next.js: $NEXTJS_PID"
echo ""
echo "  Logs:"
echo "    - Python: logs/python-api.log"
echo "    - Next.js: logs/nextjs.log"
echo ""
echo "  To stop: pkill -f 'uvicorn|node.*server.js'"
echo "======================================"
