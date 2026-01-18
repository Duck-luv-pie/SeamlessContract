const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Load environment variables
require('dotenv').config();

// =============================================================================
// IN-MEMORY ESCROW SIMULATION WITH BALANCE TRACKING
// =============================================================================

// Deal status enum (mirrors the Solidity contract)
const Status = {
  NONE: 0,
  CREATED: 1,
  CONSUMER_FUNDED: 2,
  STORE_FUNDED: 3,
  RELEASED: 4,
  REFUNDED: 5
};

const StatusNames = ['NONE', 'CREATED', 'CONSUMER_FUNDED', 'STORE_FUNDED', 'RELEASED', 'REFUNDED'];

// In-memory storage for deals
const deals = new Map();

// In-memory storage for wallet balances (simulated token balances)
// Key: wallet address (lowercase), Value: BigInt balance
const walletBalances = new Map();

// Escrow holding - tokens locked in escrow for each deal
// Key: dealId, Value: { consumerAmount: BigInt, storeAmount: BigInt }
const escrowHoldings = new Map();

// Simulated block number (increments with each transaction)
let blockNumber = 1000000;

// Token decimals (USDC has 6 decimals)
const TOKEN_DECIMALS = 6;
const TOKEN_SYMBOL = 'USDC';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Generate a unique deal ID
function generateDealId() {
  return '0x' + crypto.randomBytes(32).toString('hex');
}

// Generate a fake transaction hash
function generateTxHash() {
  return '0x' + crypto.randomBytes(32).toString('hex');
}

// Generate fake gas used
function generateGasUsed() {
  return (Math.floor(Math.random() * 100000) + 50000).toString();
}

// Get next block number
function getNextBlock() {
  return ++blockNumber;
}

// Validate Ethereum address format
function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Get wallet balance (returns BigInt)
function getBalance(walletAddress) {
  const addr = walletAddress.toLowerCase();
  return walletBalances.get(addr) || 0n;
}

// Set wallet balance
function setBalance(walletAddress, amount) {
  const addr = walletAddress.toLowerCase();
  walletBalances.set(addr, BigInt(amount));
}

// Add to wallet balance
function addBalance(walletAddress, amount) {
  const addr = walletAddress.toLowerCase();
  const current = getBalance(addr);
  walletBalances.set(addr, current + BigInt(amount));
}

// Subtract from wallet balance (returns false if insufficient)
function subtractBalance(walletAddress, amount) {
  const addr = walletAddress.toLowerCase();
  const current = getBalance(addr);
  const amountBigInt = BigInt(amount);
  if (current < amountBigInt) {
    return false;
  }
  walletBalances.set(addr, current - amountBigInt);
  return true;
}

// Format balance for display (with decimals)
function formatBalance(amount) {
  const amountStr = amount.toString().padStart(TOKEN_DECIMALS + 1, '0');
  const intPart = amountStr.slice(0, -TOKEN_DECIMALS) || '0';
  const decPart = amountStr.slice(-TOKEN_DECIMALS);
  return `${intPart}.${decPart}`;
}

// =============================================================================
// KAIRO SECURITY ANALYSIS
// =============================================================================

