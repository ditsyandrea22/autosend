/**
 * Build Rescue Transaction
 * Creates rescue transaction with optimal gas settings
 */

const { ethers, BigNumber } = require("ethers");
const { getGas, getGasLimit, calculateSendAmount } = require("./gasStrategy");
const { logger } = require("../utils/logger");

/**
 * Build ETH rescue transaction
 * 
 * @param {ethers.Wallet} wallet - Wallet to rescue from
 * @param {ethers.Provider} provider - Provider
 * @param {string} rescueAddress - Destination address
 * @param {boolean} isUnderAttack - Whether under attack
 * @returns {Promise<Object>} Transaction object
 */
async function buildRescueTx(wallet, provider, rescueAddress, isUnderAttack = false) {
  // Get balance
  const balance = await provider.getBalance(wallet.address);
  
  logger.info("Building rescue transaction", {
    balance: ethers.formatEther(balance),
    rescueAddress,
  });

  if (balance.eq(BigNumber.from(0))) {
    throw new Error("Balance is zero, nothing to rescue");
  }

  // Get aggressive gas settings
  const gas = await getGas(provider, isUnderAttack);
  const gasLimit = getGasLimit("eth");

  // Calculate send amount after gas
  const amountToSend = calculateSendAmount(balance, gas.maxFeePerGas, gasLimit);

  if (amountToSend.eq(BigNumber.from(0))) {
    throw new Error("Insufficient balance to cover gas costs");
  }

  // Get chain ID
  const network = await provider.getNetwork();

  // Build transaction
  const tx = {
    to: rescueAddress,
    value: amountToSend,
    gasLimit: gasLimit,
    maxPriorityFeePerGas: gas.maxPriorityFeePerGas,
    maxFeePerGas: gas.maxFeePerGas,
    nonce: await provider.getTransactionCount(wallet.address, "pending"),
    type: 2, // EIP-1559
    chainId: network.chainId,
  };

  logger.info("Rescue tx built", {
    to: tx.to,
    value: ethers.formatEther(tx.value),
    gasLimit: tx.gasLimit,
    maxFee: ethers.formatUnits(tx.maxFeePerGas, "gwei"),
    nonce: tx.nonce,
  });

  return tx;
}

/**
 * Build ERC20 rescue transaction
 * 
 * @param {ethers.Wallet} wallet - Wallet to rescue from
 * @param {ethers.Provider} provider - Provider
 * @param {string} tokenAddress - ERC20 token address
 * @param {string} rescueAddress - Destination address
 * @param {boolean} isUnderAttack - Whether under attack
 * @returns {Promise<Object>} Transaction object
 */
async function buildERC20RescueTx(wallet, provider, tokenAddress, rescueAddress, isUnderAttack = false) {
  const token = new ethers.Contract(
    tokenAddress,
    [
      "function balanceOf(address owner) view returns (uint256)",
      "function transfer(address to, uint256 amount) returns (bool)",
    ],
    provider
  );

  const balance = await token.balanceOf(wallet.address);
  
  if (balance.eq(BigNumber.from(0))) {
    throw new Error("Token balance is zero");
  }

  // Get gas
  const gas = await getGas(provider, isUnderAttack);
  const gasLimit = getGasLimit("erc20");

  // Get chain ID
  const network = await provider.getNetwork();

  // Build transaction
  const tx = {
    to: tokenAddress,
    data: token.interface.encodeFunctionData("transfer", [rescueAddress, balance]),
    gasLimit: gasLimit,
    maxPriorityFeePerGas: gas.maxPriorityFeePerGas,
    maxFeePerGas: gas.maxFeePerGas,
    nonce: await provider.getTransactionCount(wallet.address, "pending"),
    type: 2,
    chainId: network.chainId,
  };

  logger.info("ERC20 rescue tx built", {
    token: tokenAddress,
    amount: balance.toString(),
  });

  return tx;
}

/**
 * Build NFT rescue transaction
 * 
 * @param {ethers.Wallet} wallet - Wallet to rescue from
 * @param {ethers.Provider} provider - Provider
 * @param {string} nftAddress - NFT contract address
 * @param {string} rescueAddress - Destination address
 * @param {boolean} isUnderAttack - Whether under attack
 * @returns {Promise<Object>} Transaction object
 */
async function buildNFTRescueTx(wallet, provider, nftAddress, rescueAddress, isUnderAttack = false) {
  const nft = new ethers.Contract(
    nftAddress,
    [
      "function balanceOf(address owner) view returns (uint256)",
      "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
      "function safeTransferFrom(address from, address to, uint256 tokenId) external",
    ],
    provider
  );

  const balance = await nft.balanceOf(wallet.address);
  
  if (balance.eq(BigNumber.from(0))) {
    throw new Error("NFT balance is zero");
  }

  // Get gas
  const gas = await getGas(provider, isUnderAttack);
  const gasLimit = BigNumber.from(getGasLimit("nft")); // Fixed gas for NFT transfer

  // Get first NFT token ID
  const tokenId = await nft.tokenOfOwnerByIndex(wallet.address, 0);

  // Get chain ID
  const network = await provider.getNetwork();

  // Build transaction
  const tx = {
    to: nftAddress,
    data: nft.interface.encodeFunctionData("safeTransferFrom", [wallet.address, rescueAddress, tokenId]),
    gasLimit: gasLimit,
    maxPriorityFeePerGas: gas.maxPriorityFeePerGas,
    maxFeePerGas: gas.maxFeePerGas,
    nonce: await provider.getTransactionCount(wallet.address, "pending"),
    type: 2,
    chainId: network.chainId,
  };

  logger.info("NFT rescue tx built", {
    nft: nftAddress,
    tokenId: tokenId.toString(),
  });

  return tx;
}

module.exports = {
  buildRescueTx,
  buildERC20RescueTx,
  buildNFTRescueTx,
};
