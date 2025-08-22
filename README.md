# The Forge Inventory Subgraph

A Graph Protocol subgraph for indexing The Forge on-chain inventory contract events on Base network.

## Features

- **Token Creation Tracking** - Index all `TokenCreated` events
- **Minting & Transfer Events** - Track token mints and transfers
- **Role Management** - Monitor role grants and revocations
- **User Analytics** - Track user interactions and balances
- **Daily Statistics** - Aggregate daily metrics
- **Global Stats** - Overall platform statistics

## Quick Start

### Prerequisites

- Node.js 16+
- Docker (for local development)
- Graph CLI: `npm install -g @graphprotocol/graph-cli`

### Local Development

1. **Setup local Graph Node**:
   ```bash
   npm run setup-local
   ```
   This will start:
   - Graph Node (port 8000)
   - IPFS (port 5001)  
   - PostgreSQL (port 5432)

2. **Create and deploy subgraph**:
   ```bash
   npm run create-local
   npm run deploy-local
   ```

3. **Access GraphiQL**:
   Open http://localhost:8000/subgraphs/name/forge-inventory

### Production Deployment

#### Option 1: The Graph Studio (Recommended)

1. **Create subgraph** at https://thegraph.com/studio/
2. **Set environment variables**:
   ```bash
   export GRAPH_ACCESS_TOKEN="your-access-token"
   export SUBGRAPH_NAME="your-github-username/forge-inventory"
   ```
3. **Deploy**:
   ```bash
   npm run deploy-production
   ```

#### Option 2: Self-hosted on Digital Ocean

1. **Set up Graph Node on Digital Ocean** (separate setup required)
2. **Set environment variables**:
   ```bash
   export DO_GRAPH_NODE_URL="https://your-graph-node.digitalocean.com"
   export DO_IPFS_URL="https://your-ipfs.digitalocean.com"
   ```
3. **Deploy**:
   ```bash
   npm run deploy-digitalocean
   ```

## Configuration

### Contract Configuration

Update `subgraph.yaml` with your contract details:

```yaml
dataSources:
  - name: ForgeInventory
    source:
      address: "0xYourContractAddress"
      startBlock: 18800000  # Block when contract was deployed
```

### Network Configuration

For different networks, update the `network` field in `subgraph.yaml`:

- `base-sepolia` (testnet)
- `base` (mainnet)

## GraphQL Schema

### Key Entities

- **Token** - Individual token types with metadata
- **TokenCreation** - Token creation events
- **TokenMint** - Minting events
- **User** - User accounts and statistics
- **UserTokenBalance** - Current user token balances
- **RoleChange** - Role management events
- **GlobalStats** - Platform-wide statistics
- **DailyStats** - Daily aggregated metrics

### Example Queries

#### Get all tokens:
```graphql
{
  tokens(first: 10, orderBy: createdAt, orderDirection: desc) {
    id
    tokenId
    category
    subCategory
    tokenType
    currentSupply
    maxSupply
    creator
    createdAt
  }
}
```

#### Get user token balances:
```graphql
{
  userTokenBalances(where: { user: "0x..." }) {
    token {
      tokenId
      category
      subCategory
    }
    balance
    lastUpdated
  }
}
```

#### Get recent token creations:
```graphql
{
  tokenCreations(first: 20, orderBy: timestamp, orderDirection: desc) {
    token {
      tokenId
      category
      subCategory
    }
    creator {
      address
    }
    timestamp
    transactionHash
  }
}
```

#### Get daily statistics:
```graphql
{
  dailyStats(first: 30, orderBy: date, orderDirection: desc) {
    date
    tokensCreated
    tokensMinted
    activeUsers
  }
}
```

## Development Commands

```bash
# Local development
npm run setup-local      # Setup local Graph Node
npm run create-local     # Create subgraph locally
npm run deploy-local     # Deploy to local node
npm run logs-local       # View Graph Node logs
npm run stop-local       # Stop local services
npm run clean-local      # Clean local data

# Build & codegen
npm run codegen          # Generate TypeScript types
npm run build           # Build subgraph
npm run prepare         # Codegen + build

# Production deployment
npm run deploy-production    # Deploy to The Graph Studio
npm run deploy-digitalocean  # Deploy to self-hosted DO node
```

## Monitoring

### Local Development
- **GraphiQL**: http://localhost:8000/subgraphs/name/forge-inventory
- **Graph Node**: http://localhost:8000
- **IPFS**: http://localhost:5001

### Production
- **The Graph Studio**: https://thegraph.com/studio/
- **Subgraph Health**: Monitor sync status and errors

## Integration

### Frontend Integration

Install dependencies:
```bash
npm install @apollo/client graphql
```

Setup Apollo Client:
```typescript
import { ApolloClient, InMemoryCache, gql } from '@apollo/client';

const client = new ApolloClient({
  uri: 'http://localhost:8000/subgraphs/name/forge-inventory', // Local
  // uri: 'https://api.studio.thegraph.com/query/your-subgraph', // Production
  cache: new InMemoryCache(),
});

// Query tokens
const GET_TOKENS = gql`
  query GetTokens($first: Int!) {
    tokens(first: $first, orderBy: createdAt, orderDirection: desc) {
      id
      tokenId
      category
      subCategory
      tokenType
      currentSupply
      creator
      createdAt
    }
  }
`;
```

### Server Integration

Replace direct blockchain queries with GraphQL:
```typescript
// Before: Direct RPC calls
const events = await contract.queryFilter(filter, -2000);

// After: GraphQL query
const { data } = await client.query({
  query: GET_TOKEN_HISTORY,
  variables: { first: 50 }
});
```

## Troubleshooting

### Common Issues

1. **Build Errors**: Run `npm run codegen` after schema changes
2. **Deployment Fails**: Check contract address and start block
3. **No Data**: Verify contract events are being emitted
4. **Sync Issues**: Check Graph Node logs with `npm run logs-local`

### Reset Local Environment

```bash
npm run clean-local
npm run setup-local
npm run create-local
npm run deploy-local
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Update schema/mappings as needed
4. Test locally
5. Submit pull request

## License

MIT License - see LICENSE file for details.
