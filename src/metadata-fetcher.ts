import { json, log, ipfs } from "@graphprotocol/graph-ts"
import { TokenMetadata, TokenProperties } from "../generated/schema"

// Metadata fetching interface - can be extended when HTTP module becomes available
export class MetadataFetcher {
  
  /**
   * Fetch metadata from various URI types
   * Currently supports IPFS, with HTTP support planned
   */
  static fetchMetadata(tokenId: string, tokenURI: string): TokenMetadata | null {
    if (tokenURI.startsWith("ipfs://")) {
      return this.fetchFromIPFS(tokenId, tokenURI)
    } else if (tokenURI.startsWith("http")) {
      return this.fetchFromHTTP(tokenId, tokenURI)
    } else {
      log.info("Unsupported tokenURI format for token ID: {}", [tokenId])
      return this.createDefaultMetadata(tokenId)
    }
  }
  
  /**
   * Fetch metadata from IPFS
   */
  private static fetchFromIPFS(tokenId: string, tokenURI: string): TokenMetadata | null {
    log.info("Fetching metadata from IPFS: {}", [tokenURI])
    
    let ipfsHash = tokenURI.replace("ipfs://", "")
    let metadataBytes = ipfs.cat(ipfsHash)
    
    if (metadataBytes) {
      let metadataJson = json.try_fromBytes(metadataBytes)
      if (metadataJson.isOk) {
        let metadataObj = metadataJson.value.toObject()
        return this.parseMetadataObject(tokenId, metadataObj)
      } else {
        log.warning("Failed to parse IPFS metadata JSON for token ID: {}", [tokenId])
      }
    } else {
      log.warning("Failed to fetch IPFS metadata for token ID: {}", [tokenId])
    }
    
    return this.createDefaultMetadata(tokenId)
  }
  
  /**
   * Fetch metadata from HTTP endpoint
   * TODO: Implement when HTTP module becomes available in graph-ts
   */
  private static fetchFromHTTP(tokenId: string, tokenURI: string): TokenMetadata | null {
    log.info("HTTP URI detected for token: {}, but HTTP fetching not yet implemented", [tokenId])
    
    // TODO: When HTTP module is available, implement like this:
    // let response = http.get(tokenURI)
    // if (response.status == 200) {
    //   let metadataJson = json.try_fromBytes(response.body)
    //   if (metadataJson.isOk) {
    //     let metadataObj = metadataJson.value.toObject()
    //     return this.parseMetadataObject(tokenId, metadataObj)
    //   }
    // }
    
    // For now, create placeholder metadata based on tokenId patterns
    return this.createPlaceholderMetadata(tokenId)
  }
  
  /**
   * Parse metadata object and create TokenMetadata entity
   */
  private static parseMetadataObject(tokenId: string, metadataObj): TokenMetadata {
    let metadata = new TokenMetadata(tokenId)
    metadata.token = tokenId
    
    // Extract metadata fields
    let name = metadataObj.get("name")
    let description = metadataObj.get("description")
    let image = metadataObj.get("image")
    let rewardId = metadataObj.get("rewardId")
    let forgeId = metadataObj.get("forge_id")
    
    // Set metadata values
    metadata.name = name ? name.toString() : "Token " + tokenId
    metadata.description = description ? description.toString() : "Description for token " + tokenId
    metadata.image = image ? image.toString() : ""
    metadata.rewardId = rewardId ? rewardId.toString() : ""
    
    // Create properties entity
    let properties = new TokenProperties(tokenId)
    properties.metadata = tokenId
    properties.badgeType = ""
    properties.createdBy = ""
    properties.rewardId = metadata.rewardId
    properties.forgeId = forgeId ? forgeId.toString() : ""
    
    properties.save()
    metadata.properties = properties.id
    metadata.save()
    
    log.info("Successfully parsed metadata for token: {}", [tokenId])
    return metadata
  }
  
  /**
   * Create default metadata when fetching fails
   */
  private static createDefaultMetadata(tokenId: string): TokenMetadata {
    let metadata = new TokenMetadata(tokenId)
    metadata.token = tokenId
    metadata.name = "Token " + tokenId
    metadata.description = "Description for token " + tokenId
    metadata.image = ""
    metadata.rewardId = ""
    
    let properties = new TokenProperties(tokenId)
    properties.metadata = tokenId
    properties.badgeType = ""
    properties.createdBy = ""
    properties.rewardId = ""
    properties.forgeId = ""
    
    properties.save()
    metadata.properties = properties.id
    metadata.save()
    
    return metadata
  }
  
  /**
   * Create placeholder metadata for HTTP URIs (when HTTP fetching isn't available)
   */
  private static createPlaceholderMetadata(tokenId: string): TokenMetadata {
    let metadata = new TokenMetadata(tokenId)
    metadata.token = tokenId
    
    // Create placeholder metadata based on tokenId patterns
    if (tokenId == "1") {
      metadata.name = "The Forge Badge"
      metadata.description = "A badge earned in The Forge"
      metadata.rewardId = "forge-badge-1"
    } else if (tokenId == "2") {
      metadata.name = "Slicer Achievement"
      metadata.description = "Achievement for completing slicing tasks"
      metadata.rewardId = "slicer-achievement-1"
    } else {
      metadata.name = "Token " + tokenId
      metadata.description = "Description for token " + tokenId
      metadata.rewardId = ""
    }
    
    metadata.image = ""
    
    let properties = new TokenProperties(tokenId)
    properties.metadata = tokenId
    properties.badgeType = ""
    properties.createdBy = ""
    properties.rewardId = metadata.rewardId
    properties.forgeId = ""
    
    properties.save()
    metadata.properties = properties.id
    metadata.save()
    
    return metadata
  }
}
