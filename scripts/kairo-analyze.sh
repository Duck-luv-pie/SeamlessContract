#!/bin/bash
# Script to run Kairo AI Sec analysis locally
# Usage: ./scripts/kairo-analyze.sh

# Don't use set -e, we want to handle errors manually

# Load .env file if it exists (from project root)
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

if [ -z "$KAIRO_API_KEY" ]; then
  echo "Error: KAIRO_API_KEY environment variable is not set" >&2
  echo "Either:" >&2
  echo "  1. Create a .env file with: KAIRO_API_KEY=your_key" >&2
  echo "  2. Or export it: export KAIRO_API_KEY='kairo_sk_live_xxxxx'" >&2
  exit 1
fi

FILE="contracts/CreatorCheckoutEscrow.sol"

if [ ! -f "$FILE" ]; then
  echo "Error: $FILE not found" >&2
  exit 1
fi

echo "Running Kairo AI Sec analysis on $FILE..." >&2
echo >&2

# Make the API call and capture both response and exit code
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST https://kairoaisec.com/api/v1/analyze \
  -H "Authorization: Bearer $KAIRO_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"source\": {
      \"type\": \"inline\",
      \"files\": [{
        \"path\": \"$FILE\",
        \"content\": $(cat $FILE | jq -Rs .)
      }]
    },
    \"config\": {
      \"severity_threshold\": \"high\",
      \"include_suggestions\": true
    }
  }" 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Check if curl failed (network error)
if [ $? -ne 0 ] || [ -z "$BODY" ] || [ "$HTTP_CODE" != "200" ]; then
  echo "{\"error\": \"Kairo API call failed\", \"http_code\": \"$HTTP_CODE\", \"details\": \"Network or API error\"}" | jq .
  echo "Kairo decision: ERROR" >&2
  exit 1
fi

# Output the response
echo "$BODY" | jq .

# Extract decision
DECISION=$(echo "$BODY" | jq -r '.decision // "UNKNOWN"')
echo >&2
echo "Kairo decision: $DECISION" >&2

# Check decision and exit accordingly
if [ "$DECISION" = "BLOCK" ] || [ "$DECISION" = "ESCALATE" ]; then
  echo "❌ Security gate FAILED - Do not deploy!" >&2
  exit 1
elif [ "$DECISION" = "WARN" ]; then
  echo "⚠️  Security gate WARN - Review findings before deploying" >&2
  exit 0
elif [ "$DECISION" = "ALLOW" ]; then
  echo "✅ Security gate PASSED - Safe to proceed" >&2
  exit 0
else
  echo "❓ Unknown decision: $DECISION" >&2
  exit 1
fi
