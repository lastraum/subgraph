import { BigInt, Bytes, store, ethereum, json, log, ipfs } from "@graphprotocol/graph-ts";
import {
  ForgeInventory,
  TokenCreated,
  TransferSingle,
  TransferBatch,
  RoleGranted,
  RoleRevoked
} from "../generated/ForgeInventory/ForgeInventory";
import {
  Token,
  TokenCreation,
  TokenMint,
  User,
  UserTokenBalance,
  RoleChange,
  GlobalStats,
  DailyStats,
  TokenMetadata,
  TokenProperties,
  AllEvent,
  UserInventoryItem
} from "../generated/schema";

// Constants for role names
const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";
const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

// Helper function to fetch and parse metadata from tokenURI
// Note: HTTP fetching not available in current graph-ts version
function fetchAndParseMetadata(tokenId: string, tokenURI: string): TokenMetadata | null {
  let metadata = new TokenMetadata(tokenId);
  metadata.token = tokenId;

  // Set default values
  metadata.name = "Token " + tokenId;
  metadata.description = "Description for token " + tokenId;
  metadata.image = "";
  metadata.rewardId = "";

  // Handle HTTP URIs - currently not supported
  if (tokenURI.startsWith("http")) {
    log.info("HTTP URI detected for token: {}, but HTTP fetching not available", [tokenId]);
    // TODO: Implement HTTP fetching when http module becomes available
  }
  // Handle IPFS URIs
  else if (tokenURI.startsWith("ipfs://")) {
    log.info("IPFS URI detected for token: {}", [tokenId]);
    let ipfsHash = tokenURI.replace("ipfs://", "").split("/")[0];
    let metadataBytes = ipfs.cat(ipfsHash);

    if (metadataBytes) {
      let metadataJson = json.try_fromBytes(metadataBytes);
      if (metadataJson.isOk) {
        let metadataObj = metadataJson.value.toObject();
        let name = metadataObj.get("name");
        let description = metadataObj.get("description");
        let image = metadataObj.get("image");
        let rewardId = metadataObj.get("rewardId");
        let forgeId = metadataObj.get("forge_id");

        if (name) metadata.name = name.toString();
        if (description) metadata.description = description.toString();
        if (image) metadata.image = image.toString();
        if (rewardId) metadata.rewardId = rewardId.toString();

        log.info("Successfully fetched IPFS metadata for token: {}", [tokenId]);
      } else {
        log.warning("Failed to parse IPFS metadata JSON for token ID: {}", [tokenId]);
      }
    } else {
      log.warning("Failed to fetch IPFS metadata for token ID: {}", [tokenId]);
    }
  } else {
    log.info("Non-HTTP/IPFS tokenURI for token ID: {}", [tokenId]);
  }

  // Create properties entity
  let properties = new TokenProperties(tokenId);
  properties.metadata = tokenId;
  properties.badgeType = "";
  properties.createdBy = "";
  properties.rewardId = metadata.rewardId;
  properties.forgeId = "";

  // Extract forge_id for properties
  if (tokenURI.startsWith("ipfs://")) {
    let ipfsHash = tokenURI.replace("ipfs://", "").split("/")[0];
    let metadataBytes = ipfs.cat(ipfsHash);
    if (metadataBytes) {
      let metadataJson = json.try_fromBytes(metadataBytes);
      if (metadataJson.isOk) {
        let metadataObj = metadataJson.value.toObject();
        let forgeId = metadataObj.get("forge_id");
        if (forgeId) {
          properties.forgeId = forgeId.toString();
          metadata.rewardId = forgeId.toString();
        }
      }
    }
  }

  properties.save();
  metadata.properties = properties.id;
  metadata.save();

  log.info("Created metadata for token: {}", [tokenId]);
  return metadata;
}

