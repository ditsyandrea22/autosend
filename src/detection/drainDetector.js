/**
 * Drain Detector
 * Detects wallet drain attacks
 */

// Known attack patterns
const ATTACK_PATTERNS = {
  // Direct ETH transfer out
  DIRECT_TRANSFER: 'direct_transfer',
  
  // ERC20 transfer
  ERC20_TRANSFER: 'erc20_transfer',
  
  // NFT transfer
  NFT_TRANSFER: 'nft_transfer',
  
  // Approval exploit
  APPROVAL_EXPLOIT: 'approval_exploit',
  
  // Permit phishing
  PERMIT_PHISHING: 'permit_phishing',
  
  // SetApprovalForAll exploit
  SET_APPROVAL_FOR_ALL: 'set_approval_for_all',
};

/**
 * Detect if transaction is a wallet drain attack
 * 
 * @param {ethers.Transaction} tx - Transaction object
 * @param {string} walletAddress - Monitored wallet address
 * @returns {object|null} Detection result or null
 */
function detectWalletDrain(tx, walletAddress) {
  if (!tx || !tx.from) {
    return null;
  }

  const fromAddress = tx.from.toLowerCase();
  const wallet = walletAddress.toLowerCase();

  // Check if transaction is from the monitored wallet
  if (fromAddress !== wallet) {
    return null;
  }

  // Check for direct ETH transfer (no data or simple transfer)
  if (!tx.data || tx.data === '0x') {
    // Get safe destination from environment (rescue destination is considered safe)
    const safeDestinations = [
      process.env.RESCUE_DESTINATION?.toLowerCase(),
      process.env.RESCUE_ADDRESS?.toLowerCase(),
    ].filter(Boolean);

    const toAddress = tx.to?.toLowerCase();
    
    // If transfer is to a known safe destination, it's not an attack
    if (toAddress && safeDestinations.includes(toAddress)) {
      return null;
    }

    // If there's no destination (burn address) or unknown destination, it's suspicious
    // But only flag as attack if value is above threshold (prevents false positives on small tests)
    const valueEth = tx.value ? ethers.formatEther(tx.value) : '0';
    const minValueThreshold = parseFloat(process.env.ATTACK_THRESHOLD_ETH || '0.01');
    
    if (parseFloat(valueEth) >= minValueThreshold) {
      return {
        type: ATTACK_PATTERNS.DIRECT_TRANSFER,
        detected: true,
        value: tx.value,
        to: tx.to,
        from: tx.from,
      };
    }
  }

  return null;
}

/**
 * Check if transaction is an ERC20 transfer
 * 
 * @param {ethers.Transaction} tx - Transaction object
 * @returns {boolean}
 */
function isERC20Transfer(tx) {
  if (!tx.data || tx.data.length < 10) {
    return false;
  }

  const selector = tx.data.substring(0, 10);
  
  // ERC20 transfer selectors
  const transferSelectors = [
    '0xa9059cbb', // transfer(address,uint256)
    '0x23b872dd', // transferFrom(address,address,uint256)
  ];

  return transferSelectors.includes(selector);
}

/**
 * Check if transaction is an ERC20 approval
 * 
 * @param {ethers.Transaction} tx - Transaction object
 * @returns {boolean}
 */
function isERC20Approval(tx) {
  if (!tx.data || tx.data.length < 10) {
    return false;
  }

  const selector = tx.data.substring(0, 10);
  
  // ERC20 approval selectors
  const approvalSelectors = [
    '0x095ea7b3', // approve(address,uint256)
    '0x8c5be1e5', // increaseAllowance(address,uint256)
    '0x39509351', // decreaseAllowance(address,uint256)
  ];

  return approvalSelectors.includes(selector);
}

/**
 * Check if transaction is NFT-related
 * 
 * @param {ethers.Transaction} tx - Transaction object
 * @returns {boolean}
 */
