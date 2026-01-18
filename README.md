# Creator Checkout Escrow

A secure escrow smart contract for creator-driven commerce with integrated Kairo AI Sec security auditing and REST API.

## Overview

This contract enables a simplified three-party escrow system:
- **Consumer** deposits the purchase price → goes to **Store**
- **Store** deposits creator commission → goes to **Influencer**
- Funds automatically release when both parties fund

## Features

✅ **Simple API** - JSON endpoint to create escrow deals  
✅ **Auto-Release** - Funds release automatically when both parties fund  
✅ **Kairo Security** - Automatic security analysis before deployment  
✅ **Error Logging** - All errors logged to `errors` file  
✅ **CI/CD Ready** - GitHub Actions integration

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

Create `.env` file:
```bash
KAIRO_API_KEY=kairo_sk_live_xxxxx
ESCROW_ADDRESS=0x...  # Set after deployment
```

### 3. Compile & Test

```bash
npx hardhat compile
npx hardhat test
```

### 4. Deploy Contract

```bash
# Terminal 1: Start local blockchain
npx hardhat node

# Terminal 2: Deploy
npx hardhat run scripts/deploy.js --network localhost
# Copy Escrow address to .env as ESCROW_ADDRESS
```

### 5. Start API Server

```bash
npm run api
```

## API Usage

### Create Escrow Deal

**Endpoint:** `POST /api/create-escrow`

**Request:**
```json
{
  "price": "100000000",
  "commission": "2000000",
  "store_wallet": "0x...",
  "consumer_wallet": "0x...",
  "influencer_wallet": "0x..."
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Escrow created successfully",
  "kairoAnalysis": {
    "decision": "ALLOW",
    "status": "PASSED",
    "risk_score": 0
  },
  "contract": {
    "dealId": "0x...",
    "transactionHash": "0x...",
    "blockNumber": 12345
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": {
    "message": "Error description"
  }
}
```

### Example Request

```bash
curl -X POST http://localhost:3000/api/create-escrow \
  -H "Content-Type: application/json" \
  -d '{
    "price": "100000000",
    "commission": "2000000",
    "store_wallet": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "consumer_wallet": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "influencer_wallet": "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
  }'
```

## How It Works

1. **API receives JSON** with price, commission, and wallet addresses
2. **Kairo analysis runs** automatically on the contract
3. **If Kairo passes** (ALLOW/WARN) → Deal is created on blockchain
4. **If Kairo blocks** (BLOCK/ESCALATE) → Error logged, request fails
5. **Consumer funds** → Deposits price
6. **Store funds** → Deposits commission
7. **Auto-release** → Funds go to store and influencer

## Kairo Security Integration

### Automatic Analysis

Every API request automatically:
- Analyzes the contract with Kairo
- Returns decision (ALLOW/WARN/BLOCK/ESCALATE)
- Blocks deployment if security issues found
- Logs all findings

### Decision Meanings

- **ALLOW** ✅ - Safe to proceed
- **WARN** ⚠️ - Review findings, can proceed
- **BLOCK** ❌ - Do not deploy, fix issues
- **ESCALATE** 🚨 - Requires human review

## Project Structure

```
.
├── contracts/
│   ├── CreatorCheckoutEscrow.sol  # Main escrow contract
│   └── MockUSDC.sol                # Mock USDC for testing
├── test/
│   └── escrow.test.js              # Test suite
├── scripts/
│   ├── deploy.js                   # Deployment script
│   └── kairo-deploy-check.sh       # Pre-deployment check
├── api/
│   └── server.js                   # REST API server
├── .github/
│   └── workflows/
│       └── kairo-security.yml      # CI security gate
└── errors                           # Error log file
```

## Contract Functions

### `createDeal(consumer, store, influencer, price, commission)`
Creates a new escrow deal. Returns `dealId`.

### `fundConsumer(dealId)`
Consumer deposits price. Auto-releases if store already funded.

### `fundStore(dealId)`
Store deposits commission. Auto-releases if consumer already funded.

### `refund(dealId)`
Owner can refund if deal not completed.

## Error Handling

All errors are automatically logged to the `errors` file with:
- Timestamp
- Request data
- Kairo analysis results
- Error details

## CI/CD Integration

The GitHub Actions workflow automatically:
- Runs Kairo analysis on every PR
- Blocks merges if Kairo returns BLOCK/ESCALATE
- Shows security findings in PR comments

**Setup:**
1. Add `KAIRO_API_KEY` to GitHub Secrets
2. Push a PR - workflow runs automatically

## Development

```bash
# Compile
npm run compile

# Test
npm test

# Start API
npm run api

# Deploy
npm run deploy
```

## Deployment

### Render Deployment

The project is configured for Render deployment with `render.yaml` and `Procfile`.

**Required Environment Variables:**
- `KAIRO_API_KEY` - Your Kairo API key
- `ESCROW_ADDRESS` - Deployed contract address
- `RPC_URL` - Blockchain RPC endpoint (Infura/Alchemy/public RPC)
- `NODE_ENV=production`

**Steps:**
1. Deploy contracts to target network (save `ESCROW_ADDRESS`)
2. Push to GitHub
3. Connect repository to Render
4. Set environment variables in Render dashboard
5. Deploy - Render uses `Procfile` automatically

The API automatically detects production mode and uses ethers.js Provider instead of Hardhat.

### Network Configuration

For mainnet/testnet deployment, update `hardhat.config.js`:

```javascript
networks: {
  mainnet: {
    url: process.env.MAINNET_RPC_URL,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
  },
}
```

Then deploy:
```bash
npm run deploy --network mainnet
```

## License

MIT