export function handleTokenCreated(event: TokenCreated): void {
  let tokenId = event.params.tokenId;
  let tokenIdString = tokenId.toString();

  // Create or load Token entity
  let token = Token.load(tokenIdString);
  if (token == null) {
    token = new Token(tokenIdString);
    token.tokenId = tokenId;
    token.tokenType = event.params.tokenType;
    token.category = event.params.category;
    token.subCategory = event.params.subCategory;
    token.soulbound = false;
    token.maxSupply = BigInt.fromI32(0);
    token.currentSupply = BigInt.fromI32(0);
    token.creator = event.transaction.from;
    token.createdAt = event.block.timestamp;
    token.createdAtBlock = event.block.number;
    token.createdTxHash = event.transaction.hash;

    // For now, use a default tokenURI since try_tokenURI doesn't exist
    token.tokenURI = "";
    
    // TODO: Implement proper tokenURI fetching when contract method is available
    // let contract = ForgeInventory.bind(event.address);
    // let tokenURIResult = contract.try_tokenURI(tokenId);
    // if (tokenURIResult.reverted) {
    //   log.warning("tokenURI reverted for token ID: {}", [tokenIdString]);
    //   token.tokenURI = "";
    // } else {
    //   token.tokenURI = tokenURIResult.value;
    // }

    // Fetch metadata
    let metadata = fetchAndParseMetadata(tokenIdString, token.tokenURI);

    if (metadata != null) {
      token.metadata = metadata.id;
      token.name = metadata.name;
      token.description = metadata.description;
      token.image = metadata.image;
      token.rewardId = metadata.rewardId;

      // Get forge_id from properties
      if (metadata.properties != null) {
        let properties = TokenProperties.load(metadata.properties!);
        if (properties != null) {
          token.forgeId = properties.forgeId;
        }
      }
    } else {
      // Fallback metadata
      token.name = "Token " + tokenIdString;
      token.description = "Description for token " + tokenIdString;
      token.image = "";
      token.rewardId = "";
      token.forgeId = "";
    }

    token.save();
  }

  // Create TokenCreation entity
  let creationId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let creation = new TokenCreation(creationId);
  creation.token = tokenIdString;
  creation.tokenId = tokenId;
  creation.tokenType = event.params.tokenType;
  creation.category = event.params.category;
  creation.subCategory = event.params.subCategory;
  creation.creator = getOrCreateUser(event.transaction.from).id;
  creation.timestamp = event.block.timestamp;
  creation.blockNumber = event.block.number;
  creation.transactionHash = event.transaction.hash;
  creation.save();

  // Create AllEvent entity
  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let allEvent = new AllEvent(eventId);
  allEvent.eventType = "TokenCreated";
  allEvent.blockNumber = event.block.number;
  allEvent.blockHash = event.block.hash;
  allEvent.transactionHash = event.transaction.hash;
  allEvent.transactionIndex = event.transaction.index;
  allEvent.logIndex = event.logIndex;
  allEvent.timestamp = event.block.timestamp;
  // Note: gasUsed and other properties may not be available in all transaction types
  allEvent.gasUsed = BigInt.fromI32(0); // Default value
  allEvent.gasPrice = event.transaction.gasPrice;
  allEvent.from = event.transaction.from;
  allEvent.to = event.transaction.to ? event.transaction.to : Bytes.empty();
  allEvent.value = event.transaction.value;
  allEvent.description = "Token created with ID: " + tokenIdString;
  allEvent.tokenId = tokenId;
  allEvent.tokenType = event.params.tokenType;
  allEvent.category = event.params.category;
  allEvent.subCategory = event.params.subCategory;
  allEvent.creator = event.transaction.from;
  allEvent.save();

  // Update user stats
  let user = getOrCreateUser(event.transaction.from);
  user.totalTokensCreated = user.totalTokensCreated.plus(BigInt.fromI32(1));
  user.lastInteraction = event.block.timestamp;
  user.save();

  // Update global stats
  updateGlobalStats(event.block.timestamp, true, false, false);

  // Update daily stats
  updateDailyStats(event.block.timestamp, true, false);
}

export function handleTransferSingle(event: TransferSingle): void {
  let tokenId = event.params.id;
  let tokenIdString = tokenId.toString();
  let amount = event.params.value;
  let to = event.params.to;
  let from = event.params.from;

  // Skip minting events (from zero address) - handle them separately
  if (from.toHex() == "0x0000000000000000000000000000000000000000") {
    handleTokenMint(to, tokenId, amount, event.params.operator, event);
    return;
  }

  // Handle regular transfers
  updateUserBalance(from, tokenId, amount.neg(), event.block.timestamp);
  updateUserBalance(to, tokenId, amount, event.block.timestamp);

  // Create AllEvent entity
  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let allEvent = new AllEvent(eventId);
  allEvent.eventType = "TransferSingle";
  allEvent.blockNumber = event.block.number;
  allEvent.blockHash = event.block.hash;
  allEvent.transactionHash = event.transaction.hash;
  allEvent.transactionIndex = event.transaction.index;
  allEvent.logIndex = event.logIndex;
  allEvent.timestamp = event.block.timestamp;
  allEvent.gasUsed = BigInt.fromI32(0); // Default value
  allEvent.gasPrice = event.transaction.gasPrice;
  allEvent.from = event.transaction.from;
  allEvent.to = event.transaction.to ? event.transaction.to : Bytes.empty();
  allEvent.value = event.transaction.value;
  allEvent.description = "Single transfer of token ID: " + tokenIdString;
  allEvent.fromAddress = from;
  allEvent.toAddress = to;
  allEvent.amount = amount;
  allEvent.operator = event.params.operator;
  allEvent.tokenId = tokenId;
  allEvent.save();
}

