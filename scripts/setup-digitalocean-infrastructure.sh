#!/bin/bash

# Digital Ocean Graph Node Infrastructure Setup
# Run this script on your new DO droplet

echo "🌊 Setting up Graph Node infrastructure on Digital Ocean..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Docker and Docker Compose
echo "🐳 Installing Docker..."
sudo apt install -y docker.io docker-compose-v2
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

# Install Node.js and npm
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Graph CLI globally
echo "📊 Installing Graph CLI..."
sudo npm install -g @graphprotocol/graph-cli

# Create directory structure
echo "📁 Creating directories..."
mkdir -p ~/graph-node
cd ~/graph-node

# Create docker-compose.yml for Graph Node
echo "🔧 Creating Graph Node docker-compose configuration..."
cat > docker-compose.yml << 'EOF'
version: '3'
services:
  graph-node:
    image: graphprotocol/graph-node:latest
    ports:
      - '8000:8000'
      - '8001:8001'
      - '8020:8020'
      - '8030:8030'
      - '8040:8040'
    depends_on:
      - ipfs
      - postgres
    extra_hosts:
      - host.docker.internal:host-gateway
    environment:
      postgres_host: postgres
      postgres_user: graph-node
      postgres_pass: let-me-in
      postgres_db: graph-node
      ipfs: 'ipfs:5001'
      ethereum: 'base-sepolia:https://sepolia.base.org'
      GRAPH_LOG: info
      GRAPH_ALLOW_NON_DETERMINISTIC_IPFS: true
    restart: unless-stopped
    
  ipfs:
    image: ipfs/kubo:latest
    ports:
      - '5001:5001'
    volumes:
      - ./data/ipfs:/data/ipfs
    restart: unless-stopped
    
  postgres:
    image: postgres:14
    ports:
      - '5432:5432'
    command:
      [
        "postgres",
        "-cshared_preload_libraries=pg_stat_statements",
        "-cmax_connections=200"
      ]
    environment:
      POSTGRES_USER: graph-node
      POSTGRES_PASSWORD: let-me-in
      POSTGRES_DB: graph-node
      PGDATA: "/var/lib/postgresql/data"
      POSTGRES_INITDB_ARGS: "-E UTF8 --locale=C"
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
  ipfs_data:
EOF

# Create data directories
echo "📁 Creating data directories..."
mkdir -p data/postgres data/ipfs

# Set proper permissions
echo "🔐 Setting permissions..."
sudo chown -R 1000:1000 data/

# Create nginx configuration for reverse proxy
echo "🌐 Setting up Nginx reverse proxy..."
sudo apt install -y nginx

# Create nginx config for Graph Node
sudo tee /etc/nginx/sites-available/graph-node << 'EOF'
server {
    listen 80;
    server_name your-domain.com;  # Replace with your actual domain

    # Graph Node GraphQL endpoint
    location /subgraphs/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    
    # Graph Node admin endpoint
    location /admin/ {
        proxy_pass http://localhost:8020;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # IPFS gateway
    location /ipfs/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable the site
sudo ln -sf /etc/nginx/sites-available/graph-node /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx config
sudo nginx -t

# Create systemd service for Graph Node
echo "⚙️ Creating systemd service..."
sudo tee /etc/systemd/system/graph-node.service << 'EOF'
[Unit]
Description=Graph Node
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ubuntu/graph-node
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

# Enable the service
sudo systemctl daemon-reload
sudo systemctl enable graph-node

echo "✅ Infrastructure setup complete!"
echo ""
echo "🔧 Next steps:"
echo "1. Update /etc/nginx/sites-available/graph-node with your actual domain"
echo "2. Start the services:"
echo "   sudo systemctl start graph-node"
echo "   sudo systemctl reload nginx"
echo "3. Verify services are running:"
echo "   docker-compose ps"
echo "4. Check Graph Node is accessible:"
echo "   curl http://localhost:8000"
echo ""
echo "🌐 Once DNS is configured, your Graph Node will be available at:"
echo "   http://your-domain.com/subgraphs/name/forge-inventory"
echo ""
echo "📊 Admin interface:"
echo "   http://your-domain.com/admin/"
