# Digital Ocean Graph Node Setup Guide

## 🌊 Complete Setup Process

### Step 1: Create Digital Ocean Droplet

1. **Create new droplet** in Digital Ocean:
   - **Size**: 4GB RAM / 2 CPUs (minimum)
   - **Storage**: 50GB+ SSD 
   - **OS**: Ubuntu 22.04 LTS
   - **Region**: Same as your main server (for low latency)

2. **Configure DNS** (optional but recommended):
   - Add A record: `graph.yourdomain.com` → Droplet IP
   - Or use the droplet IP directly

### Step 2: Setup Graph Node Infrastructure

1. **SSH into your new droplet**:
   ```bash
   ssh root@your-droplet-ip
   ```

2. **Copy and run the setup script**:
   ```bash
   # Copy the setup script to your droplet
   curl -o setup.sh https://raw.githubusercontent.com/your-repo/setup-digitalocean-infrastructure.sh
   chmod +x setup.sh
   ./setup.sh
   ```

   **OR manually copy the script content and run it**

3. **Update domain in nginx config**:
   ```bash
   sudo nano /etc/nginx/sites-available/graph-node
   # Replace "your-domain.com" with your actual domain or IP
   ```

4. **Start the services**:
   ```bash
   cd ~/graph-node
   sudo systemctl start graph-node
   sudo systemctl reload nginx
   ```

5. **Verify everything is running**:
   ```bash
   docker-compose ps
   curl http://localhost:8000
   ```

### Step 3: Deploy Subgraph

1. **Set environment variables** (on your local machine):
   ```bash
   export DO_GRAPH_NODE_URL="http://your-droplet-ip:8020"
   export DO_IPFS_URL="http://your-droplet-ip:5001"
   
   # OR if you set up a domain:
   export DO_GRAPH_NODE_URL="https://graph.yourdomain.com/admin"
   export DO_IPFS_URL="https://graph.yourdomain.com/ipfs"
   ```

2. **Deploy the subgraph**:
   ```bash
   cd /path/to/forge/subgraph
   npm run deploy-digitalocean
   ```

### Step 4: Update Your Server Configuration

Update your main server to use the production subgraph:

```bash
# In your server .env file:
SUBGRAPH_URL=http://your-droplet-ip:8000/subgraphs/name/forge-inventory
# OR with domain:
SUBGRAPH_URL=https://graph.yourdomain.com/subgraphs/name/forge-inventory
```

## 🔧 Useful Commands

### Check Graph Node Status
```bash
# On the droplet:
docker-compose ps
docker-compose logs graph-node
```

### Monitor Indexing Progress
```bash
# Check if subgraph is syncing:
curl "http://localhost:8030/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ indexingStatusForCurrentVersion(subgraphName: \"forge-inventory\") { synced health fatalError { message } chains { chainHeadBlock { number } latestBlock { number } } } }"}'
```

### Restart Services
```bash
# On the droplet:
cd ~/graph-node
docker-compose restart
sudo systemctl reload nginx
```

## 🌐 Endpoints

Once deployed, your subgraph will be available at:

- **GraphQL Endpoint**: `http://your-ip:8000/subgraphs/name/forge-inventory`
- **GraphiQL Interface**: `http://your-ip:8000/subgraphs/name/forge-inventory/graphql`
- **Admin API**: `http://your-ip:8020`
- **IPFS Gateway**: `http://your-ip:8080`

## 🔒 Security Notes

- **Firewall**: Consider restricting access to admin ports (8020, 5432)
- **SSL**: Set up SSL certificates for production use
- **Monitoring**: Set up monitoring for the Graph Node services
- **Backups**: Regular PostgreSQL backups for indexed data

## 🚨 Troubleshooting

### Graph Node Won't Start
```bash
# Check logs:
docker-compose logs graph-node

# Common issues:
# 1. PostgreSQL connection issues
# 2. IPFS not accessible
# 3. Ethereum RPC issues
```

### Subgraph Deployment Fails
```bash
# Check if Graph Node is accessible:
curl http://localhost:8020

# Verify IPFS is running:
curl http://localhost:5001/api/v0/id
```

### Slow Indexing
- Check Ethereum RPC endpoint performance
- Monitor PostgreSQL performance
- Ensure adequate RAM (4GB minimum)