export function handleTransferBatch(event: TransferBatch): void {
  let ids = event.params.ids;
  let values = event.params.values;
  let to = event.params.to;
  let from = event.params.from;

  for (let i = 0; i < ids.length; i++) {
    let tokenId = ids[i];
    let amount = values[i];

    if (from.toHex() == "0x0000000000000000000000000000000000000000") {
      handleTokenMint(to, tokenId, amount, event.params.operator, event);
    } else {
      updateUserBalance(from, tokenId, amount.neg(), event.block.timestamp);
      updateUserBalance(to, tokenId, amount, event.block.timestamp);
    }
  }

  // Create AllEvent entity
  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let allEvent = new AllEvent(eventId);
  allEvent.eventType = "TransferBatch";
  allEvent.blockNumber = event.block.number;
  allEvent.blockHash = event.block.hash;
  allEvent.transactionHash = event.transaction.hash;
  allEvent.transactionIndex = event.transaction.index;
  allEvent.logIndex = event.logIndex;
  allEvent.timestamp = event.block.timestamp;
  allEvent.gasUsed = BigInt.fromI32(0); // Default value
  allEvent.gasPrice = event.transaction.gasPrice;
  allEvent.from = event.transaction.from;
  allEvent.to = event.transaction.to ? event.transaction.to : Bytes.empty();
  allEvent.value = event.transaction.value;
  allEvent.description = "Batch transfer of tokens";
  allEvent.fromAddress = from;
  allEvent.toAddress = to;
  allEvent.amounts = values;
  allEvent.tokenIds = ids;
  allEvent.operator = event.params.operator;
  allEvent.save();
}

function handleTokenMint(to: Bytes, tokenId: BigInt, amount: BigInt, operator: Bytes, event: ethereum.Event): void {
  let tokenIdString = tokenId.toString();

  // Create TokenMint entity
  let mintId = event.transaction.hash.toHex() + "-" + event.logIndex.toString() + "-" + tokenIdString;
  let mint = new TokenMint(mintId);
  mint.token = tokenIdString;
  mint.to = getOrCreateUser(to).id;
  mint.amount = amount;
  mint.timestamp = event.block.timestamp;
  mint.blockNumber = event.block.number;
  mint.transactionHash = event.transaction.hash;
  mint.operator = operator;

  // Populate direct metadata fields
  let tokenEntity = Token.load(tokenIdString);
  if (tokenEntity != null) {
    mint.tokenName = tokenEntity.name;
    mint.tokenDescription = tokenEntity.description;
    mint.tokenImage = tokenEntity.image;
    mint.tokenCategory = tokenEntity.category;
    mint.tokenSubCategory = tokenEntity.subCategory;
    mint.rewardId = tokenEntity.rewardId;
    mint.tokenForgeId = tokenEntity.forgeId;
  }

  mint.save();

  // Update token supply
  if (tokenEntity != null) {
    tokenEntity.currentSupply = tokenEntity.currentSupply.plus(amount);
    tokenEntity.save();
  }

  // Update user balance
  updateUserBalance(to, tokenId, amount, event.block.timestamp);

  // Update UserInventoryItem
  let inventoryId = to.toHex() + "-" + tokenIdString;
  let inventoryItem = UserInventoryItem.load(inventoryId);
  if (inventoryItem == null) {
    inventoryItem = new UserInventoryItem(inventoryId);
    inventoryItem.user = getOrCreateUser(to).id;
    inventoryItem.token = tokenIdString;
    inventoryItem.balance = BigInt.fromI32(0);
    inventoryItem.firstAcquired = event.block.timestamp;
    inventoryItem.tokenType = tokenEntity ? tokenEntity.tokenType : 0;
    inventoryItem.category = tokenEntity ? tokenEntity.category : "";
    inventoryItem.subCategory = tokenEntity ? tokenEntity.subCategory : "";
    inventoryItem.rewardId = tokenEntity ? tokenEntity.rewardId : "";
  }
  inventoryItem.balance = inventoryItem.balance.plus(amount);
  inventoryItem.lastUpdated = event.block.timestamp;
  inventoryItem.lastAcquired = event.block.timestamp;
  inventoryItem.save();

  // Update user stats
  let user = getOrCreateUser(to);
  user.totalTokensMinted = user.totalTokensMinted.plus(amount);
  user.lastInteraction = event.block.timestamp;
  user.save();

  // Update global stats
  updateGlobalStats(event.block.timestamp, false, true, false);

  // Update daily stats
  updateDailyStats(event.block.timestamp, false, true);

  // Create AllEvent entity
  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let allEvent = new AllEvent(eventId);
  allEvent.eventType = "TokenMint";
  allEvent.blockNumber = event.block.number;
  allEvent.blockHash = event.block.hash;
  allEvent.transactionHash = event.transaction.hash;
  allEvent.transactionIndex = event.transaction.index;
  allEvent.logIndex = event.logIndex;
  allEvent.timestamp = event.block.timestamp;
  allEvent.gasUsed = BigInt.fromI32(0); // Default value
  allEvent.gasPrice = event.transaction.gasPrice;
  allEvent.from = event.transaction.from;
  allEvent.to = event.transaction.to ? event.transaction.to : Bytes.empty();
  allEvent.value = event.transaction.value;
  allEvent.description = "Mint of token ID: " + tokenIdString;
  allEvent.toAddress = to;
  allEvent.amount = amount;
  allEvent.operator = operator;
  allEvent.tokenId = tokenId;
  allEvent.save();
}

