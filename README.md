# Auto Send ETH Wallet to Wallet on Ethereum Mainnet

This project allows you to automatically send ETH from one wallet to another on Ethereum Mainnet using Node.js and ethers.js.

## Prerequisites

- Node.js (v14 or higher)
- An Ethereum Mainnet RPC URL (from Infura, Alchemy, etc.)
- A sender wallet with some ETH
- The recipient's Ethereum address

## Setup

1. Clone this repository (or copy the files)
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory and fill in your details:
   ```
   RPC_URL=https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID
   PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
   TO_ADDRESS=0xRecipientAddressHere
   AMOUNT_IN_ETH=0.01
   ```

   > **Warning**: Never commit your `.env` file to version control as it contains your private key.

## Usage

Run the script:
```
npm start
```

Or directly with Node:
```
node sendTransaction.js
```

The script will:
1. Check the sender's balance
2. Send the specified amount of ETH to the recipient
3. Wait for the transaction to be mined and confirm its status

## Security Notes

- This script uses a private key stored in an environment variable. For production use, consider using a more secure method like a hardware wallet or a key management service.
- Always test with a small amount first.
- Keep your private key secure and never share it.

## Dependencies

- [ethers.js](https://docs.ethers.org/v6/) - Ethereum wallet implementation and utilities
- [dotenv](https://www.npmjs.com/package/dotenv) - Loads environment variables from a .env file

## Disclaimer

This is a simple example for educational purposes. Always double-check transaction details before sending funds on the blockchain.