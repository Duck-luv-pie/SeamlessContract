# Project Explanation: Creator Checkout Escrow

## Purpose
This project is a **blockchain-based escrow system** for creator-driven commerce. It allows a JSON input (wallets and costs) to create **real smart contracts on the Ethereum blockchain** that handle escrow transactions between three parties: Consumer, Store, and Influencer.

## Core Concept

### Three-Party Escrow Flow:
1. **Consumer** pays `price` → money goes to **Store** (product purchase)
2. **Store** pays `commission` → money goes to **Influencer** (creator commission)
3. Once **both parties fund**, funds **automatically release** to recipients

### What Makes It "Real":
- Creates actual smart contracts on the blockchain (Ethereum/Sepolia testnet)
- Uses real ERC-20 tokens (MockUSDC for testing, USDC for production)
- Transactions are permanently recorded on-chain
- Requires real gas fees to execute

## Architecture

### Components:

1. **Smart Contract** (`CreatorCheckoutEscrow.sol`)
   - Solidity contract deployed on blockchain
   - Manages escrow deals, funding, and automatic release
   - Uses OpenZeppelin contracts (Ownable, ReentrancyGuard)

2. **REST API** (`api/server.js`)
   - Express.js server that accepts JSON requests
   - Interacts with deployed smart contract using ethers.js
   - Runs security analysis via Kairo API before creating deals
   - Deployed on Render (https://seamlesscontract.onrender.com)

3. **Token Contract** (`MockUSDC.sol`)
   - ERC-20 token used for escrow payments
   - Mock token for testing, can be swapped for real USDC in production

## How It Works

### Step-by-Step Flow:

1. **User sends JSON to API**:
   ```json
   {
     "price": "100000000",  // Consumer pays this amount
     "commission": "2000000",  // Store pays this amount
     "consumer_wallet": "0x...",
     "store_wallet": "0x...",
     "influencer_wallet": "0x..."
   }
   ```

2. **API receives request** (`POST /api/create-escrow`):
   - Validates JSON input
   - Runs Kairo security analysis on contract (optional, can warn but continues)
   - Calls smart contract's `createDeal()` function
   - Sends real blockchain transaction

3. **Smart contract creates deal**:
   - Generates unique `dealId` (bytes32 hash)
   - Stores deal in contract state (on blockchain)
   - Emits `DealCreated` event
   - Deal status = `CREATED`

4. **Consumer funds** (`POST /api/fund-consumer`):
   - Consumer must approve contract to spend tokens first
   - API calls `fundConsumer(dealId)` on contract
   - Contract transfers `price` from consumer to escrow
   - If store already funded → **auto-releases**
   - Else status = `CONSUMER_FUNDED`

5. **Store funds** (`POST /api/fund-store`):
   - Store must approve contract to spend tokens first
   - API calls `fundStore(dealId)` on contract
   - Contract transfers `commission` from store to escrow
   - If consumer already funded → **auto-releases**
   - Else status = `STORE_FUNDED`

6. **Automatic release** (when both funded):
   - Contract transfers `price` to store
   - Contract transfers `commission` to influencer
   - Status = `RELEASED`
   - Deal is fulfilled

7. **Check status** (`GET /api/deal-status/:dealId`):
   - API calls `getDeal(dealId)` on contract
   - Returns current status, balances, fulfillment state

## API Endpoints

### 1. `POST /api/create-escrow`
**Purpose:** Create new escrow deal on blockchain

**Request:**
```json
{
  "price": "100000000",
  "commission": "2000000",
  "consumer_wallet": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "store_wallet": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "influencer_wallet": "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Escrow created successfully on blockchain",
  "contract": {
    "dealId": "0x...",
    "transactionHash": "0x...",
    "blockNumber": 12345
  }
}
```

**Requires:** `ESCROW_ADDRESS` environment variable (deployed contract address)

### 2. `POST /api/fund-consumer`
**Purpose:** Consumer pays price into escrow

**Request:**
```json
{
  "dealId": "0x...",
  "consumer_wallet": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
}
```

**Response:**
```json
{
  "success": true,
  "confirmation": {
    "consumerFunded": true,
    "transactionHash": "0x...",
    "blockNumber": 12346
  },
  "dealStatus": {
    "status": "CONSUMER_FUNDED" or "RELEASED",
    "fulfilled": true/false
  }
}
```

### 3. `POST /api/fund-store`
**Purpose:** Store pays commission into escrow

**Request:**
```json
{
  "dealId": "0x...",
  "store_wallet": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
}
```

**Response:**
```json
{
  "success": true,
  "confirmation": {
    "storeFunded": true,
    "transactionHash": "0x...",
    "blockNumber": 12347
  },
  "dealStatus": {
    "status": "STORE_FUNDED" or "RELEASED",
    "fulfilled": true/false
  }
}
```

### 4. `GET /api/deal-status/:dealId`
**Purpose:** Get current deal status and fulfillment

**Response:**
```json
{
  "success": true,
  "dealId": "0x...",
  "deal": {
    "consumer": "0x...",
    "store": "0x...",
    "influencer": "0x...",
    "price": "100000000",
    "commission": "2000000"
  },
  "status": {
    "status": "RELEASED",
    "statusCode": 4,
    "fulfilled": true,
    "consumerFunded": true,
    "storeFunded": true,
    "released": true
  }
}
```

## Smart Contract Functions

### `createDeal(consumer, store, influencer, price, commission)`
- Creates new escrow deal
- Returns unique `dealId` (bytes32)
- Deal stored in `mapping(bytes32 => Deal)`
- Status starts as `CREATED`

### `fundConsumer(dealId)`
- Consumer deposits `price` tokens
- If store already funded → calls `_release()` automatically
- Else updates status to `CONSUMER_FUNDED`
- Requires consumer to approve contract first

### `fundStore(dealId)`
- Store deposits `commission` tokens
- If consumer already funded → calls `_release()` automatically
- Else updates status to `STORE_FUNDED`
- Requires store to approve contract first

### `_release(dealId)`
- Internal function (called automatically when both funded)
- Transfers `price` to store
- Transfers `commission` to influencer
- Status = `RELEASED`

### `getDeal(dealId)`
- Returns deal info: addresses, amounts, status
- View function (no gas cost)

### `refund(dealId)`
- Owner-only function
- Refunds both parties if deal not completed
- Status = `REFUNDED`

## Deal Status Enum

```solidity
enum Status {
  NONE,           // 0 - Deal doesn't exist
  CREATED,        // 1 - Deal created, no funds yet
  CONSUMER_FUNDED,// 2 - Consumer paid, waiting for store
  STORE_FUNDED,   // 3 - Store paid, waiting for consumer
  RELEASED,       // 4 - Both funded, funds released (FULFILLED)
  REFUNDED        // 5 - Deal refunded by owner
}
```

## Environment Variables Required

### For Local Development:
- `ESCROW_ADDRESS` - Deployed contract address (after running deploy script)
- `KAIRO_API_KEY` - Optional, for security analysis

### For Production (Render):
- `ESCROW_ADDRESS` - Deployed contract address on blockchain
- `RPC_URL` - Blockchain RPC endpoint (e.g., Alchemy/Infura Sepolia)
- `PRIVATE_KEY` - Wallet private key (for signing transactions)
- `KAIRO_API_KEY` - Optional, for security analysis

## Key Requirements for "Real" Escrow

1. **Contract must be deployed** to a blockchain (Sepolia testnet or Mainnet)
2. **ESCROW_ADDRESS must be set** in environment variables
3. **Wallets must have tokens** (MockUSDC or USDC) and approve contract
4. **Wallets must have ETH** for gas fees
5. **RPC_URL must point** to real blockchain network

## Security Features

1. **ReentrancyGuard** - Prevents reentrancy attacks
2. **Ownable** - Only owner can refund
3. **Kairo Analysis** - Optional security analysis before deployment
4. **Address validation** - Ensures valid Ethereum addresses
5. **Status checks** - Prevents invalid state transitions

## Testing Flow

1. Deploy contracts to blockchain (local Hardhat node or Sepolia)
2. Get `ESCROW_ADDRESS` from deployment
3. Set `ESCROW_ADDRESS` in environment variables
4. Send JSON to `/api/create-escrow` → Get `dealId`
5. Fund consumer → Check status (should show `CONSUMER_FUNDED`)
6. Fund store → Check status (should show `RELEASED` and `fulfilled: true`)
7. Verify tokens transferred to store and influencer

## Key Distinction: Real vs Fake

- **REAL:** Creates actual blockchain transactions, requires `ESCROW_ADDRESS`, uses real gas, tokens are transferred on-chain
- **FAKE:** Would simulate without blockchain interaction, return mock data, no actual token transfers

**This project makes REAL escrows** - it requires `ESCROW_ADDRESS` to be set and will error if not configured. There is no simulation mode.
