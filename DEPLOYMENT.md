# Deployment Guide

## Pre-Deployment Checklist

### ✅ For GitHub Push

1. **Check sensitive files are in `.gitignore`:**
   ```bash
   # These should be in .gitignore:
   - .env (✅ already in .gitignore)
   - errors (✅ already in .gitignore)
   - *.log (✅ already in .gitignore)
   - node_modules/ (✅ already in .gitignore)
   ```

2. **Verify no sensitive data in code:**
   - ✅ No API keys hardcoded
   - ✅ No private keys in code
   - ✅ All secrets in `.env` (not committed)

3. **Test before pushing:**
   ```bash
   npm test
   npm run compile
   ```

### ✅ For Render Deployment

1. **Deploy contracts first** (to your target network)
   ```bash
   # Set up network in hardhat.config.js
   # Deploy using: npm run deploy --network <network>
   # Save ESCROW_ADDRESS to use in Render
   ```

2. **Set environment variables in Render dashboard:**
   - `KAIRO_API_KEY` - Your Kairo API key
   - `ESCROW_ADDRESS` - Deployed contract address
   - `RPC_URL` - Blockchain RPC endpoint (Infura/Alchemy/public RPC)
   - `PRIVATE_KEY` - (Optional) Wallet private key if API needs to sign transactions
   - `NODE_ENV` - Set to `production`
   - `PORT` - (Optional) Defaults to 3000

3. **Build artifacts** (contracts need to be compiled):
   - Contracts are compiled during `npm install` on Render
   - Or pre-compile and commit `artifacts/` directory (large, but works)

## Deployment Steps

### Step 1: Deploy to GitHub

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Escrow API with Kairo integration"

# Add remote
git remote add origin <your-github-repo-url>

# Push
git push -u origin main
```

### Step 2: Deploy to Render

#### Option A: Using Render Dashboard

1. **Create new Web Service:**
   - Connect your GitHub repository
   - Render will auto-detect `render.yaml` or `Procfile`

2. **Configure environment variables:**
   ```
   KAIRO_API_KEY=your_kairo_key
   ESCROW_ADDRESS=0x...
   RPC_URL=https://your-rpc-endpoint
   NODE_ENV=production
   PORT=3000
   ```

3. **Deploy:**
   - Render will run `npm install` (builds contracts)
   - Then run `npm run api` (starts server)

#### Option B: Using `render.yaml`

The `render.yaml` file is already configured. Just:
1. Push to GitHub
2. Connect repository to Render
3. Render will use `render.yaml` automatically

#### Option C: Manual Setup

1. **Service Type:** Web Service
2. **Build Command:** `npm install`
3. **Start Command:** `npm run api`
4. **Health Check Path:** `/health`

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `KAIRO_API_KEY` | ✅ Yes | Kairo API key for security analysis | `kairo_sk_live_...` |
| `ESCROW_ADDRESS` | ✅ Yes | Deployed contract address | `0x1234...` |
| `RPC_URL` | ✅ Yes (prod) | Blockchain RPC endpoint | `https://mainnet.infura.io/v3/...` |
| `PRIVATE_KEY` | ⚠️ Optional | Wallet private key (if API signs tx) | `0xabc...` |
| `NODE_ENV` | ⚠️ Recommended | Environment mode | `production` |
| `PORT` | ⚠️ Optional | Server port | `3000` |

## Network Configuration

### For Mainnet/Testnet Deployment

Update `hardhat.config.js` with your network:

```javascript
networks: {
  mainnet: {
    url: process.env.MAINNET_RPC_URL,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
  },
  sepolia: {
    url: process.env.SEPOLIA_RPC_URL,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
  },
}
```

### Deploy Contract

```bash
# Set environment variables
export MAINNET_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
export PRIVATE_KEY=0x...

# Deploy
npm run deploy --network mainnet

# Save ESCROW_ADDRESS to use in Render
```

## Post-Deployment

### Verify Deployment

1. **Health Check:**
   ```bash
   curl https://your-app.onrender.com/health
   ```

2. **Test API:**
   ```bash
   curl -X POST https://your-app.onrender.com/api/create-escrow \
     -H "Content-Type: application/json" \
     -d '{
       "price": "100000000",
       "commission": "2000000",
       "store_wallet": "0x...",
       "consumer_wallet": "0x...",
       "influencer_wallet": "0x..."
     }'
   ```

3. **Check Logs:**
   - View logs in Render dashboard
   - Check for errors or warnings

### Troubleshooting

**Issue: `RPC_URL must be set`**
- Solution: Set `RPC_URL` environment variable in Render dashboard

**Issue: `ESCROW_ADDRESS not set`**
- Solution: Deploy contract first, then set `ESCROW_ADDRESS` in Render

**Issue: `Cannot find artifacts`**
- Solution: Contracts need to be compiled. Either:
  - Pre-compile locally and commit `artifacts/` directory
  - Or ensure `npm install` runs on Render (builds contracts)

**Issue: `Kairo API unavailable`**
- Solution: Check `KAIRO_API_KEY` is set correctly
- Check network connectivity from Render

## Production Checklist

- [ ] Contracts deployed to target network
- [ ] `ESCROW_ADDRESS` saved and set in Render
- [ ] `KAIRO_API_KEY` set in Render (not exposed in code)
- [ ] `RPC_URL` set in Render
- [ ] `NODE_ENV=production` set
- [ ] Health check endpoint working (`/health`)
- [ ] API endpoint tested (`/api/create-escrow`)
- [ ] Error logging working (`errors` file)
- [ ] Monitoring set up (optional)

## Notes

- **Development vs Production:** The API automatically detects if it's running with Hardhat (development) or ethers.js (production)
- **Contract Artifacts:** In production, contracts must be compiled. Either commit `artifacts/` or compile during build
- **RPC Provider:** Use Infura, Alchemy, or public RPC for production
- **Private Key:** Only set `PRIVATE_KEY` if the API needs to sign transactions (usually not needed for read-only operations)
