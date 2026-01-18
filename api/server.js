const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { ethers } = require('ethers');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// CORS middleware - allow requests from Chrome extensions and web browsers
app.use((req, res, next) => {
  // Allow all origins (for Chrome extensions, they have chrome-extension:// origins)
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Load environment variables
require('dotenv').config();

// =============================================================================
// MODE DETECTION - BLOCKCHAIN OR SIMULATION
// =============================================================================

const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
const USDC_ADDRESS = process.env.USDC_ADDRESS;
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const USE_BLOCKCHAIN = !!(ESCROW_ADDRESS && RPC_URL && PRIVATE_KEY);
const MODE = USE_BLOCKCHAIN ? 'blockchain' : 'simulation';

console.log(`\n🔧 Mode: ${MODE.toUpperCase()}`);
if (USE_BLOCKCHAIN) {
  console.log(`   Escrow Contract: ${ESCROW_ADDRESS}`);
  console.log(`   USDC Contract: ${USDC_ADDRESS || 'Not set'}`);
  console.log(`   RPC URL: ${RPC_URL?.substring(0, 40)}...`);
} else {
  console.log(`   Set ESCROW_ADDRESS, RPC_URL, and PRIVATE_KEY for blockchain mode`);
}

// =============================================================================
// BLOCKCHAIN SETUP (only if USE_BLOCKCHAIN)
// =============================================================================

let provider = null;
let wallet = null;
let escrowContract = null;
let usdcContract = null;

// Load contract ABIs
async function loadContractABIs() {
  const escrowArtifact = JSON.parse(
    await fs.readFile(path.join(__dirname, '../artifacts/contracts/CreatorCheckoutEscrow.sol/CreatorCheckoutEscrow.json'), 'utf-8')
  );
  const usdcArtifact = JSON.parse(
    await fs.readFile(path.join(__dirname, '../artifacts/contracts/MockUSDC.sol/MockUSDC.json'), 'utf-8')
  );
  return { escrowABI: escrowArtifact.abi, usdcABI: usdcArtifact.abi };
}

async function initBlockchain() {
  if (!USE_BLOCKCHAIN) return;
  
  try {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    const { escrowABI, usdcABI } = await loadContractABIs();
    
    escrowContract = new ethers.Contract(ESCROW_ADDRESS, escrowABI, wallet);
    if (USDC_ADDRESS) {
      usdcContract = new ethers.Contract(USDC_ADDRESS, usdcABI, wallet);
    }
    
    console.log(`✅ Blockchain initialized`);
    console.log(`   Wallet: ${wallet.address}`);
    
    const balance = await provider.getBalance(wallet.address);
    console.log(`   ETH Balance: ${ethers.formatEther(balance)} ETH`);
  } catch (error) {
    console.error('❌ Failed to initialize blockchain:', error.message);
  }
}

// =============================================================================
// SIMULATION STORAGE (only if NOT USE_BLOCKCHAIN)
// =============================================================================

const Status = {
  NONE: 0,
  CREATED: 1,
  CONSUMER_FUNDED: 2,
  STORE_FUNDED: 3,
  RELEASED: 4,
  REFUNDED: 5
};

const StatusNames = ['NONE', 'CREATED', 'CONSUMER_FUNDED', 'STORE_FUNDED', 'RELEASED', 'REFUNDED'];

// In-memory storage
const deals = new Map();
const walletBalances = new Map();
const escrowHoldings = new Map();
let blockNumber = 1000000;

// Token config
const TOKEN_DECIMALS = 6;
const TOKEN_SYMBOL = 'USDC';
const DEFAULT_CONSUMER_BALANCE = 100000000n; // 100 USDC
const DEFAULT_STORE_BALANCE = 50000000n;     // 50 USDC

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateDealId() {
  return '0x' + crypto.randomBytes(32).toString('hex');
}

function generateTxHash() {
  return '0x' + crypto.randomBytes(32).toString('hex');
}

function generateGasUsed() {
  return (Math.floor(Math.random() * 100000) + 50000).toString();
}

function getNextBlock() {
  return ++blockNumber;
}

function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function getBalance(walletAddress) {
  const addr = walletAddress.toLowerCase();
  return walletBalances.get(addr) || 0n;
}

function setBalance(walletAddress, amount) {
  const addr = walletAddress.toLowerCase();
  walletBalances.set(addr, BigInt(amount));
}

function addBalance(walletAddress, amount) {
  const addr = walletAddress.toLowerCase();
  const current = getBalance(addr);
  walletBalances.set(addr, current + BigInt(amount));
}

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

function formatBalance(amount) {
  const amountStr = amount.toString().padStart(TOKEN_DECIMALS + 1, '0');
  const intPart = amountStr.slice(0, -TOKEN_DECIMALS) || '0';
  const decPart = amountStr.slice(-TOKEN_DECIMALS);
  return `${intPart}.${decPart}`;
}

function initializeWalletIfNeeded(walletAddress, defaultBalance) {
  const addr = walletAddress.toLowerCase();
  if (!walletBalances.has(addr)) {
    walletBalances.set(addr, defaultBalance);
    console.log(`💰 Initialized wallet ${addr} with ${formatBalance(defaultBalance)} ${TOKEN_SYMBOL}`);
    return true;
  }
  return false;
}

// =============================================================================
// KAIRO SECURITY ANALYSIS
// =============================================================================

async function runKairoAnalysis() {
  try {
    const KAIRO_API_KEY = process.env.KAIRO_API_KEY;
    if (!KAIRO_API_KEY) {
      return { success: false, decision: 'WARN', error: 'KAIRO_API_KEY not set', errorType: 'not_configured' };
    }

    const contractPath = path.join(__dirname, '../contracts/CreatorCheckoutEscrow.sol');
    const contractContent = await fs.readFile(contractPath, 'utf-8');

    const https = require('https');
    const postData = JSON.stringify({
      source: { type: "inline", files: [{ path: "contracts/CreatorCheckoutEscrow.sol", content: contractContent }] },
      config: { severity_threshold: "high", include_suggestions: true }
    });

    const options = {
      hostname: 'kairoaisec.com', port: 443, path: '/api/v1/analyze', method: 'POST',
      headers: { 'Authorization': `Bearer ${KAIRO_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };

    const response = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`Parse error: ${e.message}`)); }
          } else { reject(new Error(`Kairo API status ${res.statusCode}: ${data}`)); }
        });
      });
      req.on('error', (e) => reject(new Error(`Kairo request failed: ${e.message}`)));
      req.write(postData);
      req.end();
    });

    return { success: true, decision: response.decision || 'UNKNOWN', response, findings: response.findings || [] };
  } catch (error) {
    return { success: false, decision: 'WARN', error: error.message, errorType: error.message.includes('403') ? 'rate_limited' : 'api_error' };
  }
}

// =============================================================================
// ERROR LOGGING
// =============================================================================

async function logError(errorData) {
  const errorLog = { timestamp: new Date().toISOString(), ...errorData };
  const errorFile = path.join(__dirname, '../errors');
  try {
    await fs.appendFile(errorFile, JSON.stringify(errorLog, null, 2) + '\n\n---\n\n');
  } catch (err) {
    console.error('Failed to log error:', err);
  }
}

// =============================================================================
// API ENDPOINTS
// =============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Creator Escrow API',
    mode: MODE,
    blockchain: USE_BLOCKCHAIN ? {
      escrowAddress: ESCROW_ADDRESS,
      usdcAddress: USDC_ADDRESS,
      network: 'sepolia'
    } : null,
    simulation: !USE_BLOCKCHAIN ? {
      dealsCount: deals.size,
      walletsCount: walletBalances.size
    } : null,
    tokenSymbol: TOKEN_SYMBOL,
    tokenDecimals: TOKEN_DECIMALS
  });
});

/**
 * Mint tokens (simulation only, or calls MockUSDC.mint for blockchain)
 */
app.post('/api/mint', async (req, res) => {
  try {
    const { wallet, amount } = req.body;
    
    if (!wallet || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields: wallet, amount' });
    }
    if (!isValidAddress(wallet)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address' });
    }

    if (USE_BLOCKCHAIN) {
      // Real blockchain mint
      if (!usdcContract) {
        return res.status(400).json({ success: false, error: 'USDC_ADDRESS not configured for minting' });
      }
      
      const tx = await usdcContract.mint(wallet, amount);
      const receipt = await tx.wait();
      
      return res.json({
        success: true,
        message: `Minted ${formatBalance(BigInt(amount))} ${TOKEN_SYMBOL} to wallet on blockchain`,
        blockchain: true,
        wallet: wallet.toLowerCase(),
        amount: amount.toString(),
        amountFormatted: formatBalance(BigInt(amount)),
        transaction: {
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString()
        },
        explorerUrl: `https://sepolia.etherscan.io/tx/${receipt.hash}`
      });
    } else {
      // Simulation mint
      const amountBigInt = BigInt(amount);
      const previousBalance = getBalance(wallet);
      addBalance(wallet, amountBigInt);
      const newBalance = getBalance(wallet);
      
      return res.json({
        success: true,
        message: `Minted ${formatBalance(amountBigInt)} ${TOKEN_SYMBOL} to wallet`,
        simulated: true,
        wallet: wallet.toLowerCase(),
        amount: amount.toString(),
        amountFormatted: formatBalance(amountBigInt),
        previousBalance: previousBalance.toString(),
        newBalance: newBalance.toString(),
        transaction: { txHash: generateTxHash(), blockNumber: getNextBlock() }
      });
    }
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
      return res.status(400).json({ success: false, error: 'Invalid wallet address' });
    }

    if (USE_BLOCKCHAIN && usdcContract) {
      const balance = await usdcContract.balanceOf(wallet);
      return res.json({
        success: true,
        blockchain: true,
        wallet: wallet.toLowerCase(),
        balance: balance.toString(),
        balanceFormatted: formatBalance(balance),
        tokenSymbol: TOKEN_SYMBOL
      });
    } else {
      const balance = getBalance(wallet);
      return res.json({
        success: true,
        simulated: true,
        wallet: wallet.toLowerCase(),
        balance: balance.toString(),
        balanceFormatted: formatBalance(balance),
        tokenSymbol: TOKEN_SYMBOL
      });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get all wallet balances (simulation only)
 */
app.get('/api/balances', async (req, res) => {
  if (USE_BLOCKCHAIN) {
    return res.json({
      success: true,
      blockchain: true,
      message: 'Use /api/balance/:wallet to check individual balances on blockchain'
    });
  }
  
  const allBalances = [];
  walletBalances.forEach((balance, wallet) => {
    allBalances.push({ wallet, balance: balance.toString(), balanceFormatted: formatBalance(balance) });
  });
  
  res.json({ success: true, simulated: true, count: allBalances.length, balances: allBalances });
});

/**
 * Create a new escrow deal
 */
app.post('/api/create-escrow', async (req, res) => {
  try {
    const { price, commission, store_wallet, consumer_wallet, influencer_wallet } = req.body;
    
    console.log('\n=== New Create Escrow Request ===');
    console.log('Mode:', MODE);
    console.log('Received:', { price, commission, store_wallet, consumer_wallet, influencer_wallet });

    // Validate input
    if (!price || !commission || !store_wallet || !consumer_wallet || !influencer_wallet) {
      return res.status(400).json({ success: false, error: { message: 'Missing required fields', required: ['price', 'commission', 'store_wallet', 'consumer_wallet', 'influencer_wallet'] } });
    }
    if (!isValidAddress(store_wallet) || !isValidAddress(consumer_wallet) || !isValidAddress(influencer_wallet)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid wallet addresses' } });
    }

    // Run Kairo analysis
    console.log('Running Kairo analysis...');
    const kairoResult = await runKairoAnalysis();
    console.log('Kairo decision:', kairoResult.decision);
    
    if (kairoResult.decision === 'BLOCK' || kairoResult.decision === 'ESCALATE') {
      return res.status(400).json({ success: false, error: { message: 'Kairo security check failed', kairoDecision: kairoResult.decision } });
    }

    if (USE_BLOCKCHAIN) {
      // ===== REAL BLOCKCHAIN =====
      console.log('Creating deal on blockchain...');
      
      const tx = await escrowContract.createDeal(
        consumer_wallet,
        store_wallet,
        influencer_wallet,
        price,
        commission
      );
      
      const receipt = await tx.wait();
      
      // Parse dealId from event
      let dealId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = escrowContract.interface.parseLog(log);
          if (parsed && parsed.name === 'DealCreated') {
            dealId = parsed.args[0];
            break;
          }
        } catch (e) { /* skip */ }
      }
      
      console.log('✅ Deal created on blockchain!');
      console.log('   Deal ID:', dealId);
      console.log('   TX Hash:', receipt.hash);
      
      return res.json({
        success: true,
        message: 'Escrow created successfully on blockchain',
        blockchain: true,
        kairoAnalysis: { decision: kairoResult.decision, available: kairoResult.success },
        contract: {
          address: ESCROW_ADDRESS,
          dealId: dealId,
          transactionHash: receipt.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString()
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
        explorerUrl: `https://sepolia.etherscan.io/tx/${receipt.hash}`,
        nextSteps: {
          note: 'For blockchain mode, users must approve and call fundConsumer/fundStore directly on the contract',
          consumerApprove: `Consumer must approve ${ESCROW_ADDRESS} to spend ${price} USDC`,
          storApprove: `Store must approve ${ESCROW_ADDRESS} to spend ${commission} USDC`,
          viewOnEtherscan: `https://sepolia.etherscan.io/address/${ESCROW_ADDRESS}`
        }
      });
      
    } else {
      // ===== SIMULATION =====
      console.log('Creating deal in simulation...');
      
      initializeWalletIfNeeded(consumer_wallet, DEFAULT_CONSUMER_BALANCE);
      initializeWalletIfNeeded(store_wallet, DEFAULT_STORE_BALANCE);
      initializeWalletIfNeeded(influencer_wallet, 0n);
      
      const dealId = generateDealId();
      const txHash = generateTxHash();
      const block = getNextBlock();
      
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
      escrowHoldings.set(dealId, { consumerAmount: 0n, storeAmount: 0n });
      
      console.log('✅ Deal created in simulation!');
      
      const consumerBalance = getBalance(consumer_wallet);
      const storeBalance = getBalance(store_wallet);
      
      return res.json({
        success: true,
        message: 'Escrow created successfully (simulation)',
        simulated: true,
        kairoAnalysis: { decision: kairoResult.decision, available: kairoResult.success },
        contract: { address: 'SIMULATED', dealId, transactionHash: txHash, blockNumber: block, gasUsed: generateGasUsed() },
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
          consumerFund: `POST /api/fund-consumer with {"dealId": "${dealId}", "consumer_wallet": "${consumer_wallet}"}`,
          storeFund: `POST /api/fund-store with {"dealId": "${dealId}", "store_wallet": "${store_wallet}"}`,
          checkStatus: `GET /api/deal-status/${dealId}`
        }
      });
    }
  } catch (error) {
    console.error('Create escrow error:', error);
    await logError({ endpoint: '/api/create-escrow', request: req.body, error: { message: error.message, stack: error.stack } });
    return res.status(500).json({ success: false, error: { message: 'Internal server error', details: error.message } });
  }
});

/**
 * Fund consumer (simulation mode only - blockchain requires direct contract interaction)
 */
app.post('/api/fund-consumer', async (req, res) => {
  try {
    const { dealId, consumer_wallet } = req.body;
    
    if (!dealId || !consumer_wallet) {
      return res.status(400).json({ success: false, error: 'Missing required fields: dealId, consumer_wallet' });
    }

    if (USE_BLOCKCHAIN) {
      return res.status(400).json({
        success: false,
        error: 'Blockchain mode requires direct contract interaction',
        instructions: {
          step1: `Consumer must approve USDC spending: usdcContract.approve("${ESCROW_ADDRESS}", amount)`,
          step2: `Consumer must call: escrowContract.fundConsumer("${dealId}")`,
          contractAddress: ESCROW_ADDRESS,
          explorerUrl: `https://sepolia.etherscan.io/address/${ESCROW_ADDRESS}#writeContract`
        }
      });
    }

    // Simulation mode
    const deal = deals.get(dealId);
    if (!deal) {
      return res.status(404).json({ success: false, error: 'Deal not found' });
    }
    if (deal.consumer !== consumer_wallet.toLowerCase()) {
      return res.status(403).json({ success: false, error: 'Unauthorized. Only the consumer can fund.' });
    }
    if (deal.consumerFunded) {
      return res.status(400).json({ success: false, error: 'Consumer already funded' });
    }
    if (deal.status === Status.RELEASED) {
      return res.status(400).json({ success: false, error: 'Deal already released' });
    }

    const priceAmount = BigInt(deal.price);
    const consumerBalance = getBalance(consumer_wallet);
    if (consumerBalance < priceAmount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient balance',
        required: deal.price,
        available: consumerBalance.toString(),
        hint: `POST /api/mint with {"wallet": "${consumer_wallet}", "amount": "${deal.price}"}`
      });
    }

    subtractBalance(consumer_wallet, priceAmount);
    const escrow = escrowHoldings.get(dealId);
    escrow.consumerAmount = priceAmount;
    deal.consumerFunded = true;
    deal.consumerFundedTxHash = generateTxHash();
    deal.consumerFundedBlock = getNextBlock();

    let fulfilled = false;
    if (deal.storeFunded) {
      deal.status = Status.RELEASED;
      deal.releasedAt = new Date().toISOString();
      fulfilled = true;
      addBalance(deal.store, escrow.consumerAmount);
      addBalance(deal.influencer, escrow.storeAmount);
      escrow.consumerAmount = 0n;
      escrow.storeAmount = 0n;
    } else {
      deal.status = Status.CONSUMER_FUNDED;
    }

    return res.json({
      success: true,
      message: fulfilled ? 'Consumer funded and escrow released!' : 'Consumer funded. Waiting for store.',
      simulated: true,
      dealStatus: { status: StatusNames[deal.status], fulfilled, consumerFunded: true, storeFunded: deal.storeFunded },
      balances: {
        consumer: { balance: getBalance(consumer_wallet).toString() },
        store: { balance: getBalance(deal.store).toString() },
        influencer: { balance: getBalance(deal.influencer).toString() }
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Fund store (simulation mode only)
 */
app.post('/api/fund-store', async (req, res) => {
  try {
    const { dealId, store_wallet } = req.body;
    
    if (!dealId || !store_wallet) {
      return res.status(400).json({ success: false, error: 'Missing required fields: dealId, store_wallet' });
    }

    if (USE_BLOCKCHAIN) {
      return res.status(400).json({
        success: false,
        error: 'Blockchain mode requires direct contract interaction',
        instructions: {
          step1: `Store must approve USDC spending: usdcContract.approve("${ESCROW_ADDRESS}", amount)`,
          step2: `Store must call: escrowContract.fundStore("${dealId}")`,
          contractAddress: ESCROW_ADDRESS
        }
      });
    }

    const deal = deals.get(dealId);
    if (!deal) {
      return res.status(404).json({ success: false, error: 'Deal not found' });
    }
    if (deal.store !== store_wallet.toLowerCase()) {
      return res.status(403).json({ success: false, error: 'Unauthorized. Only the store can fund.' });
    }
    if (deal.storeFunded) {
      return res.status(400).json({ success: false, error: 'Store already funded' });
    }
    if (deal.status === Status.RELEASED) {
      return res.status(400).json({ success: false, error: 'Deal already released' });
    }

    const commissionAmount = BigInt(deal.commission);
    const storeBalance = getBalance(store_wallet);
    if (storeBalance < commissionAmount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient balance',
        required: deal.commission,
        available: storeBalance.toString()
      });
    }

    subtractBalance(store_wallet, commissionAmount);
    const escrow = escrowHoldings.get(dealId);
    escrow.storeAmount = commissionAmount;
    deal.storeFunded = true;
    deal.storeFundedTxHash = generateTxHash();
    deal.storeFundedBlock = getNextBlock();

    let fulfilled = false;
    if (deal.consumerFunded) {
      deal.status = Status.RELEASED;
      deal.releasedAt = new Date().toISOString();
      fulfilled = true;
      addBalance(deal.store, escrow.consumerAmount);
      addBalance(deal.influencer, escrow.storeAmount);
      escrow.consumerAmount = 0n;
      escrow.storeAmount = 0n;
    } else {
      deal.status = Status.STORE_FUNDED;
    }

    return res.json({
      success: true,
      message: fulfilled ? 'Store funded and escrow released!' : 'Store funded. Waiting for consumer.',
      simulated: true,
      dealStatus: { status: StatusNames[deal.status], fulfilled, consumerFunded: deal.consumerFunded, storeFunded: true },
      balances: {
        consumer: { balance: getBalance(deal.consumer).toString() },
        store: { balance: getBalance(deal.store).toString() },
        influencer: { balance: getBalance(deal.influencer).toString() }
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get deal status
 */
app.get('/api/deal-status/:dealId', async (req, res) => {
  try {
    const { dealId } = req.params;

    if (USE_BLOCKCHAIN) {
      // Query blockchain
      const dealInfo = await escrowContract.getDeal(dealId);
      const [consumer, store, influencer, price, commission, status] = dealInfo;
      
      return res.json({
        success: true,
        blockchain: true,
        dealId,
        deal: { consumer, store, influencer, price: price.toString(), commission: commission.toString() },
        status: { status: StatusNames[Number(status)], statusCode: Number(status), fulfilled: Number(status) === 4 },
        explorerUrl: `https://sepolia.etherscan.io/address/${ESCROW_ADDRESS}`
      });
    }

    // Simulation
    const deal = deals.get(dealId);
    if (!deal) {
      return res.status(404).json({ success: false, error: 'Deal not found' });
    }

    return res.json({
      success: true,
      simulated: true,
      dealId,
      deal: { consumer: deal.consumer, store: deal.store, influencer: deal.influencer, price: deal.price, commission: deal.commission },
      status: { status: StatusNames[deal.status], fulfilled: deal.status === Status.RELEASED, consumerFunded: deal.consumerFunded, storeFunded: deal.storeFunded },
      balances: {
        consumer: { balance: getBalance(deal.consumer).toString() },
        store: { balance: getBalance(deal.store).toString() },
        influencer: { balance: getBalance(deal.influencer).toString() }
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get contract info
 */
app.get('/api/contract-info', async (req, res) => {
  res.json({
    mode: MODE,
    blockchain: USE_BLOCKCHAIN ? { escrowAddress: ESCROW_ADDRESS, usdcAddress: USDC_ADDRESS, network: 'sepolia' } : null,
    simulation: !USE_BLOCKCHAIN ? { dealsCount: deals.size, walletsCount: walletBalances.size, currentBlock: blockNumber } : null,
    tokenSymbol: TOKEN_SYMBOL,
    tokenDecimals: TOKEN_DECIMALS
  });
});

/**
 * List all deals (simulation only)
 */
app.get('/api/deals', async (req, res) => {
  if (USE_BLOCKCHAIN) {
    return res.json({ success: true, blockchain: true, message: 'Query deals via Etherscan or contract events' });
  }
  
  const allDeals = Array.from(deals.values()).map(d => ({
    dealId: d.dealId,
    status: StatusNames[d.status],
    consumer: d.consumer,
    store: d.store,
    influencer: d.influencer,
    price: d.price,
    commission: d.commission,
    consumerFunded: d.consumerFunded,
    storeFunded: d.storeFunded
  }));
  
  res.json({ success: true, count: allDeals.length, deals: allDeals });
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, async () => {
  console.log(`\n🚀 API Server running on http://localhost:${PORT}`);
  console.log(`\n📝 Mode: ${MODE.toUpperCase()}`);
  
  if (USE_BLOCKCHAIN) {
    await initBlockchain();
    console.log(`\n📝 Blockchain Endpoints:`);
    console.log(`   POST /api/create-escrow - Creates deal on Sepolia blockchain`);
    console.log(`   POST /api/mint          - Mints MockUSDC to wallet`);
    console.log(`   GET  /api/balance/:addr - Gets USDC balance from blockchain`);
    console.log(`   GET  /api/deal-status/  - Queries deal from blockchain`);
  } else {
    console.log(`   Token: ${TOKEN_SYMBOL} (${TOKEN_DECIMALS} decimals)`);
    console.log(`   Default consumer balance: ${formatBalance(DEFAULT_CONSUMER_BALANCE)} USDC`);
    console.log(`   Default store balance: ${formatBalance(DEFAULT_STORE_BALANCE)} USDC`);
    console.log(`\n📝 Simulation Endpoints:`);
    console.log(`   POST /api/create-escrow  - Create new escrow deal`);
    console.log(`   POST /api/fund-consumer  - Consumer pays price`);
    console.log(`   POST /api/fund-store     - Store pays commission`);
    console.log(`   GET  /api/deal-status/   - Check deal status`);
    console.log(`   GET  /api/deals          - List all deals`);
  }
  
  console.log(`   GET  /health             - Health check`);
  console.log(`   GET  /api/contract-info  - Get mode/contract info`);
});
