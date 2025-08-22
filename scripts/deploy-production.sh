#!/bin/bash

# Production deployment script for Digital Ocean
echo "🚀 Deploying subgraph to production..."

# Check if required environment variables are set
if [ -z "$GRAPH_ACCESS_TOKEN" ]; then
    echo "❌ GRAPH_ACCESS_TOKEN environment variable is not set"
    echo "   Get your access token from: https://thegraph.com/studio/"
    exit 1
fi

if [ -z "$SUBGRAPH_NAME" ]; then
    echo "❌ SUBGRAPH_NAME environment variable is not set"
    echo "   Example: export SUBGRAPH_NAME=\"your-github-username/forge-inventory\""
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

# Deploy to The Graph Studio (Hosted Service alternative)
echo "📤 Deploying to The Graph Studio..."

# For Studio deployment
npx graph deploy --studio $SUBGRAPH_NAME --access-token $GRAPH_ACCESS_TOKEN

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    echo ""
    echo "🔗 Your subgraph will be available at:"
    echo "   https://api.studio.thegraph.com/query/$SUBGRAPH_NAME"
    echo ""
    echo "📊 Monitor deployment at:"
    echo "   https://thegraph.com/studio/subgraph/$SUBGRAPH_NAME"
else
    echo "❌ Deployment failed"
    exit 1
fi