export function handleRoleGranted(event: RoleGranted): void {
  let roleChangeId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let roleChange = new RoleChange(roleChangeId);
  roleChange.role = event.params.role;
  roleChange.roleName = getRoleName(event.params.role);
  roleChange.account = getOrCreateUser(event.params.account).id;
  roleChange.sender = event.params.sender;
  roleChange.granted = true;
  roleChange.timestamp = event.block.timestamp;
  roleChange.blockNumber = event.block.number;
  roleChange.transactionHash = event.transaction.hash;
  roleChange.save();

  // Update user
  let user = getOrCreateUser(event.params.account);
  user.lastInteraction = event.block.timestamp;
  user.save();

  // Create AllEvent entity
  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let allEvent = new AllEvent(eventId);
  allEvent.eventType = "RoleGranted";
  allEvent.blockNumber = event.block.number;
  allEvent.blockHash = event.block.hash;
  allEvent.transactionHash = event.transaction.hash;
  allEvent.transactionIndex = event.transaction.index;
  allEvent.logIndex = event.logIndex;
  allEvent.timestamp = event.block.timestamp;
  allEvent.gasUsed = event.transaction.gasUsed;
  allEvent.gasPrice = event.transaction.gasPrice;
  allEvent.from = event.transaction.from;
  allEvent.to = event.transaction.to;
  allEvent.value = event.transaction.value;
  allEvent.description = "Role granted: " + getRoleName(event.params.role);
  allEvent.role = event.params.role;
  allEvent.roleHash = event.params.role;
  allEvent.account = event.params.account;
  allEvent.sender = event.params.sender;
  allEvent.save();
}

export function handleRoleRevoked(event: RoleRevoked): void {
  let roleChangeId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let roleChange = new RoleChange(roleChangeId);
  roleChange.role = event.params.role;
  roleChange.roleName = getRoleName(event.params.role);
  roleChange.account = getOrCreateUser(event.params.account).id;
  roleChange.sender = event.params.sender;
  roleChange.granted = false;
  roleChange.timestamp = event.block.timestamp;
  roleChange.blockNumber = event.block.number;
  roleChange.transactionHash = event.transaction.hash;
  roleChange.save();

  // Update user
  let user = getOrCreateUser(event.params.account);
  user.lastInteraction = event.block.timestamp;
  user.save();

  // Create AllEvent entity
  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let allEvent = new AllEvent(eventId);
  allEvent.eventType = "RoleRevoked";
  allEvent.blockNumber = event.block.number;
  allEvent.blockHash = event.block.hash;
  allEvent.transactionHash = event.transaction.hash;
  allEvent.transactionIndex = event.transaction.index;
  allEvent.logIndex = event.logIndex;
  allEvent.timestamp = event.block.timestamp;
  allEvent.gasUsed = event.transaction.gasUsed;
  allEvent.gasPrice = event.transaction.gasPrice;
  allEvent.from = event.transaction.from;
  allEvent.to = event.transaction.to;
  allEvent.value = event.transaction.value;
  allEvent.description = "Role revoked: " + getRoleName(event.params.role);
  allEvent.role = event.params.role;
  allEvent.roleHash = event.params.role;
  allEvent.account = event.params.account;
  allEvent.sender = event.params.sender;
  allEvent.save();
}

