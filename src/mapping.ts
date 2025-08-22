import { BigInt, Bytes, store, ethereum, json, log, ipfs, http } from "@graphprotocol/graph-ts";
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
  UserInventoryItem,
  TokenAttribute
} from "../generated/schema";

const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";
const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000";

function fetchAndParseMetadata(tokenId: string, tokenURI: string | null): TokenMetadata | null {
  let metadata = new TokenMetadata(tokenId);
  metadata.token = tokenId;

  metadata.name = "Token " + tokenId;
  metadata.description = "Description for token " + tokenId;
  metadata.image = "";
  metadata.rewardId = "";

  if (!tokenURI) {
    log.warning("Empty tokenURI for token ID: {}", [tokenId]);
    metadata.save();
    return metadata;
  }

  if (tokenURI.startsWith("http")) {
    log.info("HTTP URI detected for token: {}", [tokenId]);
    let response = http.get(tokenURI);
    if (response && response.status == 200) {
      let metadataJson = json.try_fromBytes(response.body);
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

        let attributes = metadataObj.get("attributes");
        if (attributes && attributes.kind == json.JSONValueKind.ARRAY) {
          let attrArray = attributes.toArray();
          for (let i = 0; i < attrArray.length; i++) {
            let attrObj = attrArray[i].toObject();
            let traitType = attrObj.get("trait_type");
            let value = attrObj.get("value");
            if (traitType && value) {
              let attrId = tokenId + "-attr-" + i.toString();
              let attribute = new TokenAttribute(attrId);
              attribute.metadata = tokenId;
              attribute.traitType = traitType.toString();
              attribute.value = value.toString();
              attribute.save();
            }
          }
        }

        log.info("Successfully fetched HTTP metadata for token: {}", [tokenId]);
      } else {
        log.warning("Failed to parse HTTP metadata JSON for token ID: {}", [tokenId]);
      }
    } else {
      log.warning("HTTP request failed for token ID {}, status: {}", [
        tokenId,
        response ? response.status.toString() : "no response"
      ]);
    }
  } else if (tokenURI.startsWith("ipfs://")) {
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

        let attributes = metadataObj.get("attributes");
        if (attributes && attributes.kind == json.JSONValueKind.ARRAY) {
          let attrArray = attributes.toArray();
          for (let i = 0; i < attrArray.length; i++) {
            let attrObj = attrArray[i].toObject();
            let traitType = attrObj.get("trait_type");
            let value = attrObj.get("value");
            if (traitType && value) {
              let attrId = tokenId + "-attr-" + i.toString();
              let attribute = new TokenAttribute(attrId);
              attribute.metadata = tokenId;
              attribute.traitType = traitType.toString();
              attribute.value = value.toString();
              attribute.save();
            }
          }
        }

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

  let properties = new TokenProperties(tokenId);
  properties.metadata = tokenId;
  properties.badgeType = "";
  properties.createdBy = "";
  properties.rewardId = metadata.rewardId;
  properties.forgeId = "";

  if (tokenURI && tokenURI.startsWith("http")) {
    let response = http.get(tokenURI);
    if (response && response.status == 200) {
      let metadataJson = json.try_fromBytes(response.body);
      if (metadataJson.isOk) {
        let metadataObj = metadataJson.value.toObject();
        let forgeId = metadataObj.get("forge_id");
        if (forgeId) {
          properties.forgeId = forgeId.toString();
          metadata.rewardId = forgeId.toString();
        }
      }
    }
  } else if (tokenURI && tokenURI.startsWith("ipfs://")) {
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

  return metadata;
}

export function handleTokenCreated(event: TokenCreated): void {
  let tokenId = event.params.tokenId;
  let tokenIdString = tokenId.toString();

  let token = Token.load(tokenIdString);
  if (!token) {
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

    let contract = ForgeInventory.bind(event.address);
    let tokenURIResult = contract.try_uri(tokenId); // Use try_uri instead of try_tokenURI
    token.tokenURI = tokenURIResult.reverted ? null : tokenURIResult.value;

    let metadata = fetchAndParseMetadata(tokenIdString, token.tokenURI);
    if (metadata) {
      metadata.token = tokenIdString;
      metadata.save();
      token.metadata = metadata.id;
      token.name = metadata.name;
      token.description = metadata.description;
      token.image = metadata.image;
      token.rewardId = metadata.rewardId;
      if (metadata.properties) {
        let properties = TokenProperties.load(metadata.properties);
        if (properties) {
          token.forgeId = properties.forgeId;
        }
      }
    } else {
      token.name = "Token " + tokenIdString;
      token.description = "Description for token " + tokenIdString;
      token.image = "";
      token.rewardId = "";
      token.forgeId = "";
    }

    token.save();
  }

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

  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let allEvent = new AllEvent(eventId);
  allEvent.eventType = "TokenCreated";
  allEvent.blockNumber = event.block.number;
  allEvent.blockHash = event.block.hash;
  allEvent.transactionHash = event.transaction.hash;
  allEvent.transactionIndex = event.transaction.index;
  allEvent.logIndex = event.logIndex;
  allEvent.timestamp = event.block.timestamp;
  allEvent.gasPrice = event.transaction.gasPrice;
  allEvent.from = event.transaction.from;
  allEvent.to = event.transaction.to ? event.transaction.to : null;
  allEvent.value = event.transaction.value;
  allEvent.description = "Token created with ID: " + tokenIdString;
  allEvent.tokenId = tokenId;
  allEvent.tokenType = event.params.tokenType;
  allEvent.category = event.params.category;
  allEvent.subCategory = event.params.subCategory;
  allEvent.creator = event.transaction.from;
  allEvent.save();

  let user = getOrCreateUser(event.transaction.from);
  user.totalTokensCreated = user.totalTokensCreated.plus(BigInt.fromI32(1));
  user.lastInteraction = event.block.timestamp;
  user.save();

  updateGlobalStats(event.block.timestamp, true, false, false);
  updateDailyStats(event.block.timestamp, true, false);
}

export function handleTransferSingle(event: TransferSingle): void {
  let tokenId = event.params.id;
  let tokenIdString = tokenId.toString();
  let amount = event.params.value;
  let to = event.params.to;
  let from = event.params.from;

  if (from.toHex() == "0x0000000000000000000000000000000000000000") {
    handleTokenMint(to, tokenId, amount, event.params.operator, event);
    return;
  }

  updateUserBalance(from, tokenId, amount.neg(), event.block.timestamp);
  updateUserBalance(to, tokenId, amount, event.block.timestamp);

  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let allEvent = new AllEvent(eventId);
  allEvent.eventType = "TransferSingle";
  allEvent.blockNumber = event.block.number;
  allEvent.blockHash = event.block.hash;
  allEvent.transactionHash = event.transaction.hash;
  allEvent.transactionIndex = event.transaction.index;
  allEvent.logIndex = event.logIndex;
  allEvent.timestamp = event.block.timestamp;
  allEvent.gasPrice = event.transaction.gasPrice;
  allEvent.from = event.transaction.from;
  allEvent.to = event.transaction.to ? event.transaction.to : null;
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

  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let allEvent = new AllEvent(eventId);
  allEvent.eventType = "TransferBatch";
  allEvent.blockNumber = event.block.number;
  allEvent.blockHash = event.block.hash;
  allEvent.transactionHash = event.transaction.hash;
  allEvent.transactionIndex = event.transaction.index;
  allEvent.logIndex = event.logIndex;
  allEvent.timestamp = event.block.timestamp;
  allEvent.gasPrice = event.transaction.gasPrice;
  allEvent.from = event.transaction.from;
  allEvent.to = event.transaction.to ? event.transaction.to : null;
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

  let mintId = event.transaction.hash.toHex() + "-" + event.logIndex.toString() + "-" + tokenIdString;
  let mint = new TokenMint(mintId);
  mint.token = tokenIdString;
  mint.to = getOrCreateUser(to).id;
  mint.amount = amount;
  mint.timestamp = event.block.timestamp;
  mint.blockNumber = event.block.number;
  mint.transactionHash = event.transaction.hash;
  mint.operator = operator;

  let tokenEntity = Token.load(tokenIdString);
  if (tokenEntity) {
    mint.tokenName = tokenEntity.name;
    mint.tokenDescription = tokenEntity.description;
    mint.tokenImage = tokenEntity.image;
    mint.tokenCategory = tokenEntity.category;
    mint.tokenSubCategory = tokenEntity.subCategory;
    mint.rewardId = tokenEntity.rewardId;
    mint.tokenForgeId = tokenEntity.forgeId;
  }

  mint.save();

  if (tokenEntity) {
    tokenEntity.currentSupply = tokenEntity.currentSupply.plus(amount);
    tokenEntity.save();
  }

  updateUserBalance(to, tokenId, amount, event.block.timestamp);

  let inventoryId = to.toHex() + "-" + tokenIdString;
  let inventoryItem = UserInventoryItem.load(inventoryId);
  if (!inventoryItem) {
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

  let user = getOrCreateUser(to);
  user.totalTokensMinted = user.totalTokensMinted.plus(amount);
  user.lastInteraction = event.block.timestamp;
  user.save();

  updateGlobalStats(event.block.timestamp, false, true, false);
  updateDailyStats(event.block.timestamp, false, true);

  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let allEvent = new AllEvent(eventId);
  allEvent.eventType = "TokenMint";
  allEvent.blockNumber = event.block.number;
  allEvent.blockHash = event.block.hash;
  allEvent.transactionHash = event.transaction.hash;
  allEvent.transactionIndex = event.transaction.index;
  allEvent.logIndex = event.logIndex;
  allEvent.timestamp = event.block.timestamp;
  allEvent.gasPrice = event.transaction.gasPrice;
  allEvent.from = event.transaction.from;
  allEvent.to = event.transaction.to ? event.transaction.to : null;
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

  let user = getOrCreateUser(event.params.account);
  user.lastInteraction = event.block.timestamp;
  user.save();

  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let allEvent = new AllEvent(eventId);
  allEvent.eventType = "RoleGranted";
  allEvent.blockNumber = event.block.number;
  allEvent.blockHash = event.block.hash;
  allEvent.transactionHash = event.transaction.hash;
  allEvent.transactionIndex = event.transaction.index;
  allEvent.logIndex = event.logIndex;
  allEvent.timestamp = event.block.timestamp;
  allEvent.gasPrice = event.transaction.gasPrice;
  allEvent.from = event.transaction.from;
  allEvent.to = event.transaction.to ? event.transaction.to : null;
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

  let user = getOrCreateUser(event.params.account);
  user.lastInteraction = event.block.timestamp;
  user.save();

  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let allEvent = new AllEvent(eventId);
  allEvent.eventType = "RoleRevoked";
  allEvent.blockNumber = event.block.number;
  allEvent.blockHash = event.block.hash;
  allEvent.transactionHash = event.transaction.hash;
  allEvent.transactionIndex = event.transaction.index;
  allEvent.logIndex = event.logIndex;
  allEvent.timestamp = event.block.timestamp;
  allEvent.gasPrice = event.transaction.gasPrice;
  allEvent.from = event.transaction.from;
  allEvent.to = event.transaction.to ? event.transaction.to : null;
  allEvent.value = event.transaction.value;
  allEvent.description = "Role revoked: " + getRoleName(event.params.role);
  allEvent.role = event.params.role;
  allEvent.roleHash = event.params.role;
  allEvent.account = event.params.account;
  allEvent.sender = event.params.sender;
  allEvent.save();
}

function getOrCreateUser(address: Bytes): User {
  let userId = address.toHex();
  let user = User.load(userId);

  if (!user) {
    user = new User(userId);
    user.address = address;
    user.totalTokensCreated = BigInt.fromI32(0);
    user.totalTokensMinted = BigInt.fromI32(0);
    user.firstInteraction = BigInt.fromI32(0);
    user.lastInteraction = BigInt.fromI32(0);
    user.totalInventoryValue = BigInt.fromI32(0);
    updateGlobalStats(BigInt.fromI32(0), false, false, true);
  }

  if (user.firstInteraction.equals(BigInt.fromI32(0))) {
    user.firstInteraction = BigInt.fromI32(0);
  }

  user.save();
  return user;
}

function updateUserBalance(address: Bytes, tokenId: BigInt, amount: BigInt, timestamp: BigInt): void {
  let tokenIdString = tokenId.toString();
  let userId = address.toHex();
  let balanceId = userId + "-" + tokenIdString;

  let balance = UserTokenBalance.load(balanceId);
  if (!balance) {
    balance = new UserTokenBalance(balanceId);
    balance.user = userId;
    balance.token = tokenIdString;
    balance.balance = BigInt.fromI32(0);
  }

  balance.balance = balance.balance.plus(amount);
  balance.lastUpdated = timestamp;

  if (balance.balance.equals(BigInt.fromI32(0))) {
    store.remove("UserTokenBalance", balanceId);
  } else {
    balance.save();
  }

  let user = getOrCreateUser(address);
  user.totalInventoryValue = user.totalInventoryValue.plus(amount);
  user.lastInteraction = timestamp;
  user.save();
}

function getRoleName(role: Bytes): string {
  if (role.toHex() == MINTER_ROLE) {
    return "MINTER";
  } else if (role.toHex() == DEFAULT_ADMIN_ROLE) {
    return "DEFAULT_ADMIN";
  }
  return "UNKNOWN";
}

function updateGlobalStats(timestamp: BigInt, incrementTokens: boolean, incrementMints: boolean, incrementUsers: boolean): void {
  let globalStats = GlobalStats.load("1");
  if (!globalStats) {
    globalStats = new GlobalStats("1");
    globalStats.totalTokens = BigInt.fromI32(0);
    globalStats.totalMints = BigInt.fromI32(0);
    globalStats.totalUsers = BigInt.fromI32(0);
    globalStats.totalSupply = BigInt.fromI32(0);
    globalStats.totalEvents = BigInt.fromI32(0);
  }

  if (incrementTokens) {
    globalStats.totalTokens = globalStats.totalTokens.plus(BigInt.fromI32(1));
  }
  if (incrementMints) {
    globalStats.totalMints = globalStats.totalMints.plus(BigInt.fromI32(1));
  }
  if (incrementUsers) {
    globalStats.totalUsers = globalStats.totalUsers.plus(BigInt.fromI32(1));
  }
  globalStats.totalEvents = globalStats.totalEvents.plus(BigInt.fromI32(1));
  globalStats.lastUpdated = timestamp;
  globalStats.save();
}

function updateDailyStats(timestamp: BigInt, incrementTokens: boolean, incrementMints: boolean): void {
  let date = timestamp.div(BigInt.fromI32(86400)).toString();
  let dailyStats = DailyStats.load(date);
  if (!dailyStats) {
    dailyStats = new DailyStats(date);
    dailyStats.date = timestamp.div(BigInt.fromI32(86400));
    dailyStats.tokensCreated = BigInt.fromI32(0);
    dailyStats.tokensMinted = BigInt.fromI32(0);
    dailyStats.activeUsers = BigInt.fromI32(0);
    dailyStats.totalSupplyChange = BigInt.fromI32(0);
  }

  if (incrementTokens) {
    dailyStats.tokensCreated = dailyStats.tokensCreated.plus(BigInt.fromI32(1));
  }
  if (incrementMints) {
    dailyStats.tokensMinted = dailyStats.tokensMinted.plus(BigInt.fromI32(1));
  }
  dailyStats.activeUsers = dailyStats.activeUsers.plus(BigInt.fromI32(1));
  dailyStats.save();
}