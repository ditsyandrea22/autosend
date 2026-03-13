const { ethers } = require("ethers");

/**
 * NFT ABI for safe transfer operations
 */
const NFT_ABI = [
  "function safeTransferFrom(address,address,uint256)",
  "function safeTransferFrom(address,address,uint256,bytes)",
  "function transferFrom(address,address,uint256)",
  "function ownerOf(uint256) view returns(address)",
  "function isApprovedForAll(address,address) view returns(bool)",
  "function setApprovalForAll(address,bool)",
];

/**
 * ERC721/1155 ABI for balance checks
 */
const ERC721_ABI = [
  "function balanceOf(address) view returns(uint256)",
];

/**
 * NFT Rescue - Handles NFT rescue operations
 */
class NFTRescue {
  constructor(provider, wallet) {
    this.provider = provider;
    this.wallet = wallet;
    this.nftCache = new Map();
  }

  /**
   * Get NFT contract instance
   */
  getContract(contractAddress) {
    return new ethers.Contract(contractAddress, NFT_ABI, this.wallet);
  }

  /**
   * Get ERC721 balance
   */
  async getBalance(contractAddress, owner) {
    try {
      const contract = new ethers.Contract(contractAddress, ERC721_ABI, this.provider);
      return await contract.balanceOf(owner);
    } catch {
      return 0n;
    }
  }

  /**
   * Check if operator is approved for all NFTs
   */
  async isApprovedForAll(contractAddress, operator) {
    try {
      const contract = this.getContract(contractAddress);
      return await contract.isApprovedForAll(this.wallet.address, operator);
    } catch {
      return false;
    }
  }

  /**
   * Set approval for all (if needed for rescue)
   */
  async setApprovalForAll(contractAddress, operator, gasConfig) {
    try {
      const contract = this.getContract(contractAddress);
      const tx = await contract.setApprovalForAll.populateTransaction(operator, true);
      
      tx.gasLimit = await this.estimateGas(tx);
      tx.maxPriorityFeePerGas = gasConfig.maxPriorityFeePerGas;
      tx.maxFeePerGas = gasConfig.maxFeePerGas;
      tx.nonce = await this.provider.getTransactionCount(this.wallet.address, "pending");
      tx.type = 2;
      tx.chainId = (await this.provider.getNetwork()).chainId;

      const populatedTx = await this.wallet.populateTransaction(tx);
      const signedTx = await this.wallet.signTransaction(populatedTx);

      console.log(`[NFT Rescue] Approval set for ${operator}`);
      
      return {
        transaction: populatedTx,
        signedTransaction: signedTx,
        type: "APPROVAL",
        contractAddress,
        operator,
      };
    } catch (error) {
      console.error("[NFT Rescue] Approval error:", error.message);
      return null;
    }
  }

  /**
   * Create NFT rescue transaction (safeTransferFrom)
   */
  async createRescueTx(contractAddress, tokenId, safeAddress, gasConfig) {
    const contract = this.getContract(contractAddress);

    try {
      // Check ownership
      const owner = await contract.ownerOf(tokenId);
      if (owner.toLowerCase() !== this.wallet.address.toLowerCase()) {
        console.log(`[NFT Rescue] Token ${tokenId} not owned by wallet`);
        return null;
      }
    } catch (error) {
      console.error(`[NFT Rescue] Error checking ownership:`, error.message);
      return null;
    }

    // Use safeTransferFrom without data
    const tx = await contract.safeTransferFrom.populateTransaction(
      this.wallet.address,
      safeAddress,
      tokenId
    );

    tx.gasLimit = await this.estimateGas(tx);
    tx.maxPriorityFeePerGas = gasConfig.maxPriorityFeePerGas;
    tx.maxFeePerGas = gasConfig.maxFeePerGas;
    tx.nonce = await this.provider.getTransactionCount(this.wallet.address, "pending");
    tx.type = 2;
    tx.chainId = (await this.provider.getNetwork()).chainId;

    return {
      ...tx,
      tokenId: tokenId.toString(),
      contractAddress,
    };
  }

  /**
   * Estimate gas for NFT transfer
   */
  async estimateGas(tx) {
    try {
      return await this.provider.estimateGas({
        ...tx,
        from: this.wallet.address,
      });
    } catch {
      return 85000n;
    }
  }

  /**
   * Rescue single NFT
   */
  async rescue(contractAddress, tokenId, safeAddress, gasConfig) {
    const tx = await this.createRescueTx(contractAddress, tokenId, safeAddress, gasConfig);

    if (!tx) {
      return null;
    }

    try {
      const populatedTx = await this.wallet.populateTransaction(tx);
      const signedTx = await this.wallet.signTransaction(populatedTx);
      
      console.log(`[NFT Rescue] Prepared: Token ${tx.tokenId} from ${contractAddress} to ${safeAddress}`);
      
      return {
        transaction: populatedTx,
        signedTransaction: signedTx,
        tokenId: tx.tokenId,
        contractAddress,
        to: safeAddress,
        type: "TRANSFER",
      };
    } catch (error) {
      console.error("[NFT Rescue] Error:", error.message);
      return null;
    }
  }

  /**
   * Rescue multiple NFTs
   */
  async rescueMultiple(nfts, safeAddress, gasConfig) {
    const results = [];

    for (const nft of nfts) {
      const result = await this.rescue(nft.contract, nft.tokenId, safeAddress, gasConfig);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Get all NFTs owned by wallet (simplified - requires indexer in production)
   * Note: This is a simplified version. Production would use The Graph or indexer
   */
  async getOwnedNFTs(contractAddresses) {
    const owned = [];

    for (const contractAddress of contractAddresses) {
      const balance = await this.getBalance(contractAddress, this.wallet.address);
      
      if (balance > 0n) {
        owned.push({
          contract: contractAddress,
          balance: balance.toString(),
        });
      }
    }

    return owned;
  }
}

/**
 * Simple rescueNFT function as shown in architecture
 */
async function rescueNFT(contract, id, wallet, safe) {
  const NFT_ABI = [
    "function safeTransferFrom(address,address,uint256)",
  ];

  const nft = new ethers.Contract(contract, NFT_ABI, wallet);

  return nft.safeTransferFrom.populateTransaction(
    wallet.address,
    safe,
    id
  );
}

module.exports = {
  NFTRescue,
  rescueNFT,
  NFT_ABI,
};
