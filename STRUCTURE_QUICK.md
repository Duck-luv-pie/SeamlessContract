# Quick File Structure Guide

## 📁 What's Where

```
creator-escrow/
│
├── 📄 contracts/              ← Smart contracts (Solidity)
│   ├── CreatorCheckoutEscrow.sol  (Main escrow logic)
│   └── MockUSDC.sol              (Test token)
│
├── 🧪 test/                    ← Tests
│   └── escrow.test.js            (4 test cases)
│
├── 📜 scripts/                 ← Utility scripts
│   ├── deploy.js                 (Deploy contracts)
│   ├── kairo-analyze.sh          (Security analysis)
│   └── kairo-deploy-check.sh     (Pre-deploy check)
│
├── 🌐 api/                     ← REST API
│   └── server.js                 (Main API server)
│
├── ⚙️  Config Files
│   ├── package.json              (Dependencies)
│   ├── hardhat.config.js         (Hardhat config)
│   └── .env                      (Secrets - don't commit!)
│
└── 📚 Documentation
    ├── README.md                 (Full docs)
    └── PROJECT_STRUCTURE.md      (This file)
```

## 🎯 What Each Part Does

### Smart Contracts (`contracts/`)
- **CreatorCheckoutEscrow.sol**: The escrow contract
  - Consumer pays → Store gets money
  - Store pays → Influencer gets money
  - Auto-releases when both fund

### API Server (`api/server.js`)
- Accepts JSON: `{price, commission, store_wallet, consumer_wallet, influencer_wallet}`
- Runs Kairo security check automatically
- Creates deal on blockchain
- Returns dealId and transaction hash
- Logs errors to `errors` file

### Scripts (`scripts/`)
- **deploy.js**: Deploys contracts, outputs addresses
- **kairo-analyze.sh**: Runs security analysis
- **kairo-deploy-check.sh**: Final check before mainnet

### Tests (`test/`)
- Verifies escrow works correctly
- Tests auto-release, refunds, security

## 🔄 How It Works

```
1. Client sends JSON to API
   ↓
2. API validates input
   ↓
3. API calls Kairo (security check)
   ↓
4. If Kairo passes → Create deal on blockchain
   ↓
5. Return dealId to client
   ↓
6. Consumer & Store fund the deal
   ↓
7. Funds auto-release when both funded
```

## 🚀 Quick Start for New Teammates

1. **Clone repo**
2. **Install:** `npm install`
3. **Compile:** `npm run compile`
4. **Test:** `npm test`
5. **Deploy:** `npm run deploy` (after starting `npx hardhat node`)
6. **Start API:** `npm run api`

## 📊 File Sizes

- **Contracts**: 2 files, ~200 lines
- **API**: 1 file, ~500 lines
- **Tests**: 1 file, ~170 lines
- **Scripts**: 3 files, ~200 lines
- **Total**: ~10 essential files, ~1000 lines of code

## 🔑 Key Files to Know

| File | Purpose | When to Edit |
|------|---------|--------------|
| `contracts/CreatorCheckoutEscrow.sol` | Main contract | Adding features |
| `api/server.js` | REST API | Changing API behavior |
| `test/escrow.test.js` | Tests | Adding test cases |
| `scripts/deploy.js` | Deployment | Changing deploy logic |
| `.env` | Secrets | Setting API keys, addresses |

## ⚠️ Important Notes

- **`.env`** - Contains secrets, never commit!
- **`errors`** - Error log file, auto-generated
- **`artifacts/`** - Compiled contracts, auto-generated
- **`node_modules/`** - Dependencies, don't commit

## 🎓 For New Developers

**To understand the code:**
1. Start with `contracts/CreatorCheckoutEscrow.sol` - core logic
2. Then `api/server.js` - how API works
3. Then `test/escrow.test.js` - see it in action

**To make changes:**
1. Edit contract → Compile → Test
2. Edit API → Restart server
3. Always run tests before committing
