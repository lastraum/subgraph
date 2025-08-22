#!/usr/bin/env node

/**
 * Simple development server for testing subgraph queries without Docker
 * This simulates the Graph Node GraphQL endpoint for local development
 */

const express = require('express');
const { createHandler } = require('graphql-http/lib/use/express');
const { buildSchema, graphql } = require('graphql');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Read the simplified GraphQL schema for development
const schemaPath = path.join(__dirname, 'dev-schema.graphql');
const schemaSource = fs.readFileSync(schemaPath, 'utf8');

// Build executable schema
const schema = buildSchema(schemaSource);

// Real data storage - starts empty, populated from blockchain
let realData = {
  tokens: [],
  tokenCreations: [],
  tokenMints: [],
  users: [],
  userTokenBalances: [],
  roleChanges: [],
  allEvents: [], // New comprehensive event journal
  globalStats: {
    id: 'global',
    totalTokens: '0',
    totalMints: '0', 
    totalUsers: '0',
    totalSupply: '0',
    totalEvents: '0',
    lastUpdated: '0'
  },
  dailyStats: []
};

// Contract connection for real data - using multiple RPC providers for reliability
const rpcProviders = [
  'https://sepolia.base.org',
  'https://base-sepolia-rpc.publicnode.com',
  'https://base-sepolia.blockpi.network/v1/rpc/public'
];

let currentProviderIndex = 0;
let provider = new ethers.JsonRpcProvider(rpcProviders[currentProviderIndex]);
const contractAddress = '0xD21C2B389073cC05251D3afC0B41674BF05C62e9';

// Function to switch to next RPC provider on error
function switchProvider() {
  currentProviderIndex = (currentProviderIndex + 1) % rpcProviders.length;
  provider = new ethers.JsonRpcProvider(rpcProviders[currentProviderIndex]);
  console.log(`🔄 Switched to RPC provider: ${rpcProviders[currentProviderIndex]}`);
  return provider;
}

// Simplified ABI for events (fixed syntax)
const contractABI = [
  "event TokenCreated(uint256 indexed tokenId, uint8 tokenType, string category, string subCategory)",
  "event TokenMinted(address indexed to, uint256 indexed tokenId, uint256 amount, uint8 tokenType)",
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)"
];

let contract = new ethers.Contract(contractAddress, contractABI, provider);

