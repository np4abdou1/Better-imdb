#!/bin/bash
# Emergency firewall fix script
# Run this on VPS if cloud provider doesn't have firewall controls

echo "🔥 Opening ports 80 and 443 for web traffic..."

# Check current iptables rules
echo "Current INPUT rules:"
sudo iptables -L INPUT -n --line-numbers

# Allow ports 80 and 443
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 22 -j ACCEPT  # Keep SSH open

# Save rules (Ubuntu/Debian)
if command -v netfilter-persistent &> /dev/null; then
    sudo netfilter-persistent save
    echo "✅ Rules saved with netfilter-persistent"
elif command -v iptables-save &> /dev/null; then
    sudo sh -c "iptables-save > /etc/iptables/rules.v4"
    echo "✅ Rules saved to /etc/iptables/rules.v4"
else
    echo "⚠️  Please save rules manually"
fi

echo ""
echo "✅ Firewall rules updated:"
sudo iptables -L INPUT -n --line-numbers | grep -E "80|443"

echo ""
echo "🧪 Testing external access..."
echo "Try accessing http://68.221.160.1 in your browser now!"
