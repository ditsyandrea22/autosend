# MEV-Grade Ethereum Rescue Bot

A comprehensive wallet rescue system that monitors for drainer attacks and executes emergency fund rescues using private Flashbots bundles.

## ⚠️ WARNING: Educational Use Only

**This code is for educational and defensive purposes only.** Using this to rescue funds from wallets you don't own without authorization is illegal. This bot is designed to:
- Protect wallets YOU own from drainer attacks
- Monitor your own wallets for suspicious transactions
- Execute emergency rescues of YOUR funds

## Features

- **AI-Based Drainer Detection** - Uses heuristic analysis to detect common drainer patterns (approval exploits, malicious contracts)
- **Mempool Monitoring** - Watches pending transactions involving protected wallets
- **Flashbots Integration** - Sends private bundles to avoid public mempool and front-running
- **Multi-Builder Support** - Broadcasts to multiple builders for higher inclusion probability
- **Gas Escalation** - Automatic gas price escalation on failed attempts
- **Nonce Locking** - Prevents nonce collisions during concurrent operations
- **Multi-RPC Redundancy** - Falls back to backup RPC endpoints

## Architecture

```
rescue-bot/
 ├ core/                    # Core orchestration
 │   ├ mempool-engine.js    # Mempool monitoring
 │   ├ gasStrategy.js       # Gas estimation
 │   └ rescue-orchestrator.js
 ├ rescue/                  # Asset rescue operations
 │   ├ eth-rescue.js        # ETH transfers
 │   ├ erc20-rescue.js     # ERC20 token rescues
 │   ├ nft-rescue.js       # NFT rescues
 │   └ approval-revoke.js  # Approval revocations
 ├ strategy/                # Execution strategies
 │   ├ gas-predictor.js    # Gas price prediction
 │   ├ bundle-optimizer.js # Bundle optimization
 │   └ block-targeter.js   # Block targeting
 ├ relay/                   # Builder communication
 │   ├ flashbots-relay.js  # Flashbots integration
 │   └ builder-broadcast.js
 ├ infra/                   # Infrastructure
 │   ├ multi-rpc.js        # RPC redundancy
 │   └ latency-monitor.js
 ├ ai/                      # AI/ML components
 │   ├ drainer-classifier.js
 │   └ tx-risk-analyzer.js
 └ config/
     └ env.js              # Configuration
```

## Prerequisites

- Node.js v18+
- An Ethereum Mainnet RPC URL (Infura, Alchemy, etc.)
- A Flashbots auth signer (get one at https://docs.flashbots.net/flashbots-protect/quick-start)
- The wallet private key you want to protect

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy the environment template:
```bash
cp .env.example .env
```

3. Edit `.env` with your configuration:
```env
# Required
RPC_URL=https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID
PRIVATE_KEY=your_private_key_without_0x_prefix
TO_ADDRESS=0xrecipient_address_here

# Required for Flashbots (get from https://docs.flashbots.net/)
FLASHBOTS_AUTH_SIGNER=your_flashbots_auth_signer_private_key
```

4. Run the bot:
```bash
npm start
```

## How It Works

### 1. Mempool Monitoring
The bot subscribes to pending transactions and checks if any involve the protected wallet address.

### 2. Drainer Detection
Transactions are analyzed using:
- Function selector matching (approve, setApprovalForAll, transferFrom)
- Gas price analysis (unusually high gas = suspicious)
- Contract age checking (new contracts = higher risk)
- Multi-step attack pattern detection

### 3. Bundle Building
When a drainer is detected, the bot builds a rescue bundle:
- Revokes all token approvals
- Transfers all ERC20 tokens
- Transfers all NFTs
- Transfers remaining ETH

### 4. Private Submission
The bundle is sent via:
- Flashbots private relay (primary)
- Multiple builder endpoints (for redundancy)

### 5. Gas Escalation
If the bundle fails simulation, gas prices are automatically escalated:
- Attempt 1: 2x base gas
- Attempt 2: 3x base gas
- Attempt 3: 5x base gas
- ... up to 21x

## Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `RPC_URL` | Primary Ethereum RPC | Required |
| `PRIVATE_KEY` | Wallet to protect | Required |
| `TO_ADDRESS` | Destination for rescued funds | Required |
| `FLASHBOTS_AUTH_SIGNER` | Flashbots auth wallet | Required |
| `BLOCK_TARGET_STRATEGY` | fast/balanced/aggressive | balanced |
| `GAS_MULTIPLIER` | Base gas multiplier | 6 |
| `ENABLE_MEMPOOL_MONITORING` | Watch mempool | true |

## Security Notes

1. **Private Key Security**: This bot requires a private key to sign rescue transactions. For production use, consider:
   - Hardware wallet integration
   - Encrypted key storage
   - Multisig setup

2. **Flashbots Auth Signer**: This is a SEPARATE wallet from your rescue wallet. Get one from the Flashbots Protect dashboard.

3. **Test First**: Always test with small amounts on testnet before using on mainnet.

4. **Monitor Closely**: This bot should run with active monitoring in case issues arise.

## Disclaimer

This software is provided "as is" without warranty of any kind. Use at your own risk. The authors are not responsible for any funds lost due to bugs, exploits, or misconfiguration.

## License

ISC
