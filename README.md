# MEV Rescue Bot

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Node.js](https://img.shields.io/badge/node-%3E%3D20-green)
![License](https://img.shields.io/badge/license-MIT-yellow)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)

</div>

## Overview

Professional multi-chain MEV rescue bot for automated ETH, ERC20, and NFT rescue operations. The bot monitors wallets for suspicious activity and executes rescue transactions through multiple relay networks (Flashbots, bloXroute, Eden Network) to maximize success probability.

## Features

### Core Capabilities
- **Multi-Chain Support**: Ethereum, Base, Polygon, BSC
- **Multi-Relay Broadcasting**: Flashbots, bloXroute, Eden Network, Beaverbuild
- **Real-Time Mempool Monitoring**: Instant detection of wallet drain attempts
- **Automated Rescue Strategies**: ETH, ERC20, NFT, and Approval revocation

### Advanced Features
- **Bundle Simulation**: Simulate rescue bundles before submission
- **Gas Escalation**: Automatic gas price adjustment for competitive execution
- **Retry Engine**: Automatic retry with exponential backoff
- **Nonce Management**: Proper nonce tracking and gap detection
- **Private Mempool Access**: Direct access to private relay mem pools

### Monitoring & Alerts
- **Prometheus Metrics**: Full observability with Prometheus + Grafana
- **Telegram Alerts**: Real-time notifications for attacks and rescues
- **Health Endpoints**: `/health` and `/metrics` endpoints
- **Dashboard**: Real-time monitoring dashboard

## Architecture

```
rescue-bot/
├── config/           # Chain and relay configurations
├── src/
│   ├── core/         # Bot orchestration and main logic
│   ├── rpc/          # Provider cluster management
│   ├── detection/    # Wallet monitoring and attack detection
│   ├── strategies/   # Rescue strategy implementations
│   ├── gas/          # Gas oracle and escalation
│   ├── bundle/       # Bundle building and simulation
│   ├── relays/       # Multi-relay management
│   ├── alerts/       # Telegram alerting
│   ├── monitoring/   # Metrics and dashboard
│   └── utils/        # Logger and helpers
└── scripts/          # Deployment and utility scripts
```

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- npm or yarn
- Docker & Docker Compose (for production)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd mev-rescue-bot

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Configuration

Edit `.env` with your specific values:

```env
# Wallet Configuration
RESCUE_PRIVATE_KEY=your_private_key
RESCUE_DESTINATION=0x...
MONITORED_WALLETS=0x...,0x...

# RPC Endpoints
ETH_RPC=https://...
BASE_RPC=https://...
POLYGON_RPC=https://...
BSC_RPC=https://...

# Relay Configuration
FLASHBOTS_SIGNING_KEY=your-key

# Telegram
TELEGRAM_BOT_TOKEN=your-token
TELEGRAM_CHAT_ID=your-chat-id
```

### Development

```bash
# Start in development mode
npm run dev

# Build TypeScript
npm run build

# Start production
npm run start:prod
```

### Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f rescue-bot

# Stop services
docker-compose down
```

## Usage

### Basic Rescue Flow

1. **Wallet Monitoring**: Bot subscribes to mempool for monitored wallets
2. **Attack Detection**: Detects outgoing transfers from monitored wallets
3. **Rescue Planning**: Calculates optimal rescue transactions
4. **Bundle Building**: Creates MEV bundle with rescue transactions
5. **Multi-Relay Broadcast**: Sends bundle to multiple relays simultaneously
6. **Confirmation**: Monitors for bundle inclusion in blocks

### Supported Rescue Types

| Type | Description | Gas Estimate |
|------|-------------|--------------|
| ETH Rescue | Rescue remaining ETH balance | 21,000 gas |
| ERC20 Rescue | Rescue ERC20 token balances | ~65,000 gas |
| NFT Rescue | Rescue ERC721/ERC1155 NFTs | ~100,000 gas |
| Approval Revoke | Revoke token approvals | ~50,000 gas |

## Monitoring

### Prometheus Metrics

Access metrics at: `http://localhost:3000/metrics`

Key metrics:
- `rescue_bot_blocks_processed_total`
- `rescue_bot_attacks_detected_total`
- `rescue_bot_rescues_success_total`
- `rescue_bot_rescues_failed_total`
- `rescue_bot_gas_spent_total`
- `rescue_bot_bundle_latency_seconds`

### Grafana Dashboard

Access dashboard at: `http://localhost:3002`

Pre-configured dashboards:
- Block processing rate
- Attack detection timeline
- Rescue success rate
- Gas usage analysis
- Relay performance comparison

### Health Check

```bash
curl http://localhost:3000/health
# Response: {"status":"ok","timestamp":"..."}
```

## API Reference

### REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/metrics` | GET | Prometheus metrics |
| `/status` | GET | Bot status |
| `/wallets` | GET | List monitored wallets |
| `/rescues` | GET | Rescue history |

## Troubleshooting

### Common Issues

1. **RPC Connection Errors**
   - Check RPC endpoint availability
   - Verify API keys are correct
   - Ensure sufficient rate limits

2. **Bundle Submission Failures**
   - Check Flashbots/auth relayer credentials
   - Verify sufficient gas balance
   - Ensure nonce is correct

3. **Detection Misses**
   - Verify wallet addresses are correct
   - Check RPC is not filtering pending transactions

### Logs

```bash
# View bot logs
docker-compose logs -f rescue-bot

# View Prometheus logs
docker-compose logs -f prometheus
```

## Security Considerations

- **Private Key Security**: Store in environment variables, never commit
- **Rate Limiting**: Respect RPC provider limits
- **Gas Limits**: Always set appropriate gas limits
- **Multi-Sig**: Consider using multi-sig for rescue destination
- **Monitoring**: Enable alerts for suspicious activity

## License

MIT License - See [LICENSE](LICENSE) for details

## Disclaimer

This software is provided for educational and legitimate rescue purposes only. Users are responsible for compliance with applicable laws and regulations in their jurisdiction.
