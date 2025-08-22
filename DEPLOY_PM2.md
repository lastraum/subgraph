# PM2 Deployment Guide - Digital Ocean

## 🚀 Simple PM2 Setup (No Docker)

### Files to Upload to Your Droplet

Upload these files to `/root/express/the-forge-subgraph/` on your droplet:

#### Core Files:
- `dev-server.js` (your existing GraphQL server)
- `schema.graphql` (GraphQL schema)
- `abis/ForgeInventory.json` (contract ABI)

#### Configuration Files:
- `production-package.json` → rename to `package.json`
- `pm2.ecosystem.config.js` (PM2 configuration)
- `setup-pm2.sh` (setup script)

### Step-by-Step Deployment

#### 1. Upload Files
```bash
# Create directory on droplet
ssh root@your-droplet-ip "mkdir -p /root/express/the-forge-subgraph"

# Upload via SCP/SFTP:
scp dev-server.js root@your-droplet-ip:/root/express/the-forge-subgraph/
scp schema.graphql root@your-droplet-ip:/root/express/the-forge-subgraph/
scp -r abis/ root@your-droplet-ip:/root/express/the-forge-subgraph/
scp production-package.json root@your-droplet-ip:/root/express/the-forge-subgraph/package.json
scp pm2.ecosystem.config.js root@your-droplet-ip:/root/express/the-forge-subgraph/
scp setup-pm2.sh root@your-droplet-ip:/root/express/the-forge-subgraph/
```

#### 2. Run Setup on Droplet
```bash
# SSH into droplet
ssh user@your-droplet-ip

# Run setup
cd /root/express/the-forge-subgraph
chmod +x setup-pm2.sh
./setup-pm2.sh

# Install dependencies
npm install

# Start with PM2
pm2 start pm2.ecosystem.config.js

# Save PM2 configuration
pm2 save
```

#### 3. Configure Nginx (Optional)
Add this to your existing Nginx configuration:

```nginx
# Add to your server block
location /subgraphs/ {
    proxy_pass http://localhost:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Enable CORS
    add_header Access-Control-Allow-Origin "*";
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
    add_header Access-Control-Allow-Headers "Content-Type";
}
```

### Environment Configuration

Your subgraph will run with these settings:
- **Port**: 4000
- **Contract**: `0xD21C2B389073cC05251D3afC0B41674BF05C62e9`
- **Network**: Base Sepolia
- **RPC**: `https://sepolia.base.org`

### GraphQL Endpoints

Once deployed:
- **GraphQL Endpoint**: `http://your-droplet-ip:4000/graphql`
- **With domain**: `https://theforgecore.xyz/subgraphs/name/forge-inventory`

### PM2 Management Commands

```bash
# Check status
pm2 status

# View logs
pm2 logs forge-subgraph

# Restart service
pm2 restart forge-subgraph

# Stop service
pm2 stop forge-subgraph

# Monitor in real-time
pm2 monit

# View detailed info
pm2 describe forge-subgraph
```

### Update Your Server Configuration

In your main server's `.env` file:
```bash
# Replace dev server with production
SUBGRAPH_URL=http://your-droplet-ip:4000/graphql
# Or with domain:
SUBGRAPH_URL=https://theforgecore.xyz/subgraphs/name/forge-inventory
```

### Troubleshooting

#### Check if service is running:
```bash
pm2 status
curl http://localhost:4000/graphql
```

#### View logs:
```bash
pm2 logs forge-subgraph --lines 50
```

#### Restart if needed:
```bash
pm2 restart forge-subgraph
```

#### Check disk space:
```bash
df -h
```

### File Structure on Droplet
```
/root/express/the-forge-subgraph/
├── dev-server.js
├── package.json
├── pm2.ecosystem.config.js
├── schema.graphql
├── abis/
│   └── ForgeInventory.json
├── node_modules/
└── setup-pm2.sh
```
