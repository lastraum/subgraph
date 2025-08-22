import { BigInt, log, http, ipfs, json } from "@graphprotocol/graph-ts";
import { MetadataRequested } from "../generated/templates/MetadataFetcher/MetadataFetcher";
import { ForgeInventory } from "../generated/ForgeInventory/ForgeInventory";
import { Token, TokenMetadata, TokenProperties, TokenAttribute } from "../generated/schema";

const FORGE_INVENTORY_ADDRESS = "0xD21C2B389073cC05251D3afC0B41674BF05C62e9"; // ForgeInventory contract address

// Reused from mapping.ts to avoid duplication
function fetchAndParseMetadata(tokenId: string, tokenURI: string): TokenMetadata | null {
  let metadata = new TokenMetadata(tokenId);
  metadata.token = tokenId; // Will be updated to reference Token entity

  // Set default values
  metadata.name = "Token " + tokenId;
  metadata.description = "Description for token " + tokenId;
  metadata.image = "";
  metadata.rewardId = "";

  // Handle HTTP URIs
  if (tokenURI.startsWith("http")) {
    log.info("HTTP URI detected for token: {}", [tokenId]);
    let response = http.get(tokenURI);
    if (response.status == 200) {
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

        // Parse attributes if present
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
        response.status.toString()
      ]);
    }
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

        // Parse attributes if present
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

  // Create properties entity
  let properties = new TokenProperties(tokenId);
  properties.metadata = tokenId;
  properties.badgeType = "";
  properties.createdBy = "";
  properties.rewardId = metadata.rewardId;
  properties.forgeId = "";

  // Extract forge_id for properties
  if (tokenURI.startsWith("http")) {
    let response = http.get(tokenURI);
    if (response.status == 200) {
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
  } else if (tokenURI.startsWith("ipfs://")) {
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

export function handleMetadataRequested(event: MetadataRequested): void {
  let tokenId = event.params.tokenId;
  let tokenIdString = tokenId.toString();

  log.info("Metadata requested for token: {}", [tokenIdString]);

  // Load Token entity to ensure it exists
  let token = Token.load(tokenIdString);
  if (token == null) {
    log.warning("Token not found for MetadataRequested event, tokenId: {}", [tokenIdString]);
    return;
  }

  // Fetch tokenURI from ForgeInventory contract
  let contract = ForgeInventory.bind(FORGE_INVENTORY_ADDRESS);
  let tokenURIResult = contract.try_tokenURI(tokenId);
  let tokenURI = tokenURIResult.reverted ? "" : tokenURIResult.value;

  // Fetch and parse metadata
  let metadata = fetchAndParseMetadata(tokenIdString, tokenURI);
  if (metadata != null) {
    metadata.token = tokenIdString; // Link to Token entity
    metadata.save();

    // Update Token entity
    token.metadata = metadata.id;
    token.name = metadata.name;
    token.description = metadata.description;
    token.image = metadata.image;
    token.rewardId = metadata.rewardId;

    if (metadata.properties != null) {
      let properties = TokenProperties.load(metadata.properties!);
      if (properties != null) {
        token.forgeId = properties.forgeId;
      }
    }

    token.save();
  }

  log.info("Processed MetadataRequested for token: {}", [tokenIdString]);
}