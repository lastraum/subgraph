#!/bin/bash

# PM2 setup script for existing Digital Ocean droplet
echo "🚀 Setting up Forge Subgraph with PM2..."

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p /root/express/the-forge-subgraph
mkdir -p /var/log/pm2

# Install Node.js if not already installed
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install PM2 globally if not already installed
if ! command -v pm2 &> /dev/null; then
    echo "⚙️ Installing PM2..."
    sudo npm install -g pm2
    
    # Setup PM2 startup script
    pm2 startup
    echo "⚠️  Run the command above to setup PM2 auto-start"
fi

echo "✅ Setup complete!"
echo ""
echo "🔧 Next steps:"
echo "1. Copy your subgraph files to /root/express/the-forge-subgraph/"
echo "2. Run: cd /root/express/the-forge-subgraph && npm install"
echo "3. Start with: pm2 start pm2.ecosystem.config.js"
echo "4. Save PM2 config: pm2 save"
echo ""
echo "📊 Monitor with:"
echo "   pm2 status"
echo "   pm2 logs forge-subgraph"
echo "   pm2 monit"