// Fetch real events from contract
async function fetchRealData() {
  console.log('📡 Fetching real contract events...');
  
  // Clear existing data to replace with fresh real data
  realData.tokens = [];
  realData.tokenCreations = [];
  realData.users = [];
  realData.tokenMints = [];
  realData.userTokenBalances = [];
  realData.roleChanges = [];
  realData.allEvents = [];
  
  try {
    // Use specific starting block where the contract was deployed/first used
    const startBlock = 29970000; // Start earlier to catch all events
    const currentBlock = await provider.getBlockNumber();
    console.log(`📊 Current block: ${currentBlock}`);
    
    // Search from the specific start block to current, but break into chunks
    const fromBlock = startBlock;
    const maxBlockRange = 45000; // Stay under 50k limit
    const blocksToSearch = currentBlock - fromBlock;
    
    console.log(`🔍 Searching from block ${fromBlock} to ${currentBlock} (${blocksToSearch} blocks from contract deployment)`);
    console.log(`📦 Breaking into chunks of ${maxBlockRange} blocks to avoid RPC limits`);
    
    // Debug: Check if we're on the right network
    const network = await provider.getNetwork();
    console.log(`🌐 Network: ${network.name} (chainId: ${network.chainId})`);
    
    // Debug: Check contract code exists
    const contractCode = await provider.getCode(contractAddress);
    console.log(`📋 Contract code exists: ${contractCode !== '0x' ? 'YES' : 'NO'}`);
    if (contractCode === '0x') {
      console.error(`❌ No contract found at ${contractAddress} on this network!`);
      return;
    }
    
    // Get ALL event types with retry logic, but in chunks
    const maxRetries = 3;
    let allEvents = [];
    
    // Function to get events with retry in chunks
    const getEventsWithRetryInChunks = async (eventFilter, eventName) => {
      let allEvents = [];
      let currentFromBlock = fromBlock;
      
      while (currentFromBlock < currentBlock) {
        const currentToBlock = Math.min(currentFromBlock + maxBlockRange, currentBlock);
        console.log(`🔍 Fetching ${eventName} from block ${currentFromBlock} to ${currentToBlock}`);
        
        let retries = 0;
        let chunkEvents = [];
        
        while (retries < maxRetries) {
          try {
            chunkEvents = await contract.queryFilter(eventFilter, currentFromBlock, currentToBlock);
            console.log(`✅ Found ${chunkEvents.length} ${eventName} events in chunk ${currentFromBlock}-${currentToBlock}`);
            break;
          } catch (error) {
            retries++;
            console.log(`⚠️  Retry ${retries}/${maxRetries} for ${eventName} chunk ${currentFromBlock}-${currentToBlock} - RPC error:`, error.message);
            
            if (retries < maxRetries) {
              switchProvider();
              contract = new ethers.Contract(contractAddress, contractABI, provider);
              await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
              console.error(`❌ Failed to get ${eventName} events for chunk ${currentFromBlock}-${currentToBlock} after ${maxRetries} retries`);
              break;
            }
          }
        }
        
        allEvents.push(...chunkEvents.map(event => ({ ...event, eventName })));
        currentFromBlock = currentToBlock + 1;
        
        // Small delay between chunks to be nice to RPC
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      return allEvents;
    };

    // Fetch all available event types with error handling
    const eventResults = {};
    
    // Helper function to safely fetch events
    const safeGetEvents = async (eventName, filterFunction) => {
      try {
        console.log(`🔍 Fetching ${eventName} events...`);
        if (typeof filterFunction === 'function') {
          return await getEventsWithRetryInChunks(filterFunction(), eventName);
        } else {
          console.log(`⚠️  ${eventName} filter not available in contract`);
          return [];
        }
      } catch (error) {
        console.log(`⚠️  ${eventName} events not available:`, error.message);
        return [];
      }
    };

    eventResults.tokenCreated = await getEventsWithRetryInChunks(contract.filters?.TokenCreated, 'TokenCreated');
    eventResults.tokenMinted = await getEventsWithRetryInChunks(contract.filters?.TokenMinted, 'TokenMinted');
    eventResults.transferSingle = await getEventsWithRetryInChunks(contract.filters?.TransferSingle, 'TransferSingle');
    eventResults.transferBatch = await getEventsWithRetryInChunks(contract.filters?.TransferBatch, 'TransferBatch');
    eventResults.roleGranted = await getEventsWithRetryInChunks(contract.filters?.RoleGranted, 'RoleGranted');
    eventResults.roleRevoked = await getEventsWithRetryInChunks(contract.filters?.RoleRevoked, 'RoleRevoked');

    // Log event counts
    console.log(`📊 Event Summary:`);
    console.log(`  - TokenCreated: ${eventResults.tokenCreated.length}`);
    console.log(`  - TransferSingle: ${eventResults.transferSingle.length}`);
    console.log(`  - TransferBatch: ${eventResults.transferBatch.length}`);
    console.log(`  - RoleGranted: ${eventResults.roleGranted.length}`);
    console.log(`  - RoleRevoked: ${eventResults.roleRevoked.length}`);

    // Combine all events and sort by block number and log index
    allEvents = [
      ...eventResults.tokenCreated,
      ...eventResults.transferSingle,
      ...eventResults.transferBatch,
      ...eventResults.roleGranted,
      ...eventResults.roleRevoked
    ].sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) {
        return a.blockNumber - b.blockNumber;
      }
      return (a.logIndex || 0) - (b.logIndex || 0);
    });

    console.log(`✅ Total events found: ${allEvents.length}`);
    
    // Process ALL events into comprehensive journal
    console.log(`🔄 Processing ${allEvents.length} events...`);
    for (let i = 0; i < allEvents.length; i++) {
      const event = allEvents[i];
      try {
        console.log(`📝 Processing event ${i + 1}/${allEvents.length}: ${event.eventName} - ${event.transactionHash}`);
        
        // Get block and transaction data using provider
        const block = await provider.getBlock(event.blockNumber);
        const transaction = await provider.getTransaction(event.transactionHash);
        
        if (!block || !transaction) {
          console.log(`⚠️  Missing block or transaction data for ${event.transactionHash}, skipping...`);
          continue;
        }
        
        // Create base event data
        const baseEventData = {
          id: `${event.transactionHash}-${event.logIndex}`,
          eventType: event.eventName,
          blockNumber: event.blockNumber.toString(),
          blockHash: event.blockHash,
          transactionHash: event.transactionHash,
          transactionIndex: event.transactionIndex?.toString() || '0',
          logIndex: event.logIndex?.toString() || '0',
          timestamp: block.timestamp.toString(),
          gasUsed: transaction.gasUsed?.toString() || '0',
          gasPrice: transaction.gasPrice?.toString() || '0',
          from: transaction.from,
          to: transaction.to || contractAddress,
          value: transaction.value?.toString() || '0'
        };

        // Add event-specific data based on event type
        if (event.eventName === 'TokenCreated') {
          const tokenId = event.args.tokenId.toString();
          const creatorAddress = transaction.from;
          
          // Add to comprehensive events journal
          realData.allEvents.push({
            ...baseEventData,
            tokenId: tokenId,
            tokenType: event.args.tokenType.toString(),
            category: event.args.category,
            subCategory: event.args.subCategory,
            creator: creatorAddress,
            description: `Token ${tokenId} created in category ${event.args.category}/${event.args.subCategory}`
          });

          // Also add to legacy token data structures
          if (!realData.tokens.find(t => t.id === tokenId)) {
            realData.tokens.push({
              id: tokenId,
              tokenId: tokenId,
              tokenType: event.args.tokenType.toString(),
              category: event.args.category,
              subCategory: event.args.subCategory,
              soulbound: false,
              maxSupply: '0',
              currentSupply: '0',
              creator: creatorAddress,
              tokenURI: '',
              createdAt: block.timestamp.toString(),
              createdAtBlock: event.blockNumber.toString(),
              createdTxHash: event.transactionHash,
              forgeId: ''  // Will be populated when metadata is fetched
            });
          }

          const creationId = `${event.transactionHash}-${event.logIndex}`;
          if (!realData.tokenCreations.find(tc => tc.id === creationId)) {
            realData.tokenCreations.push({
              id: creationId,
              token: tokenId,
              tokenId: tokenId,
              tokenType: event.args.tokenType.toString(),
              category: event.args.category,
              subCategory: event.args.subCategory,
              creator: creatorAddress.toLowerCase(),
              timestamp: block.timestamp.toString(),
              blockNumber: event.blockNumber.toString(),
              transactionHash: event.transactionHash
            });
          }

        } else if (event.eventName === 'TransferSingle') {
          const tokenId = event.args.id?.toString() || 'unknown';
          const from = event.args.from;
          const to = event.args.to;
          const value = event.args.value?.toString() || '1';
          const numericValue = parseInt(value) || 1;
          
          realData.allEvents.push({
            ...baseEventData,
            tokenId: tokenId,
            fromAddress: from,
            toAddress: to,
            amount: value,
            operator: event.args.operator,
            description: from === '0x0000000000000000000000000000000000000000' 
              ? `Minted ${value} of token ${tokenId} to ${to.substring(0, 8)}...`
              : `Transferred ${value} of token ${tokenId} from ${from.substring(0, 8)}... to ${to.substring(0, 8)}...`
          });

          // Update token supply tracking
          const existingToken = realData.tokens.find(t => t.tokenId === tokenId);
          if (existingToken) {
            if (from === '0x0000000000000000000000000000000000000000') {
              // This is a mint operation - increase current supply
              const currentSupply = parseInt(existingToken.currentSupply) || 0;
              existingToken.currentSupply = (currentSupply + numericValue).toString();
              console.log(`📊 [DevServer] Updated token ${tokenId} supply: ${existingToken.currentSupply} (+${numericValue})`);
              
              // Create TokenMint entity for minting events
              const mintId = `${event.transactionHash}-${event.logIndex}-${tokenId}`;
              
              const tokenMint = {
                id: mintId,
                token: tokenId,
                to: to.toLowerCase(),
                amount: value,
                timestamp: block.timestamp.toString(),
                blockNumber: event.blockNumber.toString(),
                transactionHash: event.transactionHash,
                operator: event.args.operator,
                // Enhanced metadata fields
                tokenName: existingToken?.name || `Token ${tokenId}`,
                tokenDescription: existingToken?.description || '',
                tokenImage: existingToken?.image || '',
                tokenCategory: existingToken?.category || 'Unknown',
                tokenSubCategory: existingToken?.subCategory || 'Unknown',
                rewardId: existingToken?.rewardId || '',
                tokenForgeId: existingToken?.forgeId || ''
              };
              realData.tokenMints.push(tokenMint);
              console.log(`📊 [DevServer] Created TokenMint: ${mintId} for token ${tokenId} to ${to.substring(0, 8)}...`);
              
            } else if (to === '0x0000000000000000000000000000000000000000') {
              // This is a burn operation - decrease current supply
              const currentSupply = parseInt(existingToken.currentSupply) || 0;
              existingToken.currentSupply = Math.max(0, currentSupply - numericValue).toString();
              console.log(`📊 [DevServer] Updated token ${tokenId} supply: ${existingToken.currentSupply} (-${numericValue})`);
            }
            // For regular transfers (from user to user), supply doesn't change
          } else {
            console.warn(`⚠️ [DevServer] TransferSingle for unknown token ${tokenId} - this might be a minted token that wasn't created through our contract`);
          }

        } else if (event.eventName === 'TransferBatch') {
          const tokenIds = event.args.ids?.map(id => id.toString()) || [];
          const values = event.args.values?.map(val => val.toString()) || [];
          const from = event.args.from;
          const to = event.args.to;
          
          realData.allEvents.push({
            ...baseEventData,
            tokenIds: tokenIds.join(','),
            amounts: values.join(','),
            fromAddress: from,
            toAddress: to,
            operator: event.args.operator,
            description: from === '0x0000000000000000000000000000000000000000'
              ? `Batch minted ${tokenIds.length} token types to ${to.substring(0, 8)}...`
              : `Batch transferred ${tokenIds.length} token types from ${from.substring(0, 8)}... to ${to.substring(0, 8)}...`
          });

          // Update supply tracking for batch operations
          for (let i = 0; i < tokenIds.length; i++) {
            const tokenId = tokenIds[i];
            const value = values[i];
            const numericValue = parseInt(value) || 1;
            
            const existingToken = realData.tokens.find(t => t.tokenId === tokenId);
            if (existingToken) {
              if (from === '0x0000000000000000000000000000000000000000') {
                // Batch mint operation - increase current supply
                const currentSupply = parseInt(existingToken.currentSupply) || 0;
                existingToken.currentSupply = (currentSupply + numericValue).toString();
                console.log(`📊 [DevServer] Batch updated token ${tokenId} supply: ${existingToken.currentSupply} (+${numericValue})`);
              } else if (to === '0x0000000000000000000000000000000000000000') {
                // Batch burn operation - decrease current supply
                const currentSupply = parseInt(existingToken.currentSupply) || 0;
                existingToken.currentSupply = Math.max(0, currentSupply - numericValue).toString();
                console.log(`📊 [DevServer] Batch updated token ${tokenId} supply: ${existingToken.currentSupply} (-${numericValue})`);
              }
            } else {
              console.warn(`⚠️ [DevServer] TransferBatch for unknown token ${tokenId}`);
            }
          }

        } else if (event.eventName === 'RoleGranted') {
          const role = event.args.role;
          const account = event.args.account;
          const sender = event.args.sender;
          
          // Convert role hash to readable name
          const roleName = role === '0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6' 
            ? 'MINTER_ROLE' 
            : role === '0x0000000000000000000000000000000000000000000000000000000000000000'
            ? 'DEFAULT_ADMIN_ROLE'
            : 'UNKNOWN_ROLE';
          
          realData.allEvents.push({
            ...baseEventData,
            role: roleName,
            roleHash: role,
            account: account,
            sender: sender,
            description: `${roleName} granted to ${account.substring(0, 8)}... by ${sender.substring(0, 8)}...`
          });

        } else if (event.eventName === 'TokenMinted') {
          const tokenId = event.args.tokenId?.toString() || 'unknown';
          const to = event.args.to;
          const amount = event.args.amount?.toString() || '1';
          const tokenType = event.args.tokenType?.toString() || '0';
          
          realData.allEvents.push({
            ...baseEventData,
            tokenId: tokenId,
            toAddress: to,
            amount: amount,
            tokenType: tokenType,
            description: `Minted ${amount} of token ${tokenId} (type ${tokenType}) to ${to.substring(0, 8)}...`
          });

          // Update user tracking for mint events
          const userAddress = to.toLowerCase();
          let user = realData.users.find(u => u.id === userAddress);
          if (!user) {
            user = {
              id: userAddress,
              address: to,
              totalTokensCreated: '0',
              totalTokensMinted: '0',
              firstInteraction: block.timestamp.toString(),
              lastInteraction: block.timestamp.toString()
            };
            realData.users.push(user);
          }
          user.lastInteraction = block.timestamp.toString();
          
          // Increment total tokens minted for this user
          const currentMinted = parseInt(user.totalTokensMinted) || 0;
          user.totalTokensMinted = (currentMinted + parseInt(amount)).toString();
          
          console.log(`📊 [DevServer] User ${userAddress} now has ${user.totalTokensMinted} total tokens minted`);
        } else if (event.eventName === 'RoleRevoked') {
          const role = event.args.role;
          const account = event.args.account;
          const sender = event.args.sender;
          
          const roleName = role === '0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6' 
            ? 'MINTER_ROLE' 
            : role === '0x0000000000000000000000000000000000000000000000000000000000000000'
            ? 'DEFAULT_ADMIN_ROLE'
            : 'UNKNOWN_ROLE';
          
          realData.allEvents.push({
            ...baseEventData,
            role: roleName,
            roleHash: role,
            account: account,
            sender: sender,
            description: `${roleName} revoked from ${account.substring(0, 8)}... by ${sender.substring(0, 8)}...`
          });
        }

        // Update user tracking for all events
        const userAddress = transaction.from.toLowerCase();
        let user = realData.users.find(u => u.id === userAddress);
        if (!user) {
          user = {
            id: userAddress,
            address: transaction.from,
            totalTokensCreated: '0',
            totalTokensMinted: '0',
            firstInteraction: block.timestamp.toString(),
            lastInteraction: block.timestamp.toString()
          };
          realData.users.push(user);
        }
        user.lastInteraction = block.timestamp.toString();

      } catch (eventError) {
        console.error(`❌ Error processing ${event.eventName} event ${event.transactionHash}:`, eventError.message);
        continue;
      }
    }


    
    // Update global stats
    realData.globalStats.totalTokens = realData.tokens.length.toString();
    realData.globalStats.totalUsers = realData.users.length.toString();
    realData.globalStats.totalEvents = realData.allEvents.length.toString();
    
    // Calculate total supply across all tokens
    const totalSupply = realData.tokens.reduce((sum, token) => {
      return sum + (parseInt(token.currentSupply) || 0);
    }, 0);
    realData.globalStats.totalSupply = totalSupply.toString();
    realData.globalStats.totalMints = totalSupply.toString(); // For backward compatibility
    
    realData.globalStats.lastUpdated = Math.floor(Date.now() / 1000).toString();
    
    console.log(`📊 Processed data: ${realData.tokens.length} tokens, ${realData.users.length} users, ${realData.allEvents.length} total events, ${totalSupply} total supply`);
    
  } catch (error) {
    console.error('❌ Error fetching real data:', error.message);
    console.error('Full error:', error);
    // Don't fall back to mock data - keep empty arrays for real data only
  }
}

