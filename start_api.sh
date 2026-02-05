#!/bin/bash
# Kill any existing python process on port 8000
fuser -k 8000/tcp 2>/dev/null

# Clean up any leftover __pycache__ or .pyc files
find . -name "*.pyc" -delete
find . -name "__pycache__" -delete

# Navigate to cenima-cli
cd cenima-cli

# Export PYTHONPATH to current directory to ensure local package is used
export PYTHONPATH=$PWD

# Run the API with uvicorn
echo "Starting Python API..."
python3 -m uvicorn cenima.api:app --reload --port 8000
