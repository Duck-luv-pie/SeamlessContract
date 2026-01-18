#!/bin/bash
# Script to run Kairo deploy check before deployment
# Usage: ./scripts/kairo-deploy-check.sh <chain_id> <network_name>
# Example: ./scripts/kairo-deploy-check.sh 11155111 sepolia

set -e

# Load .env file if it exists (from project root)
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

if [ -z "$KAIRO_API_KEY" ]; then
  echo "Error: KAIRO_API_KEY environment variable is not set"
  echo "Either:"
  echo "  1. Create a .env file with: KAIRO_API_KEY=your_key"
  echo "  2. Or export it: export KAIRO_API_KEY='kairo_sk_live_xxxxx'"
  exit 1
fi

if [ -z "$KAIRO_PROJECT_ID" ]; then
  echo "Error: KAIRO_PROJECT_ID environment variable is not set"
  echo "Get this from your Kairo dashboard"
  exit 1
fi

CHAIN_ID=${1:-11155111}
NETWORK_NAME=${2:-sepolia}

echo "Running Kairo deploy check for $NETWORK_NAME (chain ID: $CHAIN_ID)..."
echo

RESPONSE=$(curl -s -X POST https://kairoaisec.com/api/v1/deploy/check \
  -H "Authorization: Bearer $KAIRO_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"$KAIRO_PROJECT_ID\",
    \"contract_name\": \"CreatorCheckoutEscrow\",
    \"network\": {
      \"chain_id\": $CHAIN_ID,
      \"name\": \"$NETWORK_NAME\"
    }
  }")

echo "$RESPONSE" | jq .

DECISION=$(echo "$RESPONSE" | jq -r '.decision // .status')
echo
echo "Kairo deploy check decision: $DECISION"

if [ "$DECISION" = "BLOCK" ] || [ "$DECISION" = "ESCALATE" ]; then
  echo "❌ Deploy gate FAILED - Do not deploy!"
  exit 1
else
  echo "✅ Deploy gate PASSED - Safe to deploy"
  exit 0
fi