function isNFTTransfer(tx) {
  if (!tx.data || tx.data.length < 10) {
    return false;
  }

  const selector = tx.data.substring(0, 10);
  
  // NFT transfer selectors
  const nftSelectors = [
    '0x42842e0e', // safeTransferFrom(address,address,uint256)
    '0xb88d4fde', // safeTransferFrom(address,address,uint256,bytes)
    '0xf242432a', // safeTransferFrom(address,address,uint256,uint256,bytes)
    '0x2eb2c2d6', // safeTransferFrom variant
    '0x23b872dd', // transferFrom (can be NFT)
    '0x5c60da1b', // initialize (proxy)
  ];

  return nftSelectors.includes(selector);
}

/**
 * Check if transaction is setApprovalForAll
 * 
 * @param {ethers.Transaction} tx - Transaction object
 * @returns {boolean}
 */
function isSetApprovalForAll(tx) {
  if (!tx.data || tx.data.length < 10) {
    return false;
  }

  const selector = tx.data.substring(0, 10);
  return selector === '0xa22cb465'; // setApprovalForAll(address,bool)
}

/**
 * Analyze transaction for attack patterns
 * 
 * @param {ethers.Transaction} tx - Transaction object
 * @param {string} walletAddress - Monitored wallet address
 * @returns {object} Analysis result
 */
function analyzeTransaction(tx, walletAddress) {
  const result = {
    isAttack: false,
    patterns: [],
    severity: 'none',
    details: {},
  };

  if (!tx) {
    return result;
  }

  const from = tx.from ? tx.from.toLowerCase() : null;
  const wallet = walletAddress.toLowerCase();

  // Check if transaction is from monitored wallet
  if (from === wallet) {
    // Direct ETH transfer
    if (!tx.data || tx.data === '0x') {
      result.patterns.push(ATTACK_PATTERNS.DIRECT_TRANSFER);
      result.isAttack = true;
      result.severity = 'high';
      result.details.value = tx.value?.toString();
    }

    // ERC20 transfer
    if (isERC20Transfer(tx)) {
      result.patterns.push(ATTACK_PATTERNS.ERC20_TRANSFER);
      result.isAttack = true;
      result.severity = 'critical';
      result.details.tokenTransfer = true;
    }

    // NFT transfer
    if (isNFTTransfer(tx)) {
      result.patterns.push(ATTACK_PATTERNS.NFT_TRANSFER);
      result.isAttack = true;
      result.severity = 'critical';
      result.details.nftTransfer = true;
    }

    // Approval change
    if (isERC20Approval(tx)) {
      result.patterns.push(ATTACK_PATTERNS.APPROVAL_EXPLOIT);
      result.isAttack = true;
      result.severity = 'medium';
      result.details.approvalChange = true;
    }

    // SetApprovalForAll
    if (isSetApprovalForAll(tx)) {
      result.patterns.push(ATTACK_PATTERNS.SET_APPROVAL_FOR_ALL);
      result.isAttack = true;
      result.severity = 'critical';
      result.details.unlimitedApproval = true;
    }
  }

  // Check for Permit phishing (signature-based transfer)
  if (tx.data && tx.data.startsWith('0x')) {
    const permitSelectors = [
      '0xd505accf', // permit(address,address,uint256,uint256,uint8,bytes32,bytes32)
      '0x2b67b1a4', // permit (variant)
    ];
    
    if (permitSelectors.includes(tx.data.substring(0, 10))) {
      result.patterns.push(ATTACK_PATTERNS.PERMIT_PHISHING);
      result.isAttack = true;
      result.severity = 'critical';
      result.details.permitPhishing = true;
    }
  }

  return result;
}

/**
 * Calculate attack risk score
 * 
 * @param {object} analysis - Analysis result from analyzeTransaction
 * @returns {number} Risk score 0-100
 */
function calculateRiskScore(analysis) {
  if (!analysis.isAttack) {
    return 0;
  }

  let score = 0;

  switch (analysis.severity) {
    case 'critical':
      score = 100;
      break;
    case 'high':
      score = 70;
      break;
    case 'medium':
      score = 40;
      break;
    case 'low':
      score = 20;
      break;
  }

  return score;
}

module.exports = {
  ATTACK_PATTERNS,
  detectWalletDrain,
  isERC20Transfer,
  isERC20Approval,
  isNFTTransfer,
  isSetApprovalForAll,
  analyzeTransaction,
  calculateRiskScore,
};
