#!/bin/bash
# VPS Setup Script for Better-IMDB
# Creates virtual environment and installs all dependencies

set -e

echo "🚀 Setting up Better-IMDB on VPS..."

# Install system dependencies
echo "📦 Checking system dependencies..."
if ! command -v python3 &> /dev/null; then
    echo "Installing Python3..."
    sudo apt update
    sudo apt install -y python3 python3-venv python3-pip
fi

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# Install npm dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Create Python virtual environment
echo "🐍 Creating Python virtual environment..."
cd cenima-cli
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "✅ Virtual environment created"
else
    echo "Virtual environment already exists"
fi

# Activate and install Python dependencies
echo "📦 Installing Python dependencies..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the application:"
echo "  ./start-vps.sh"
echo ""
