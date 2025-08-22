#!/bin/bash

# Setup script for local Graph Node without Docker
echo "🚀 Setting up local Graph Node (native)..."

# Check if required tools are installed
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed. Aborting." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm is required but not installed. Aborting." >&2; exit 1; }

# Install Graph Node globally if not already installed
if ! command -v graph-node >/dev/null 2>&1; then
    echo "📦 Installing Graph Node..."
    npm install -g @graphprotocol/graph-node
fi

# Create local data directory
mkdir -p local-data

# Create a simple local configuration
cat > local-config.toml << 'EOF'
[store]
[store.primary]
connection = "postgresql://postgres:password@localhost:5432/graph_node"
pool_size = 10

[chains]
base-sepolia = { url = "https://sepolia.base.org", features = ["archive", "traces"] }

[deployment]
[[deployment.rule]]
match = { name = "forge-inventory" }
[deployment.rule.network]
base-sepolia = [
  { url = "https://sepolia.base.org", features = ["archive", "traces"] }
]

[ipfs]
url = "https://ipfs.infura.io:5001"

[metrics]
query = "0.0.0.0:8030"
server = "0.0.0.0:8040"
EOF

echo "✅ Created local configuration"

# Check if PostgreSQL is available
if command -v psql >/dev/null 2>&1; then
    echo "✅ PostgreSQL found"
else
    echo "⚠️  PostgreSQL not found. You'll need to install it:"
    echo "   brew install postgresql"
    echo "   brew services start postgresql"
    echo ""
fi

echo "🎯 Alternative: Use hosted IPFS and simple file storage"
echo ""
echo "Creating simplified setup without PostgreSQL..."

# Create a simple file-based storage setup
cat > simple-local-config.toml << 'EOF'
[store]
[store.primary]
connection = "file:./local-data/graph.db"

[chains]
base-sepolia = { url = "https://sepolia.base.org", features = [] }

[ipfs]
url = "https://ipfs.infura.io:5001"

[metrics]
query = "0.0.0.0:8030"
server = "0.0.0.0:8040"
EOF

echo "✅ Created simplified configuration"
echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Start Graph Node: npm run start-local-native"
echo "  2. Create subgraph: npm run create-local"
echo "  3. Deploy subgraph: npm run deploy-local"
echo ""
echo "📊 Access points:"
echo "  - GraphiQL: http://localhost:8000/subgraphs/name/forge-inventory"
echo "  - Metrics: http://localhost:8040"
echo ""
