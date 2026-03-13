/**
 * Rescue Planner
 * Creates comprehensive rescue plans for attacked wallets
 */

const { ethers } = require('ethers');
const { logger } = require('../utils/logger');
const { getChainConfig } = require('../config/chains');
const { getERC20ABI, COMMON_TOKENS } = require('../config/tokens');
const { buildEthRescue } = require('./ethRescue');
const { buildERC20Rescue } = require('./erc20Rescue');
const { buildNFTRescue } = require('./nftRescue');

class RescuePlanner {
  constructor(providers, wallets) {
    this.providers = providers;
    this.wallets = wallets;
    this.commonTokenAddresses = Object.values(COMMON_TOKENS);
  }

  /**
   * Create comprehensive rescue plan for attack
   */
  async createRescuePlan(attackTx, chainName, destination) {
    logger.info(`[RescuePlanner] Creating rescue plan for ${attackTx.from}`);

    const transactions = [];
    const provider = this.providers[chainName];
    const walletAddress = attackTx.from;

    // Get current nonce
    let nonce = await provider.getTransactionCount(walletAddress);
    
    // Check and add ETH rescue
    if (process.env.ENABLE_ETH_RESCUE !== 'false') {
      try {
        const ethTx = await buildEthRescue(walletAddress, destination, provider, nonce);
        if (ethTx) {
          transactions.push(ethTx);
          nonce++;
          logger.info('[RescuePlanner] Added ETH rescue transaction');
        }
      } catch (e) {
        logger.error('[RescuePlanner] ETH rescue error:', e);
      }
    }

    // Check and add ERC20 rescues
    if (process.env.ENABLE_ERC20_RESCUE !== 'false') {
      try {
        const erc20Txs = await this.buildERC20Rescues(walletAddress, destination, provider, nonce);
        transactions.push(...erc20Txs);
        nonce += erc20Txs.length;
        logger.info(`[RescuePlanner] Added ${erc20Txs.length} ERC20 rescue transactions`);
      } catch (e) {
        logger.error('[RescuePlanner] ERC20 rescue error:', e);
      }
    }

    // Check and add NFT rescues
    if (process.env.ENABLE_NFT_RESCUE !== 'false') {
      try {
        const nftTxs = await this.buildNFTRescues(walletAddress, destination, provider, nonce);
        transactions.push(...nftTxs);
        nonce += nftTxs.length;
        logger.info(`[RescuePlanner] Added ${nftTxs.length} NFT rescue transactions`);
      } catch (e) {
        logger.error('[RescuePlanner] NFT rescue error:', e);
      }
    }

    return {
      walletAddress,
      destination,
      transactions,
      chainName,
      createdAt: Date.now(),
    };
  }

  /**
   * Create emergency rescue plan (manual trigger)
   */
  async createEmergencyRescuePlan(walletAddress, chainName, destination) {
    logger.info(`[RescuePlanner] Creating emergency rescue plan for ${walletAddress}`);

    const transactions = [];
    const provider = this.providers[chainName];

    // Get current nonce
    let nonce = await provider.getTransactionCount(walletAddress);

    // Add ETH rescue
    const ethTx = await buildEthRescue(walletAddress, destination, provider, nonce);
    if (ethTx) {
      transactions.push(ethTx);
      nonce++;
    }

    // Add all ERC20 rescues
    const erc20Txs = await this.buildERC20Rescues(walletAddress, destination, provider, nonce);
    transactions.push(...erc20Txs);
    nonce += erc20Txs.length;

    // Add all NFT rescues
    const nftTxs = await this.buildNFTRescues(walletAddress, destination, provider, nonce);
    transactions.push(...nftTxs);

    return {
      walletAddress,
      destination,
      transactions,
      chainName,
      emergency: true,
      createdAt: Date.now(),
    };
  }

  /**
   * Build ERC20 rescue transactions
   */
  async buildERC20Rescues(walletAddress, destination, provider, startNonce) {
    const transactions = [];
    let nonce = startNonce;

    // Check common tokens
    for (const tokenAddress of this.commonTokenAddresses) {
      try {
        const contract = new ethers.Contract(tokenAddress, getERC20ABI(), provider);
        const balance = await contract.balanceOf(walletAddress);

        if (balance.gt(0)) {
          const tx = await buildERC20Rescue(
            tokenAddress,
            walletAddress,
            destination,
            balance,
            provider,
            nonce
          );
          
          if (tx) {
            transactions.push(tx);
            nonce++;
          }
        }
      } catch (e) {
        // Skip failed token checks
      }
    }

    return transactions;
  }

  /**
   * Build NFT rescue transactions
   */
  async buildNFTRescues(walletAddress, destination, provider, startNonce) {
    const transactions = [];
    let nonce = startNonce;

    // Check common NFT contracts
    const nftAddresses = [
      '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', // BAYC
      '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB', // CryptoPunks
      '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85', // ENS
    ];

    const erc721ABI = [
      'function ownerOf(uint256 tokenId) view returns (address)',
      'function balanceOf(address owner) view returns (uint256)',
      'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
    ];

    for (const nftAddress of nftAddresses) {
      try {
        const contract = new ethers.Contract(nftAddress, erc721ABI, provider);
        const balance = await contract.balanceOf(walletAddress);

        if (balance.gt(0)) {
          // Try to rescue up to 5 NFTs
          const rescueCount = balance.gt(5) ? 5 : balance.toNumber();
          
          for (let i = 0; i < rescueCount; i++) {
            try {
              const tokenId = await contract.tokenOfOwnerByIndex(walletAddress, i);
              const tx = await buildNFTRescue(
                nftAddress,
                tokenId.toString(),
                walletAddress,
                destination,
                provider,
                nonce
              );
              
              if (tx) {
                transactions.push(tx);
                nonce++;
              }
            } catch (e) {
              break;
            }
          }
        }
      } catch (e) {
        // Skip failed NFT checks
      }
    }

    return transactions;
  }

  /**
   * Estimate total gas for rescue plan
   */
  async estimateGas(plan, provider) {
    let totalGas = 0n;
    const chainConfig = getChainConfig(plan.chainName);

    for (const tx of plan.transactions) {
      try {
        const gasEstimate = await provider.estimateGas(tx);
        totalGas += gasEstimate;
      } catch (e) {
        // Use default gas limit
        if (tx.data && tx.data.length > 0) {
          totalGas += BigInt(chainConfig?.gasLimits?.erc20Transfer || 65000);
        } else {
          totalGas += BigInt(chainConfig?.gasLimits?.ethTransfer || 21000);
        }
      }
    }

    return totalGas;
  }

  /**
   * Calculate rescue priority
   */
  calculatePriority(attackType) {
    const priorities = {
      erc20_transfer: 1,
      nft_transfer: 1,
      approval_exploit: 2,
      set_approval_for_all: 1,
      direct_transfer: 3,
    };

    return priorities[attackType] || 10;
  }
}

module.exports = {
  RescuePlanner,
};
