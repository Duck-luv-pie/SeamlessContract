# Testing Your Render Deployment

## 🌐 Your Render URL
**https://seamlesscontract.onrender.com**

---

## ✅ Quick Tests

### 1. Health Check (Test if server is running)

```bash
curl https://seamlesscontract.onrender.com/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-...",
  "service": "Creator Escrow API"
}
```

**✅ Success if:** Returns `{"status": "ok"}` with HTTP 200

---

### 2. Create Escrow Deal (Main functionality)

```bash
curl -X POST https://seamlesscontract.onrender.com/api/create-escrow \
  -H "Content-Type: application/json" \
  -d '{
    "price": "100000000",
    "commission": "2000000",
    "store_wallet": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "consumer_wallet": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "influencer_wallet": "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
  }'
```

**Expected Response (Simulation Mode):**
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
    "dealId": "0x1234...",
    "transactionHash": "0x5678...",
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

**✅ Success if:** Returns `{"success": true, ...}` with HTTP 200

---

## 🧪 Automated Test Script

Run the test script:

```bash
./test-render.sh
```

This will:
1. Test health check endpoint
2. Test create escrow endpoint
3. Show formatted results
4. Display summary

---

## 📋 One-Line Commands

### Health Check (One Line)
```bash
curl https://seamlesscontract.onrender.com/health
```

### Create Escrow (One Line)
```bash
curl -X POST https://seamlesscontract.onrender.com/api/create-escrow -H "Content-Type: application/json" -d '{"price":"100000000","commission":"2000000","store_wallet":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","consumer_wallet":"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC","influencer_wallet":"0x90F79bf6EB2c4f870365E785982E1f101E93b906"}'
```

### Pretty JSON Output (with jq)
```bash
curl https://seamlesscontract.onrender.com/health | jq .
```

```bash
curl -X POST https://seamlesscontract.onrender.com/api/create-escrow \
  -H "Content-Type: application/json" \
  -d '{"price":"100000000","commission":"2000000","store_wallet":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","consumer_wallet":"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC","influencer_wallet":"0x90F79bf6EB2c4f870365E785982E1f101E93b906"}' | jq .
```

---

## 🔍 What to Look For

### ✅ Success Indicators

**Health Check:**
- HTTP Status: `200`
- Response contains: `"status": "ok"`

**Create Escrow:**
- HTTP Status: `200`
- Response contains: `"success": true`
- Response contains: `"dealId"` (simulated or real)
- Response contains: `"kairoAnalysis"` with decision

### ❌ Error Indicators

**Common Errors:**

1. **"Connection refused" or timeout**
   - Service might be sleeping (free tier)
   - Wait 10-30 seconds and try again
   - First request after sleep takes longer

2. **"404 Not Found"**
   - Check URL is correct
   - Check service is deployed

3. **"500 Internal Server Error"**
   - Check Render logs
   - Verify `KAIRO_API_KEY` is set

4. **"KAIRO_API_KEY not set"**
   - Add `KAIRO_API_KEY` to Render environment variables

---

## 🌐 Browser Test

You can also test in your browser:

**Health Check:**
```
https://seamlesscontract.onrender.com/health
```

**Note:** Browser can only do GET requests, so you can't test POST `/api/create-escrow` directly in browser. Use curl or a tool like Postman.

---

## 📊 Testing Checklist

- [ ] Health check returns `{"status": "ok"}`
- [ ] Create escrow returns `{"success": true}`
- [ ] Response includes `dealId` (simulated)
- [ ] Response includes `transactionHash` (simulated)
- [ ] Response includes `kairoAnalysis` with decision
- [ ] Response shows `"simulated": true` (expected with only KAIRO_API_KEY)

---

## 🐛 Troubleshooting

### Service is Sleeping (Free Tier)
- First request takes 10-30 seconds
- Subsequent requests are faster
- Service stays awake for ~15 minutes of inactivity

### Check Render Logs
1. Go to Render Dashboard
2. Click your service
3. Click "Logs" tab
4. Look for errors or startup messages

### Verify Environment Variables
1. Render Dashboard → Your Service
2. Click "Environment" tab
3. Verify `KAIRO_API_KEY` is set

---

## ✅ Quick Test Command

Copy and paste this into your terminal:

```bash
echo "Testing health check..." && curl -s https://seamlesscontract.onrender.com/health | jq . && echo "" && echo "Testing create escrow..." && curl -s -X POST https://seamlesscontract.onrender.com/api/create-escrow -H "Content-Type: application/json" -d '{"price":"100000000","commission":"2000000","store_wallet":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","consumer_wallet":"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC","influencer_wallet":"0x90F79bf6EB2c4f870365E785982E1f101E93b906"}' | jq .
```

This will test both endpoints and show formatted JSON output.