// GraphQL resolvers
const root = {
  // Token queries
  tokens: ({ first = 10, orderBy = 'createdAt', orderDirection = 'desc', where = {} }) => {
    // Ensure we always return an array, even if realData.tokens is undefined
    let filtered = realData.tokens || [];
    
    console.log(`🔍 [Resolver] tokens() called - realData.tokens length: ${realData.tokens?.length || 0}`);
    
    // Apply filters
    if (where.category) {
      filtered = filtered.filter(t => t.category.toLowerCase().includes(where.category.toLowerCase()));
    }
    if (where.category_contains_nocase) {
      filtered = filtered.filter(t => t.category.toLowerCase().includes(where.category_contains_nocase.toLowerCase()));
    }
    
    // Apply ordering
    if (orderBy === 'createdAt') {
      filtered.sort((a, b) => {
        const aVal = parseInt(a.createdAt);
        const bVal = parseInt(b.createdAt);
        return orderDirection === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }
    
    const result = filtered.slice(0, first);
    console.log(`🔍 [Resolver] tokens() returning: ${result.length} tokens`);
    return result;
  },
  
  token: ({ id }) => realData.tokens.find(t => t.id === id),
  
  // Token creation queries
  tokenCreations: ({ first = 10, orderBy = 'timestamp', orderDirection = 'desc' }) => {
    let sorted = [...realData.tokenCreations];
    
    if (orderBy === 'timestamp') {
      sorted.sort((a, b) => {
        const aVal = parseInt(a.timestamp);
        const bVal = parseInt(b.timestamp);
        return orderDirection === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }
    
    return sorted.slice(0, first).map(tc => ({
      ...tc,
      token: realData.tokens.find(t => t.id === tc.token),
      creator: realData.users.find(u => u.id === tc.creator)
    }));
  },
  
  // User queries
  users: ({ first = 10, orderBy = 'totalTokensCreated', orderDirection = 'desc', where = {} }) => {
    // Ensure we always return an array, even if realData.users is undefined
    let filtered = realData.users || [];
    
    if (where.totalTokensCreated_gt) {
      filtered = filtered.filter(u => parseInt(u.totalTokensCreated) > parseInt(where.totalTokensCreated_gt));
    }
    
    if (orderBy === 'totalTokensCreated') {
      filtered.sort((a, b) => {
        const aVal = parseInt(a.totalTokensCreated);
        const bVal = parseInt(b.totalTokensCreated);
        return orderDirection === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }
    
    return filtered.slice(0, first);
  },
  
  user: ({ id }) => {
    const user = realData.users.find(u => u.id === id.toLowerCase());
    if (!user) return null;
    
    return {
      ...user,
      balances: realData.userTokenBalances.filter(b => b.user === user.id).map(b => ({
        ...b,
        token: realData.tokens.find(t => t.id === b.token),
        user: user
      })),
      tokensCreated: realData.tokenCreations.filter(tc => tc.creator === user.id).map(tc => ({
        ...tc,
        token: realData.tokens.find(t => t.id === tc.token),
        creator: user
      }))
    };
  },
  
  // All Events queries (comprehensive event journal)
  allEvents: ({ first = 50, eventType, skip = 0, orderBy = 'timestamp', orderDirection = 'desc' }) => {
    let events = [...realData.allEvents];
    
    // Filter by event type if specified
    if (eventType) {
      events = events.filter(event => event.eventType === eventType);
    }
    
    // Apply ordering
    if (orderBy === 'timestamp') {
      events.sort((a, b) => {
        const aVal = parseInt(a.timestamp);
        const bVal = parseInt(b.timestamp);
        return orderDirection === 'desc' ? bVal - aVal : aVal - bVal;
      });
    } else if (orderBy === 'blockNumber') {
      events.sort((a, b) => {
        const aVal = parseInt(a.blockNumber);
        const bVal = parseInt(b.blockNumber);
        return orderDirection === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }
    
    // Apply skip and limit
    return events.slice(skip, skip + first);
  },

  // Token mint queries
  tokenMints: ({ first = 10, orderBy = 'timestamp', orderDirection = 'desc', where = {} }) => {
    // Ensure we always return an array, even if realData.tokenMints is undefined
    let filtered = [...(realData.tokenMints || [])];
    
    // Apply filters
    if (where.to) {
      filtered = filtered.filter(mint => mint.to.toLowerCase() === where.to.toLowerCase());
    }
    
    // Apply ordering
    if (orderBy === 'timestamp') {
      filtered.sort((a, b) => {
        const aVal = parseInt(a.timestamp);
        const bVal = parseInt(b.timestamp);
        return orderDirection === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }
    
    return filtered.slice(0, first).map(mint => ({
      ...mint,
      token: (realData.tokens || []).find(t => t.tokenId === mint.token),
      to: { id: mint.to, address: mint.to }
    }));
  },
  
  // User token balance queries
  userTokenBalances: ({ first = 10, where = {} }) => {
    return realData.userTokenBalances.slice(0, first);
  },
  
  // Role change queries
  roleChanges: ({ first = 10, orderBy = 'timestamp', orderDirection = 'desc' }) => {
    return realData.roleChanges.slice(0, first);
  },
  
  // Stats queries
  globalStats: ({ id }) => realData.globalStats,
  
  dailyStats: ({ first = 30, orderBy = 'date', orderDirection = 'desc' }) => {
    return realData.dailyStats.slice(0, first);
  }
};

// Create Express app
const app = express();

// Add body parsing middleware for JSON requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS with more permissive settings
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// GraphQL endpoint
app.all('/subgraphs/name/forge-inventory', createHandler({
  schema: schema,
  rootValue: root,
  formatError: (error) => {
    console.error('GraphQL Error:', error);
    return error;
  }
}));

// POST endpoint for GraphQL queries
app.post('/subgraphs/name/forge-inventory/graphql', async (req, res) => {
  try {
    const { query, variables } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'No query provided' });
    }
    
    console.log(`🔍 [DevServer] GraphQL Query: ${query.substring(0, 100)}...`);
    
    // Execute the query using our resolvers
    console.log(`🔍 [DevServer] About to execute GraphQL with:`);
    console.log(`   - Schema: ${schema ? 'EXISTS' : 'MISSING'}`);
    console.log(`   - RootValue: ${root ? 'EXISTS' : 'MISSING'}`);
    console.log(`   - RealData tokens: ${realData?.tokens?.length || 0}`);
    console.log(`   - RealData users: ${realData?.users?.length || 0}`);
    
    const result = await graphql({
      schema: schema,
      source: query,
      variableValues: variables || {},
      rootValue: root,
      contextValue: { realData }
    });
    
    if (result.errors) {
      console.log(`⚠️ [DevServer] GraphQL errors:`, result.errors);
    } else {
      console.log(`✅ [DevServer] GraphQL executed successfully`);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ [DevServer] GraphQL execution error:', error);
    res.status(500).json({ 
      error: 'GraphQL execution failed', 
      message: error.message 
    });
  }
});

// Simple GraphiQL interface without external CDN dependencies
app.get('/subgraphs/name/forge-inventory/graphql', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>GraphiQL - The Forge Inventory</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .query-area { width: 100%; height: 300px; font-family: monospace; border: 1px solid #ddd; border-radius: 4px; padding: 10px; }
        .result-area { width: 100%; height: 400px; font-family: monospace; border: 1px solid #ddd; border-radius: 4px; padding: 10px; background: #f9f9f9; }
        .button { background: #007cba; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin: 10px 5px; }
        .button:hover { background: #005a87; }
        .examples { margin: 20px 0; }
        .example-query { background: #f0f0f0; padding: 10px; margin: 10px 0; border-radius: 4px; cursor: pointer; }
        .example-query:hover { background: #e0e0e0; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔥 The Forge Inventory GraphQL</h1>
        <p>Test GraphQL queries for your on-chain inventory contract</p>
        
        <div class="examples">
          <h3>Example Queries (click to use):</h3>
          <div class="example-query" onclick="setQuery(this.textContent)">
{ tokens(first: 10) { id tokenId category subCategory tokenType creator createdAt } }
          </div>
          <div class="example-query" onclick="setQuery(this.textContent)">
{ globalStats(id: \\"global\\") { totalTokens totalUsers lastUpdated } }
          </div>
          <div class="example-query" onclick="setQuery(this.textContent)">
{ tokenCreations(first: 5) { id tokenId category creator { address } timestamp } }
          </div>
          <div class="example-query" onclick="setQuery(this.textContent)">
{ allEvents(first: 20, orderBy: \\"timestamp\\", orderDirection: \\"desc\\") { id eventType timestamp transactionHash description tokenId tokenType category } }
          </div>
          <div class="example-query" onclick="setQuery(this.textContent)">
{ users(first: 10) { id address totalTokensCreated totalTokensMinted firstInteraction lastInteraction } }
          </div>
          <div class="example-query" onclick="setQuery(this.textContent)">
{ user(id: "0xaabe0ecfaf9e028d63cf7ea7e772cf52d662691a") { id address totalTokensCreated totalTokensMinted balances { balance token { id tokenId category } } } }
          </div>
          <div class="example-query" onclick="setQuery(this.textContent)">
{ tokenMints(first: 100) { id amount timestamp token { id tokenId category subCategory } to { address } } }
          </div>
          <div class="example-query" onclick="setQuery(this.textContent)">
{ allEvents(first: 20, eventType: "TransferSingle") { id eventType timestamp description tokenId fromAddress toAddress amount } }
          </div>
          <div class="example-query" onclick="setQuery(this.textContent)">
{ tokenMints(first: 100, where: { to: "0xaabe0ecfaf9e028d63cf7ea7e772cf52d662691a" }) { id amount timestamp token { id tokenId category subCategory } to { address } } }
          </div>
          <div class="example-query" onclick="setQuery(this.textContent)">
{ users(first: 10) { id address totalTokensMinted totalTokensCreated } }
          </div>
          <div class="example-query" onclick="setQuery(this.textContent)">
{ user(id: "0xaabe0ecfaf9e028d63cf7ea7e772cf52d662691a") { id address totalTokensMinted totalTokensCreated firstInteraction lastInteraction } }
          </div>
          <div class="example-query" onclick="setQuery(this.textContent)">
        { tokenMints(first: 100, where: { to: "0xaabe0ecfaf9e028d63cf7ea7e772cf52d662691a" }) { id amount timestamp tokenName tokenDescription tokenImage tokenCategory tokenSubCategory tokenForgeId token { id tokenId category subCategory } to { address } } }
          </div>
        </div>
        
        <div>
          <textarea id="query" class="query-area" placeholder="Enter your GraphQL query here...">
{ tokens(first: 10) { id tokenId category subCategory tokenType creator createdAt } }
          </textarea>
        </div>
        
        <div>
          <button class="button" onclick="runQuery()">Run Query</button>
          <button class="button" onclick="clearResult()">Clear</button>
        </div>
        
        <div>
          <textarea id="result" class="result-area" placeholder="Query results will appear here..." readonly></textarea>
        </div>
      </div>

      <script>
        function setQuery(query) {
          document.getElementById('query').value = query.trim();
        }
        
        function clearResult() {
          document.getElementById('result').value = '';
        }
        
        async function runQuery() {
          const query = document.getElementById('query').value;
          const resultArea = document.getElementById('result');
          
          if (!query.trim()) {
            resultArea.value = 'Please enter a query';
            return;
          }
          
          resultArea.value = 'Running query...';
          
          try {
            const response = await fetch('/subgraphs/name/forge-inventory', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: query })
            });
            
            const result = await response.json();
            resultArea.value = JSON.stringify(result, null, 2);
          } catch (error) {
            resultArea.value = 'Error: ' + error.message;
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    data: {
      tokens: realData.tokens.length,
      users: realData.users.length,
      tokenCreations: realData.tokenCreations.length
    }
  });
});

// Start server
const PORT = process.env.PORT || 8000;

async function startServer() {
  console.log('🚀 Starting development subgraph server...');
  
  // Start server first
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('✅ Development subgraph server running!');
    console.log('');
    console.log('📊 GraphiQL: http://localhost:8000/subgraphs/name/forge-inventory/graphql');
    console.log('🔍 Health: http://localhost:8000/health');
    console.log('');
    console.log('📋 Available data:');
    console.log(`   - ${realData.tokens.length} tokens`);
    console.log(`   - ${realData.users.length} users`);
    console.log(`   - ${realData.tokenCreations.length} token creations`);
    console.log('');
    console.log('🔄 Data refreshes every 5 minutes');
  });

  server.on('error', (err) => {
    console.error('❌ Server error:', err);
  });
  
  // Fetch real data after server starts
  try {
    await fetchRealData();
  } catch (error) {
    console.error('❌ Initial data fetch failed:', error.message);
  }
  
  // Refresh data every 5 minutes
  setInterval(async () => {
    try {
      await fetchRealData();
    } catch (error) {
      console.error('❌ Data refresh failed:', error.message);
    }
  }, 5 * 60 * 1000);
}

startServer().catch(console.error);
