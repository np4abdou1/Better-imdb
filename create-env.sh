#!/bin/bash
# Create production .env file on VPS

cat > .env << 'EOF'
# GitHub Authentication
AUTH_GITHUB_ID=Ov23liSdXDBz0OhZFiHD
AUTH_GITHUB_SECRET=c893de16f5d7e2af5a792f690ae248512712b887
AUTH_SECRET=aEQ7niaXgX0Z5wG7HNtSSi+QplWGcLBr453jcTgvFq0=

# TMDB API Key
TMDB_API_KEY=d229b5dbbe5325a45570dae06e574a42

# MongoDB Connection
MONGODB_URI=mongodb+srv://np4abdou:TULVzSijWE4ivrMS@cluster0.3eqfqyt.mongodb.net/?appName=Cluster0

# VPS URLs
AUTH_URL=http://68.221.160.1:8080
NEXT_PUBLIC_APP_URL=http://68.221.160.1:8080
AUTH_TRUST_HOST=true

# Python API
PYTHON_API_URL=http://localhost:8000

# Production Mode
NODE_ENV=production

# AI (Optional)
GITHUB_TOKEN=
AI_MODEL=gpt-4.1
AI_MAX_TOKENS=4096
EOF

echo "✅ .env file created with production values"
echo ""
echo "Now run:"
echo "  npm run build"
echo "  ./start-vps.sh"
