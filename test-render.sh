#!/bin/bash

# Test script for Render deployment
# URL: https://seamlesscontract.onrender.com

BASE_URL="https://seamlesscontract.onrender.com"

echo "🧪 Testing Render Deployment: $BASE_URL"
echo ""

# Test 1: Health Check
echo "1️⃣  Testing Health Check..."
echo "   GET $BASE_URL/health"
echo ""
HEALTH_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$BASE_URL/health")
HTTP_STATUS=$(echo "$HEALTH_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$HEALTH_RESPONSE" | sed '/HTTP_STATUS/d')

if [ "$HTTP_STATUS" = "200" ]; then
    echo "   ✅ Health check PASSED (Status: $HTTP_STATUS)"
    echo "   Response:"
    echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
else
    echo "   ❌ Health check FAILED (Status: $HTTP_STATUS)"
    echo "   Response: $BODY"
fi
echo ""

# Test 2: Create Escrow Deal
echo "2️⃣  Testing Create Escrow Deal..."
echo "   POST $BASE_URL/api/create-escrow"
echo ""

DEAL_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/create-escrow" \
  -H "Content-Type: application/json" \
  -d '{
    "price": "100000000",
    "commission": "2000000",
    "store_wallet": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "consumer_wallet": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "influencer_wallet": "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
  }')

HTTP_STATUS=$(echo "$DEAL_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$DEAL_RESPONSE" | sed '/HTTP_STATUS/d')

if [ "$HTTP_STATUS" = "200" ]; then
    echo "   ✅ Create escrow PASSED (Status: $HTTP_STATUS)"
    echo "   Response:"
    echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
    
    # Check if simulated
    if echo "$BODY" | grep -q "simulated"; then
        echo ""
        echo "   ℹ️  Running in simulation mode (expected with only KAIRO_API_KEY)"
    fi
else
    echo "   ❌ Create escrow FAILED (Status: $HTTP_STATUS)"
    echo "   Response: $BODY"
fi
echo ""

# Summary
echo "📋 Test Summary:"
if [ "$HTTP_STATUS" = "200" ]; then
    echo "   ✅ API is working!"
    echo "   ✅ Health check: OK"
    echo "   ✅ Create escrow: OK"
else
    echo "   ⚠️  Some tests failed - check the responses above"
fi
