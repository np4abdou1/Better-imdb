#!/bin/bash
echo "=== Process Status ==="
ps aux | grep -E "uvicorn|node.*server\.js" | grep -v grep

echo -e "\n=== Port Listening Status ==="
sudo ss -tlnp | grep -E ":80|:8000"

echo -e "\n=== Firewall Status (UFW) ==="
sudo ufw status

echo -e "\n=== Testing Local Access ==="
echo "Python API Health:"
curl -s http://localhost:8000/health || echo "Failed"
echo -e "\n\nNext.js (port 80):"
curl -s -I http://localhost:80 | head -n 5 || echo "Failed"

echo -e "\n=== Recent Next.js Logs (last 30 lines) ==="
tail -n 30 logs/nextjs.log

echo -e "\n=== Recent Python API Logs (last 20 lines) ==="
tail -n 20 logs/python-api.log