async function runKairoAnalysis() {
  try {
    const KAIRO_API_KEY = process.env.KAIRO_API_KEY;
    if (!KAIRO_API_KEY) {
      return {
        success: false,
        decision: 'WARN',
        error: 'KAIRO_API_KEY not set in environment',
        errorType: 'not_configured'
      };
    }

    // Read contract file
    const contractPath = path.join(__dirname, '../contracts/CreatorCheckoutEscrow.sol');
    const contractContent = await fs.readFile(contractPath, 'utf-8');

    // Call Kairo API
    const https = require('https');
    
    const postData = JSON.stringify({
      source: {
        type: "inline",
        files: [{
          path: "contracts/CreatorCheckoutEscrow.sol",
          content: contractContent
        }]
      },
      config: {
        severity_threshold: "high",
        include_suggestions: true
      }
    });

    const options = {
      hostname: 'kairoaisec.com',
      port: 443,
      path: '/api/v1/analyze',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KAIRO_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const response = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (parseError) {
              reject(new Error(`Failed to parse Kairo response: ${parseError.message}`));
            }
          } else {
            reject(new Error(`Kairo API returned status ${res.statusCode}: ${data}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`Kairo API request failed: ${error.message}`));
      });
      
      req.write(postData);
      req.end();
    });

    return {
      success: true,
      decision: response.decision || 'UNKNOWN',
      response: response,
      decision_reason: response.decision_reason || null,
      risk_score: response.risk_score || null,
      findings: response.findings || []
    };
    
  } catch (error) {
    console.error('Kairo analysis error:', error.message);
    return {
      success: false,
      decision: 'WARN',
      error: error.message,
      errorType: error.message.includes('403') ? 'rate_limited' : 'api_error'
    };
  }
}

// =============================================================================
// ERROR LOGGING
// =============================================================================

async function logError(errorData) {
  const errorLog = {
    timestamp: new Date().toISOString(),
    ...errorData
  };
  
  const errorFile = path.join(__dirname, '../errors');
  const errorLine = JSON.stringify(errorLog, null, 2) + '\n\n---\n\n';
  
  try {
    await fs.appendFile(errorFile, errorLine);
    console.log('Error logged to errors file');
  } catch (err) {
    console.error('Failed to write to errors file:', err);
  }
}

// =============================================================================
// API ENDPOINTS
// =============================================================================

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Creator Escrow API',
    mode: 'simulation',
    dealsCount: deals.size,
    walletsCount: walletBalances.size,
    tokenSymbol: TOKEN_SYMBOL,
    tokenDecimals: TOKEN_DECIMALS
  });
});

/**
 * Mint tokens to a wallet (give starting balance)
 */
app.post('/api/mint', async (req, res) => {
  try {
    const { wallet, amount } = req.body;
    
    console.log('\n=== Mint Tokens Request ===');
    console.log('Received:', { wallet, amount });
    
    if (!wallet || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet, amount'
      });
    }
    
    if (!isValidAddress(wallet)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet address'
      });
    }
    
    const amountBigInt = BigInt(amount);
    if (amountBigInt <= 0n) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0'
      });
    }
    
    const previousBalance = getBalance(wallet);
    addBalance(wallet, amountBigInt);
    const newBalance = getBalance(wallet);
    
    const txHash = generateTxHash();
    const block = getNextBlock();
    
    console.log(`✅ Minted ${formatBalance(amountBigInt)} ${TOKEN_SYMBOL} to ${wallet}`);
    
    return res.json({
      success: true,
      message: `Minted ${formatBalance(amountBigInt)} ${TOKEN_SYMBOL} to wallet`,
      simulated: true,
      wallet: wallet.toLowerCase(),
      amount: amount.toString(),
      amountFormatted: formatBalance(amountBigInt),
      previousBalance: previousBalance.toString(),
      previousBalanceFormatted: formatBalance(previousBalance),
      newBalance: newBalance.toString(),
      newBalanceFormatted: formatBalance(newBalance),
      transaction: {
        txHash,
        blockNumber: block
      }
    });
    
  } catch (error) {
    console.error('Mint error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get wallet balance
 */
app.get('/api/balance/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    
    if (!isValidAddress(wallet)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet address'
      });
    }
    
    const balance = getBalance(wallet);
    
    return res.json({
      success: true,
      simulated: true,
      wallet: wallet.toLowerCase(),
      balance: balance.toString(),
      balanceFormatted: formatBalance(balance),
      tokenSymbol: TOKEN_SYMBOL,
      tokenDecimals: TOKEN_DECIMALS
    });
    
  } catch (error) {
    console.error('Get balance error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get all wallet balances
 */
app.get('/api/balances', async (req, res) => {
  try {
    const allBalances = [];
    walletBalances.forEach((balance, wallet) => {
      allBalances.push({
        wallet,
        balance: balance.toString(),
        balanceFormatted: formatBalance(balance)
      });
    });
    
    return res.json({
      success: true,
      simulated: true,
      count: allBalances.length,
      tokenSymbol: TOKEN_SYMBOL,
      tokenDecimals: TOKEN_DECIMALS,
      balances: allBalances
    });
    
  } catch (error) {
    console.error('Get balances error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Create a new escrow deal
 */
app.post('/api/create-escrow', async (req, res) => {
  try {
    const { 
      price, 
      commission, 
      store_wallet, 
      consumer_wallet, 
      influencer_wallet 
    } = req.body;
    
    console.log('\n=== New Create Escrow Request ===');
    console.log('Received:', { price, commission, store_wallet, consumer_wallet, influencer_wallet });
    
    // Validate input
    if (!price || !commission || !store_wallet || !consumer_wallet || !influencer_wallet) {
      const error = {
        message: 'Missing required fields',
        required: ['price', 'commission', 'store_wallet', 'consumer_wallet', 'influencer_wallet'],
        received: Object.keys(req.body)
      };
      await logError({ endpoint: '/api/create-escrow', request: req.body, error });
      return res.status(400).json({ success: false, error });
    }
    
    // Validate addresses
    if (!isValidAddress(store_wallet) || !isValidAddress(consumer_wallet) || !isValidAddress(influencer_wallet)) {
      const error = {
        message: 'Invalid wallet addresses. Must be valid Ethereum addresses (0x followed by 40 hex characters)',
        addresses: { store_wallet, consumer_wallet, influencer_wallet }
      };
      await logError({ endpoint: '/api/create-escrow', request: req.body, error });
      return res.status(400).json({ success: false, error });
    }
    
    // Validate amounts
    const priceNum = BigInt(price);
    const commissionNum = BigInt(commission);
    if (priceNum <= 0n || commissionNum <= 0n) {
      const error = { message: 'Price and commission must be greater than 0' };
      await logError({ endpoint: '/api/create-escrow', request: req.body, error });
      return res.status(400).json({ success: false, error });
    }
    
    // Run Kairo analysis (optional, continues on failure)
    console.log('Step 1: Running Kairo analysis...');
    const kairoResult = await runKairoAnalysis();
    console.log('Kairo decision:', kairoResult.decision);
    
    // Block if Kairo says BLOCK or ESCALATE
    if (kairoResult.decision === 'BLOCK' || kairoResult.decision === 'ESCALATE') {
      const error = {
        message: 'Kairo security check failed - contract is not safe to deploy',
        kairoDecision: kairoResult.decision,
        findings: kairoResult.findings || []
      };
      await logError({ endpoint: '/api/create-escrow', request: req.body, kairoAnalysis: kairoResult, error });
      return res.status(400).json({ success: false, error, kairoResult: { decision: kairoResult.decision, findings: kairoResult.findings || [] } });
    }
    
    // Create the deal
    console.log('Step 2: Creating deal in simulation...');
    const dealId = generateDealId();
    const txHash = generateTxHash();
    const block = getNextBlock();
    const gasUsed = generateGasUsed();
    
    const deal = {
      dealId,
      consumer: consumer_wallet.toLowerCase(),
      store: store_wallet.toLowerCase(),
      influencer: influencer_wallet.toLowerCase(),
      price: price.toString(),
      commission: commission.toString(),
      status: Status.CREATED,
      consumerFunded: false,
      storeFunded: false,
      createdAt: new Date().toISOString(),
      createdTxHash: txHash,
      createdBlock: block
    };
    
    deals.set(dealId, deal);
    
    // Initialize escrow holdings for this deal
    escrowHoldings.set(dealId, { consumerAmount: 0n, storeAmount: 0n });
    
    console.log('✅ Deal created successfully!');
    console.log('Deal ID:', dealId);
    
    // Get current balances for info
    const consumerBalance = getBalance(consumer_wallet);
    const storeBalance = getBalance(store_wallet);
    
    return res.json({
      success: true,
      message: 'Escrow created successfully (simulation)',
      simulated: true,
      kairoAnalysis: {
        decision: kairoResult.decision,
        status: kairoResult.success ? 'PASSED' : 'WARN',
        errorType: kairoResult.errorType || null,
        findings: kairoResult.findings || [],
        available: kairoResult.success
      },
      contract: {
        address: 'SIMULATED',
        dealId: dealId,
        transactionHash: txHash,
        blockNumber: block,
        gasUsed: gasUsed
      },
      escrowDetails: {
        price: price.toString(),
        priceFormatted: formatBalance(BigInt(price)),
        commission: commission.toString(),
        commissionFormatted: formatBalance(BigInt(commission)),
        consumer_wallet,
        store_wallet,
        influencer_wallet
      },
      walletBalances: {
        consumer: { address: consumer_wallet, balance: consumerBalance.toString(), balanceFormatted: formatBalance(consumerBalance) },
        store: { address: store_wallet, balance: storeBalance.toString(), balanceFormatted: formatBalance(storeBalance) }
      },
      nextSteps: {
        mintTokens: `POST /api/mint with {"wallet": "${consumer_wallet}", "amount": "${price}"} to give consumer funds`,
        consumerFund: `POST /api/fund-consumer with {"dealId": "${dealId}", "consumer_wallet": "${consumer_wallet}"}`,
        storeFund: `POST /api/fund-store with {"dealId": "${dealId}", "store_wallet": "${store_wallet}"}`,
        checkStatus: `GET /api/deal-status/${dealId}`
      }
    });
    
  } catch (error) {
    console.error('Unexpected error:', error);
    await logError({ endpoint: '/api/create-escrow', request: req.body, unexpectedError: { message: error.message, stack: error.stack } });
    return res.status(500).json({ success: false, error: { message: 'Internal server error', details: error.message } });
  }
});

/**
 * Fund consumer (consumer pays price to store)
 */
app.post('/api/fund-consumer', async (req, res) => {
  try {
    const { dealId, consumer_wallet } = req.body;
    
    console.log('\n=== Fund Consumer Request ===');
    console.log('Received:', { dealId, consumer_wallet });
    
    if (!dealId || !consumer_wallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: dealId, consumer_wallet'
      });
    }
    
    if (!isValidAddress(consumer_wallet)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid consumer_wallet address'
      });
    }
    
    // Get the deal
    const deal = deals.get(dealId);
    if (!deal) {
      return res.status(404).json({
        success: false,
        error: 'Deal not found. Make sure the dealId is correct.'
      });
    }
    
    // Verify the caller is the consumer
    if (deal.consumer !== consumer_wallet.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized. Only the consumer can fund this side of the deal.'
      });
    }
    
    // Check deal status
    if (deal.status === Status.RELEASED) {
      return res.status(400).json({
        success: false,
        error: 'Deal already released. Cannot fund.'
      });
    }
    
    if (deal.status === Status.REFUNDED) {
      return res.status(400).json({
        success: false,
        error: 'Deal was refunded. Cannot fund.'
      });
    }
    
    if (deal.consumerFunded) {
      return res.status(400).json({
        success: false,
        error: 'Consumer has already funded this deal.'
      });
    }
    
    // Check consumer has enough balance
    const priceAmount = BigInt(deal.price);
    const consumerBalance = getBalance(consumer_wallet);
    if (consumerBalance < priceAmount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient balance. Consumer does not have enough tokens.',
        required: deal.price,
        requiredFormatted: formatBalance(priceAmount),
        available: consumerBalance.toString(),
        availableFormatted: formatBalance(consumerBalance),
        shortfall: (priceAmount - consumerBalance).toString(),
        shortfallFormatted: formatBalance(priceAmount - consumerBalance),
        hint: `Use POST /api/mint to add tokens: {"wallet": "${consumer_wallet}", "amount": "${deal.price}"}`
      });
    }
    
    // Deduct from consumer balance and add to escrow
    subtractBalance(consumer_wallet, priceAmount);
    const escrow = escrowHoldings.get(dealId);
    escrow.consumerAmount = priceAmount;
    
    // Fund the consumer side
    const txHash = generateTxHash();
    const block = getNextBlock();
    const gasUsed = generateGasUsed();
    
    deal.consumerFunded = true;
    deal.consumerFundedTxHash = txHash;
    deal.consumerFundedBlock = block;
    
    // Check if both sides are now funded
    let fulfilled = false;
    if (deal.storeFunded) {
      // Both funded - release!
      deal.status = Status.RELEASED;
      deal.releasedAt = new Date().toISOString();
      fulfilled = true;
      
      // Transfer funds from escrow to recipients
      // Consumer's price goes to store
      addBalance(deal.store, escrow.consumerAmount);
      // Store's commission goes to influencer
      addBalance(deal.influencer, escrow.storeAmount);
      
      // Clear escrow
      escrow.consumerAmount = 0n;
      escrow.storeAmount = 0n;
      
      console.log('✅ Both sides funded - RELEASED!');
      console.log(`   Store received: ${formatBalance(BigInt(deal.price))} ${TOKEN_SYMBOL}`);
      console.log(`   Influencer received: ${formatBalance(BigInt(deal.commission))} ${TOKEN_SYMBOL}`);
    } else {
      deal.status = Status.CONSUMER_FUNDED;
      console.log('✅ Consumer funded. Waiting for store.');
    }
    
    // Get updated balances
    const newConsumerBalance = getBalance(consumer_wallet);
    const storeBalance = getBalance(deal.store);
    const influencerBalance = getBalance(deal.influencer);
    
    return res.json({
      success: true,
      message: fulfilled 
        ? 'Consumer funded and escrow fulfilled! Funds have been released.'
        : 'Consumer funded successfully. Waiting for store to fund.',
      simulated: true,
      confirmation: {
        consumerFunded: true,
        transactionHash: txHash,
        blockNumber: block,
        gasUsed: gasUsed,
        amountTransferred: deal.price,
        amountTransferredFormatted: formatBalance(BigInt(deal.price))
      },
      dealStatus: {
        status: StatusNames[deal.status],
        statusCode: deal.status,
        fulfilled: fulfilled,
        consumerFunded: deal.consumerFunded,
        storeFunded: deal.storeFunded
      },
      balances: {
        consumer: { address: deal.consumer, balance: newConsumerBalance.toString(), balanceFormatted: formatBalance(newConsumerBalance) },
        store: { address: deal.store, balance: storeBalance.toString(), balanceFormatted: formatBalance(storeBalance) },
        influencer: { address: deal.influencer, balance: influencerBalance.toString(), balanceFormatted: formatBalance(influencerBalance) }
      },
      escrowHolding: fulfilled ? null : {
        consumerAmount: escrow.consumerAmount.toString(),
        consumerAmountFormatted: formatBalance(escrow.consumerAmount),
        storeAmount: escrow.storeAmount.toString(),
        storeAmountFormatted: formatBalance(escrow.storeAmount)
      },
      payouts: fulfilled ? {
        store: { address: deal.store, amount: deal.price, amountFormatted: formatBalance(BigInt(deal.price)) },
        influencer: { address: deal.influencer, amount: deal.commission, amountFormatted: formatBalance(BigInt(deal.commission)) }
      } : null
    });
    
  } catch (error) {
    console.error('Fund consumer error:', error);
    await logError({ endpoint: '/api/fund-consumer', request: req.body, error: { message: error.message, stack: error.stack } });
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Fund store (store pays commission to influencer)
 */
app.post('/api/fund-store', async (req, res) => {
  try {
    const { dealId, store_wallet } = req.body;
    
    console.log('\n=== Fund Store Request ===');
    console.log('Received:', { dealId, store_wallet });
    
    if (!dealId || !store_wallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: dealId, store_wallet'
      });
    }
    
    if (!isValidAddress(store_wallet)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid store_wallet address'
      });
    }
    
    // Get the deal
    const deal = deals.get(dealId);
    if (!deal) {
      return res.status(404).json({
        success: false,
        error: 'Deal not found. Make sure the dealId is correct.'
      });
    }
    
    // Verify the caller is the store
    if (deal.store !== store_wallet.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized. Only the store can fund this side of the deal.'
      });
    }
    
    // Check deal status
    if (deal.status === Status.RELEASED) {
      return res.status(400).json({
        success: false,
        error: 'Deal already released. Cannot fund.'
      });
    }
    
    if (deal.status === Status.REFUNDED) {
      return res.status(400).json({
        success: false,
        error: 'Deal was refunded. Cannot fund.'
      });
    }
    
    if (deal.storeFunded) {
      return res.status(400).json({
        success: false,
        error: 'Store has already funded this deal.'
      });
    }
    
    // Check store has enough balance for commission
    const commissionAmount = BigInt(deal.commission);
    const storeBalance = getBalance(store_wallet);
    if (storeBalance < commissionAmount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient balance. Store does not have enough tokens for commission.',
        required: deal.commission,
        requiredFormatted: formatBalance(commissionAmount),
        available: storeBalance.toString(),
        availableFormatted: formatBalance(storeBalance),
        shortfall: (commissionAmount - storeBalance).toString(),
        shortfallFormatted: formatBalance(commissionAmount - storeBalance),
        hint: `Use POST /api/mint to add tokens: {"wallet": "${store_wallet}", "amount": "${deal.commission}"}`
      });
    }
    
    // Deduct from store balance and add to escrow
    subtractBalance(store_wallet, commissionAmount);
    const escrow = escrowHoldings.get(dealId);
    escrow.storeAmount = commissionAmount;
    
    // Fund the store side
    const txHash = generateTxHash();
    const block = getNextBlock();
    const gasUsed = generateGasUsed();
    
    deal.storeFunded = true;
    deal.storeFundedTxHash = txHash;
    deal.storeFundedBlock = block;
    
    // Check if both sides are now funded
    let fulfilled = false;
    if (deal.consumerFunded) {
      // Both funded - release!
      deal.status = Status.RELEASED;
      deal.releasedAt = new Date().toISOString();
      fulfilled = true;
      
      // Transfer funds from escrow to recipients
      // Consumer's price goes to store
      addBalance(deal.store, escrow.consumerAmount);
      // Store's commission goes to influencer
      addBalance(deal.influencer, escrow.storeAmount);
      
      // Clear escrow
      escrow.consumerAmount = 0n;
      escrow.storeAmount = 0n;
      
      console.log('✅ Both sides funded - RELEASED!');
      console.log(`   Store received: ${formatBalance(BigInt(deal.price))} ${TOKEN_SYMBOL}`);
      console.log(`   Influencer received: ${formatBalance(BigInt(deal.commission))} ${TOKEN_SYMBOL}`);
    } else {
      deal.status = Status.STORE_FUNDED;
      console.log('✅ Store funded. Waiting for consumer.');
    }
    
    // Get updated balances
    const consumerBalance = getBalance(deal.consumer);
    const newStoreBalance = getBalance(deal.store);
    const influencerBalance = getBalance(deal.influencer);
    
    return res.json({
      success: true,
      message: fulfilled 
        ? 'Store funded and escrow fulfilled! Funds have been released.'
        : 'Store funded successfully. Waiting for consumer to fund.',
      simulated: true,
      confirmation: {
        storeFunded: true,
        transactionHash: txHash,
        blockNumber: block,
        gasUsed: gasUsed,
        amountTransferred: deal.commission,
        amountTransferredFormatted: formatBalance(BigInt(deal.commission))
      },
      dealStatus: {
        status: StatusNames[deal.status],
        statusCode: deal.status,
        fulfilled: fulfilled,
        consumerFunded: deal.consumerFunded,
        storeFunded: deal.storeFunded
      },
      balances: {
        consumer: { address: deal.consumer, balance: consumerBalance.toString(), balanceFormatted: formatBalance(consumerBalance) },
        store: { address: deal.store, balance: newStoreBalance.toString(), balanceFormatted: formatBalance(newStoreBalance) },
        influencer: { address: deal.influencer, balance: influencerBalance.toString(), balanceFormatted: formatBalance(influencerBalance) }
      },
      escrowHolding: fulfilled ? null : {
        consumerAmount: escrow.consumerAmount.toString(),
        consumerAmountFormatted: formatBalance(escrow.consumerAmount),
        storeAmount: escrow.storeAmount.toString(),
        storeAmountFormatted: formatBalance(escrow.storeAmount)
      },
      payouts: fulfilled ? {
        store: { address: deal.store, amount: deal.price, amountFormatted: formatBalance(BigInt(deal.price)) },
        influencer: { address: deal.influencer, amount: deal.commission, amountFormatted: formatBalance(BigInt(deal.commission)) }
      } : null
    });
    
  } catch (error) {
    console.error('Fund store error:', error);
    await logError({ endpoint: '/api/fund-store', request: req.body, error: { message: error.message, stack: error.stack } });
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get deal status
 */
app.get('/api/deal-status/:dealId', async (req, res) => {
  try {
    const { dealId } = req.params;
    
    console.log('\n=== Get Deal Status ===');
    console.log('Deal ID:', dealId);
    
    const deal = deals.get(dealId);
    if (!deal) {
      return res.status(404).json({
        success: false,
        error: 'Deal not found. Make sure the dealId is correct.'
      });
    }
    
    const fulfilled = deal.status === Status.RELEASED;
    const escrow = escrowHoldings.get(dealId);
    
    // Get current balances
    const consumerBalance = getBalance(deal.consumer);
    const storeBalance = getBalance(deal.store);
    const influencerBalance = getBalance(deal.influencer);
    
    return res.json({
      success: true,
      simulated: true,
      dealId: dealId,
      deal: {
        consumer: deal.consumer,
        store: deal.store,
        influencer: deal.influencer,
        price: deal.price,
        priceFormatted: formatBalance(BigInt(deal.price)),
        commission: deal.commission,
        commissionFormatted: formatBalance(BigInt(deal.commission))
      },
      status: {
        status: StatusNames[deal.status],
        statusCode: deal.status,
        fulfilled: fulfilled,
        consumerFunded: deal.consumerFunded,
        storeFunded: deal.storeFunded,
        released: fulfilled
      },
      balances: {
        consumer: { address: deal.consumer, balance: consumerBalance.toString(), balanceFormatted: formatBalance(consumerBalance) },
        store: { address: deal.store, balance: storeBalance.toString(), balanceFormatted: formatBalance(storeBalance) },
        influencer: { address: deal.influencer, balance: influencerBalance.toString(), balanceFormatted: formatBalance(influencerBalance) }
      },
      escrowHolding: escrow ? {
        consumerAmount: escrow.consumerAmount.toString(),
        consumerAmountFormatted: formatBalance(escrow.consumerAmount),
        storeAmount: escrow.storeAmount.toString(),
        storeAmountFormatted: formatBalance(escrow.storeAmount)
      } : null,
      timestamps: {
        createdAt: deal.createdAt,
        releasedAt: deal.releasedAt || null
      },
      transactions: {
        created: { txHash: deal.createdTxHash, block: deal.createdBlock },
        consumerFunded: deal.consumerFunded ? { txHash: deal.consumerFundedTxHash, block: deal.consumerFundedBlock } : null,
        storeFunded: deal.storeFunded ? { txHash: deal.storeFundedTxHash, block: deal.storeFundedBlock } : null
      },
      payouts: fulfilled ? {
        store: { address: deal.store, amount: deal.price, amountFormatted: formatBalance(BigInt(deal.price)) },
        influencer: { address: deal.influencer, amount: deal.commission, amountFormatted: formatBalance(BigInt(deal.commission)) }
      } : null
    });
    
  } catch (error) {
    console.error('Get deal status error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get contract/simulation info
 */
app.get('/api/contract-info', async (req, res) => {
  res.json({
    mode: 'simulation',
    description: 'In-memory escrow simulation with balance tracking. Deals and balances persist until server restart.',
    dealsCount: deals.size,
    walletsCount: walletBalances.size,
    currentBlock: blockNumber,
    tokenSymbol: TOKEN_SYMBOL,
    tokenDecimals: TOKEN_DECIMALS,
    statusEnum: StatusNames
  });
});

/**
 * List all deals (for debugging)
 */
app.get('/api/deals', async (req, res) => {
  const allDeals = Array.from(deals.values()).map(deal => ({
    dealId: deal.dealId,
    status: StatusNames[deal.status],
    consumer: deal.consumer,
    store: deal.store,
    influencer: deal.influencer,
    price: deal.price,
    priceFormatted: formatBalance(BigInt(deal.price)),
    commission: deal.commission,
    commissionFormatted: formatBalance(BigInt(deal.commission)),
    consumerFunded: deal.consumerFunded,
    storeFunded: deal.storeFunded,
    createdAt: deal.createdAt
  }));
  
  res.json({
    success: true,
    count: allDeals.length,
    deals: allDeals
  });
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`\n📝 Mode: IN-MEMORY SIMULATION WITH BALANCE TRACKING`);
  console.log(`   Token: ${TOKEN_SYMBOL} (${TOKEN_DECIMALS} decimals)`);
  console.log(`   Deals and balances are stored in memory and will reset on server restart.\n`);
  console.log(`📝 Endpoints:`);
  console.log(`   POST /api/mint             - Mint tokens to a wallet`);
  console.log(`   GET  /api/balance/:wallet  - Get wallet balance`);
  console.log(`   GET  /api/balances         - Get all wallet balances`);
  console.log(`   POST /api/create-escrow    - Create new escrow deal`);
  console.log(`   POST /api/fund-consumer    - Consumer pays price (consumer → store)`);
  console.log(`   POST /api/fund-store       - Store pays commission (store → influencer)`);
  console.log(`   GET  /api/deal-status/:id  - Check deal status and fulfillment`);
  console.log(`   GET  /api/deals            - List all deals (debug)`);
  console.log(`   GET  /api/contract-info    - Get simulation info`);
  console.log(`   GET  /health               - Health check`);
});