// Helper functions
function getOrCreateUser(address: Bytes): User {
  let userId = address.toHex();
  let user = User.load(userId);

  if (user == null) {
    user = new User(userId);
    user.address = address;
    user.totalTokensCreated = BigInt.fromI32(0);
    user.totalTokensMinted = BigInt.fromI32(0);
    user.firstInteraction = BigInt.fromI32(0);
    user.lastInteraction = BigInt.fromI32(0);
    user.totalInventoryValue = BigInt.fromI32(0);

    // Update global user count
    updateGlobalStats(BigInt.fromI32(0), false, false, true);
  }

  if (user.firstInteraction.equals(BigInt.fromI32(0))) {
    user.firstInteraction = BigInt.fromI32(0); // Will be set by caller
  }

  user.save();
  return user as User;
}

function updateUserBalance(userAddress: Bytes, tokenId: BigInt, amountChange: BigInt, timestamp: BigInt): void {
  let balanceId = userAddress.toHex() + "-" + tokenId.toString();
  let balance = UserTokenBalance.load(balanceId);

  if (balance == null) {
    balance = new UserTokenBalance(balanceId);
    balance.user = getOrCreateUser(userAddress).id;
    balance.token = tokenId.toString();
    balance.balance = BigInt.fromI32(0);
  }

  balance.balance = balance.balance.plus(amountChange);
  balance.lastUpdated = timestamp;

  // Remove balance if it's zero
  if (balance.balance.equals(BigInt.fromI32(0))) {
    store.remove("UserTokenBalance", balanceId);
  } else {
    balance.save();
  }
}

function getRoleName(role: Bytes): string {
  let roleHex = role.toHex();
  if (roleHex == MINTER_ROLE) {
    return "MINTER_ROLE";
  } else if (roleHex == DEFAULT_ADMIN_ROLE) {
    return "DEFAULT_ADMIN_ROLE";
  }
  return "UNKNOWN_ROLE";
}

function updateGlobalStats(timestamp: BigInt, tokenCreated: boolean, tokenMinted: boolean, newUser: boolean): void {
  let stats = GlobalStats.load("global");
  if (stats == null) {
    stats = new GlobalStats("global");
    stats.totalTokens = BigInt.fromI32(0);
    stats.totalMints = BigInt.fromI32(0);
    stats.totalUsers = BigInt.fromI32(0);
    stats.totalSupply = BigInt.fromI32(0);
    stats.totalEvents = BigInt.fromI32(0);
  }

  if (tokenCreated) {
    stats.totalTokens = stats.totalTokens.plus(BigInt.fromI32(1));
  }

  if (tokenMinted) {
    stats.totalMints = stats.totalMints.plus(BigInt.fromI32(1));
  }

  if (newUser) {
    stats.totalUsers = stats.totalUsers.plus(BigInt.fromI32(1));
  }

  stats.totalEvents = stats.totalEvents.plus(BigInt.fromI32(1));
  stats.lastUpdated = timestamp;
  stats.save();
}

function updateDailyStats(timestamp: BigInt, tokenCreated: boolean, tokenMinted: boolean): void {
  let dayTimestamp = timestamp.div(BigInt.fromI32(86400)).times(BigInt.fromI32(86400));
  let dayId = dayTimestamp.toString();

  let dailyStats = DailyStats.load(dayId);
  if (dailyStats == null) {
    dailyStats = new DailyStats(dayId);
    dailyStats.date = dayTimestamp;
    dailyStats.tokensCreated = BigInt.fromI32(0);
    dailyStats.tokensMinted = BigInt.fromI32(0);
    dailyStats.activeUsers = BigInt.fromI32(0);
    dailyStats.totalSupplyChange = BigInt.fromI32(0);
  }

  if (tokenCreated) {
    dailyStats.tokensCreated = dailyStats.tokensCreated.plus(BigInt.fromI32(1));
  }

  if (tokenMinted) {
    dailyStats.tokensMinted = dailyStats.tokensMinted.plus(BigInt.fromI32(1));
  }

  dailyStats.activeUsers = dailyStats.activeUsers.plus(BigInt.fromI32(1));
  dailyStats.save();
}