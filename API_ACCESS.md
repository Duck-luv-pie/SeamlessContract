# API Access Commands

## 🌐 Accessing Your API on Render

Once deployed to Render, your API will have a URL like:
- `https://your-app.onrender.com`
- `https://creator-escrow-api.onrender.com`
- Or whatever name you chose in Render

**Replace `YOUR_APP_URL` in the commands below with your actual Render URL.**

---

## ✅ Available Endpoints

### 1. Health Check
**Endpoint:** `GET /health`

**Command:**
```bash
curl https://YOUR_APP_URL.onrender.com/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-...",
  "service": "Creator Escrow API"
}
```

---

### 2. Create Escrow Deal (Main Endpoint) ⭐
**Endpoint:** `POST /api/create-escrow`

**Command (Single Line):**
```bash
curl -X POST https://YOUR_APP_URL.onrender.com/api/create-escrow \
  -H "Content-Type: application/json" \
  -d '{
    "price": "100000000",
    "commission": "2000000",
    "store_wallet": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "consumer_wallet": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "influencer_wallet": "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
  }'
```

**Command (Multi-line for readability):**
```bash
curl -X POST https://YOUR_APP_URL.onrender.com/api/create-escrow \
  -H "Content-Type: application/json" \
  -d '{
    "price": "100000000",
    "commission": "2000000",
    "store_wallet": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "consumer_wallet": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "influencer_wallet": "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
  }'
```

**Response (Simulation Mode):**
```json
{
  "success": true,
  "message": "Escrow created successfully (simulated)",
  "simulated": true,
  "kairoAnalysis": {
    "decision": "ALLOW",
    "status": "PASSED",
    "findings": []
  },
  "contract": {
    "dealId": "0x1234abcd...",
    "transactionHash": "0x5678efgh...",
    "blockNumber": 1234567,
    "gasUsed": "85000"
  },
  "details": {
    "price": "100000000",
    "commission": "2000000",
    "consumer_wallet": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "store_wallet": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "influencer_wallet": "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
  }
}
```

---

### 3. Get Contract Info
**Endpoint:** `GET /api/contract-info`

**Command:**
```bash
curl https://YOUR_APP_URL.onrender.com/api/contract-info
```

**Response (if ESCROW_ADDRESS not set):**
```json
{
  "error": "ESCROW_ADDRESS not set. Deploy contract first."
}
```

---

## 📝 Example with Pretty JSON Output

Add `| jq .` at the end to format JSON (requires `jq` installed):

```bash
curl -X POST https://YOUR_APP_URL.onrender.com/api/create-escrow \
  -H "Content-Type: application/json" \
  -d '{
    "price": "100000000",
    "commission": "2000000",
    "store_wallet": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "consumer_wallet": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "influencer_wallet": "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
  }' | jq .
```

---

## 🔧 Using in Different Terminals

### macOS/Linux Terminal
```bash
curl -X POST https://YOUR_APP_URL.onrender.com/api/create-escrow \
  -H "Content-Type: application/json" \
  -d '{"price":"100000000","commission":"2000000","store_wallet":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","consumer_wallet":"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC","influencer_wallet":"0x90F79bf6EB2c4f870365E785982E1f101E93b906"}'
```

### Windows Command Prompt (PowerShell)
```powershell
curl.exe -X POST https://YOUR_APP_URL.onrender.com/api/create-escrow `
  -H "Content-Type: application/json" `
  -d '{\"price\":\"100000000\",\"commission\":\"2000000\",\"store_wallet\":\"0x70997970C51812dc3A010C7d01b50e0d17dc79C8\",\"consumer_wallet\":\"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC\",\"influencer_wallet\":\"0x90F79bf6EB2c4f870365E785982E1f101E93b906\"}'
```

### Windows PowerShell (Native)
```powershell
Invoke-RestMethod -Uri "https://YOUR_APP_URL.onrender.com/api/create-escrow" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"price":"100000000","commission":"2000000","store_wallet":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","consumer_wallet":"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC","influencer_wallet":"0x90F79bf6EB2c4f870365E785982E1f101E93b906"}'
```

---

## 📋 Request Parameters

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `price` | string | Price in smallest units (wei/base units) | `"100000000"` |
| `commission` | string | Commission in smallest units | `"2000000"` |
| `store_wallet` | string | Ethereum address of store | `"0x70997970C51812dc3A010C7d01b50e0d17dc79C8"` |
| `consumer_wallet` | string | Ethereum address of consumer | `"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"` |
| `influencer_wallet` | string | Ethereum address of influencer | `"0x90F79bf6EB2c4f870365E785982E1f101E93b906"` |

---

## 🧪 Quick Test

**1. Test health check first:**
```bash
curl https://YOUR_APP_URL.onrender.com/health
```

**2. Then test creating a deal:**
```bash
curl -X POST https://YOUR_APP_URL.onrender.com/api/create-escrow \
  -H "Content-Type: application/json" \
  -d '{
    "price": "100000000",
    "commission": "2000000",
    "store_wallet": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "consumer_wallet": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "influencer_wallet": "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
  }'
```

---

## 🌐 Finding Your Render URL

1. Go to Render Dashboard
2. Click on your service
3. Your URL is shown at the top (e.g., `https://creator-escrow-api.onrender.com`)

Or check Render logs - it shows the URL when service starts.

---

## ✅ Success Indicators

**Health Check Success:**
- Returns `{"status": "ok", ...}`
- Status code: 200

**Create Escrow Success:**
- Returns `{"success": true, ...}`
- Includes `dealId` and `transactionHash` (simulated or real)
- Status code: 200

**Error Responses:**
- Returns `{"success": false, "error": {...}}`
- Status code: 400 or 500

---

## 🔍 Troubleshooting

**"Could not resolve host"**
- Check your Render URL is correct
- Make sure service is deployed and running

**"Connection refused"**
- Service might be sleeping (free tier)
- Wait a few seconds and try again
- First request after sleep takes longer

**Empty response or timeout**
- Check Render logs for errors
- Verify `KAIRO_API_KEY` is set correctly
- Check service is actually running

---

## 📝 Notes

- **Simulation Mode:** With only `KAIRO_API_KEY`, returns simulated contract data
- **First Request:** Free Render tier spins up service (may take 10-30 seconds)
- **Rate Limiting:** Free tier has limits, paid tier is faster
- **CORS:** API accepts requests from any origin (for demo purposes)
