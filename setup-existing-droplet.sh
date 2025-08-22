#!/bin/bash

# Quick Graph Node setup for existing Digital Ocean droplet
echo "🌊 Setting up Graph Node on existing droplet..."

# Install Docker if not already installed
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    sudo apt update
    sudo apt install -y docker.io docker-compose-v2
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker $USER
    echo "✅ Docker installed"
else
    echo "✅ Docker already installed"
fi

# Install Node.js and Graph CLI if not already installed
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

if ! command -v graph &> /dev/null; then
    echo "📊 Installing Graph CLI..."
    sudo npm install -g @graphprotocol/graph-cli
fi

# Create directory structure
echo "📁 Creating graph-node directory..."
mkdir -p ~/graph-node/data/{postgres,ipfs,graph-node}

# Set proper permissions
echo "🔐 Setting permissions..."
sudo chown -R $USER:$USER ~/graph-node
chmod -R 755 ~/graph-node

echo "✅ Setup complete!"
echo ""
echo "🔧 Next steps:"
echo "1. Copy docker-compose.production.yml to ~/graph-node/docker-compose.yml"
echo "2. Start services: cd ~/graph-node && docker-compose up -d"
echo "3. Check status: docker-compose ps"
echo "4. Deploy subgraph from your local machine"
echo ""
echo "🌐 Services will be available at:"
echo "   GraphQL: http://$(curl -s ifconfig.me):8000"
echo "   Admin: http://$(curl -s ifconfig.me):8020"
echo "   IPFS: http://$(curl -s ifconfig.me):5001"
