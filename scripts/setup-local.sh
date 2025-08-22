#!/bin/bash

# Setup script for local Graph Node development
echo "🚀 Setting up local Graph Node..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Create docker-compose.yml for local Graph Node
cat > docker-compose.yml << 'EOF'
version: '3'
services:
  graph-node:
    image: graphprotocol/graph-node
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

  ipfs:
    image: ipfs/go-ipfs:v0.10.0
    ports:
      - '5001:5001'
    volumes:
      - ./data/ipfs:/data/ipfs

  postgres:
    image: postgres
    ports:
      - '5432:5432'
    command:
      [
        "postgres",
        "-cshared_preload_libraries=pg_stat_statements"
      ]
    environment:
      POSTGRES_USER: graph-node
      POSTGRES_PASSWORD: let-me-in
      POSTGRES_DB: graph-node
      POSTGRES_INITDB_ARGS: "-E UTF8 --locale=C"
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
EOF

echo "✅ Created docker-compose.yml"

# Create data directories
mkdir -p data/ipfs data/postgres

echo "✅ Created data directories"

# Start the services
echo "🔄 Starting Graph Node services..."
docker-compose up -d

echo "⏳ Waiting for services to start..."
sleep 30

# Check if services are running
if curl -s http://localhost:8000 > /dev/null; then
    echo "✅ Graph Node is running on http://localhost:8000"
else
    echo "❌ Graph Node failed to start"
    exit 1
fi

if curl -s http://localhost:5001/api/v0/id > /dev/null; then
    echo "✅ IPFS is running on http://localhost:5001"
else
    echo "❌ IPFS failed to start"
    exit 1
fi

echo ""
echo "🎉 Local Graph Node setup complete!"
echo ""
echo "📋 Services:"
echo "  - Graph Node: http://localhost:8000"
echo "  - GraphiQL: http://localhost:8000/subgraphs/name/forge-inventory"
echo "  - IPFS: http://localhost:5001"
echo "  - Postgres: localhost:5432"
echo ""
echo "🚀 Next steps:"
echo "  1. npm run create-local"
echo "  2. npm run deploy-local"
echo ""
