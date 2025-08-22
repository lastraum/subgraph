#!/bin/bash

# Deploy to self-hosted Graph Node on Digital Ocean
echo "🌊 Deploying subgraph to Digital Ocean..."

# Check if required environment variables are set
if [ -z "$DO_GRAPH_NODE_URL" ]; then
    echo "❌ DO_GRAPH_NODE_URL environment variable is not set"
    echo "   Example: export DO_GRAPH_NODE_URL=\"https://your-graph-node.digitalocean.com\""
    exit 1
fi

if [ -z "$DO_IPFS_URL" ]; then
    echo "❌ DO_IPFS_URL environment variable is not set"
    echo "   Example: export DO_IPFS_URL=\"https://your-ipfs.digitalocean.com\""
    exit 1
fi

# Build the subgraph
echo "🔨 Building subgraph..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build successful"

# Create subgraph on Digital Ocean Graph Node
echo "🔄 Creating subgraph on Digital Ocean..."
npx graph create --node $DO_GRAPH_NODE_URL forge-inventory

# Deploy to Digital Ocean Graph Node
echo "📤 Deploying to Digital Ocean Graph Node..."
npx graph deploy --node $DO_GRAPH_NODE_URL --ipfs $DO_IPFS_URL forge-inventory

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    echo ""
    echo "🔗 Your subgraph is available at:"
    echo "   $DO_GRAPH_NODE_URL/subgraphs/name/forge-inventory"
    echo ""
    echo "📊 GraphiQL interface:"
    echo "   $DO_GRAPH_NODE_URL/subgraphs/name/forge-inventory/graphql"
else
    echo "❌ Deployment failed"
    exit 1
fi
