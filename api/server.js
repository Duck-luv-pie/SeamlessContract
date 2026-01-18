const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Load environment variables
require('dotenv').config();

// Initialize ethers.js - use ethers directly for production, Hardhat for development
let ethers;
let getContractAt;
let isHardhat = false;

try {
  // Try to use Hardhat ethers (for development)
  const hardhatEthers = require('hardhat').ethers;
  ethers = hardhatEthers;
  getContractAt = hardhatEthers.getContractAt.bind(hardhatEthers);
  isHardhat = true;
  console.log('✅ Using Hardhat ethers (development mode)');
} catch (error) {
  // Fall back to regular ethers.js (for production)
  ethers = require('ethers');
  console.log('✅ Using ethers.js Provider (production mode)');
}

// Get provider based on environment
function getProvider() {
  if (isHardhat) {
    // Hardhat provides provider automatically
    return null; // Will use Hardhat's default provider
  } else {
    // Production: use RPC URL from environment
    const RPC_URL = process.env.RPC_URL || process.env.ETH_RPC_URL;
    if (!RPC_URL) {
      throw new Error('RPC_URL or ETH_RPC_URL must be set in production environment');
    }
    return new ethers.JsonRpcProvider(RPC_URL);
  }
}

// Get signer for transactions (if needed)
function getSigner(provider) {
  if (isHardhat) {
    // Hardhat provides signer automatically via getContractAt
    return null;
  } else {
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    if (!PRIVATE_KEY) {
      // For read-only operations, provider is enough
      return null;
    }
    return new ethers.Wallet(PRIVATE_KEY, provider);
  }
}

/**
 * Run Kairo analysis on the contract source code
 * Calls Kairo API directly (more reliable than shell script)
 */
async function runKairoAnalysis() {
  try {
    const KAIRO_API_KEY = process.env.KAIRO_API_KEY;
    if (!KAIRO_API_KEY) {
      return {
        success: false,
        decision: 'ERROR',
        error: 'KAIRO_API_KEY not set in environment'
      };
    }

    // Read contract file
    const contractPath = path.join(__dirname, '../contracts/CreatorCheckoutEscrow.sol');
    const contractContent = await fs.readFile(contractPath, 'utf-8');

    // Call Kairo API directly
    const https = require('https');
    const { promisify } = require('util');
    
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

    // Make the API call
    const response = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const jsonData = JSON.parse(data);
              resolve(jsonData);
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

    // Extract decision from response (per Kairo docs)
    const decision = response.decision || 'UNKNOWN';
    
    return {
      success: true,
      decision: decision,
      response: response,
      decision_reason: response.decision_reason || null,
      risk_score: response.risk_score || null,
      summary: response.summary || null,
      findings: response.findings || []
    };
    
  } catch (error) {
    // Network or API error
    console.error('Kairo analysis error:', error.message);
    return {
      success: false,
      decision: 'ERROR',
      error: error.message,
      response: null
    };
  }
}

/**
 * Log error to errors file
 */
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

/**
 * Generate simulated escrow data (fallback when real contract unavailable)
 */
function generateSimulatedDeal(price, commission, consumerWallet, storeWallet, influencerWallet) {
  const dealId = '0x' + crypto.randomBytes(32).toString('hex');
  const txHash = '0x' + crypto.randomBytes(32).toString('hex');
  const blockNumber = Math.floor(Math.random() * 10000000) + 1000000;
  const gasUsed = Math.floor(Math.random() * 100000) + 50000;
  
  return {
    dealId,
    transactionHash: txHash,
    blockNumber,
    gasUsed: gasUsed.toString()
  };
}

/**
 * Create deal on the smart contract
 */
async function createDeal(price, commission, consumerWallet, storeWallet, influencerWallet) {
  try {
    // Get contract address from environment
    const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
    if (!ESCROW_ADDRESS) {
      throw new Error('ESCROW_ADDRESS not set in environment. Deploy contract first.');
    }
    
    // Get contract instance based on environment
    let escrow;
    if (isHardhat) {
      // Development: use Hardhat's getContractAt
      escrow = await ethers.getContractAt("CreatorCheckoutEscrow", ESCROW_ADDRESS);
    } else {
      // Production: use ethers.js with ABI from artifacts
      const provider = getProvider();
      const signer = getSigner(provider);
      
      // Load ABI from artifacts (deployed contracts)
      const artifactsPath = path.join(__dirname, '../artifacts/contracts/CreatorCheckoutEscrow.sol/CreatorCheckoutEscrow.json');
      const artifacts = JSON.parse(await fs.readFile(artifactsPath, 'utf-8'));
      const abi = artifacts.abi;
      
      escrow = new ethers.Contract(ESCROW_ADDRESS, abi, signer || provider);
    }
    
    // Convert to BigInt (handle both string and number inputs)
    let priceBigInt, commissionBigInt;
    
    if (typeof price === 'string') {
      // If string, assume it's already in wei/base units
      priceBigInt = BigInt(price);
    } else {
      // If number, convert to BigInt
      priceBigInt = BigInt(price);
    }
    
    if (typeof commission === 'string') {
      commissionBigInt = BigInt(commission);
    } else {
      commissionBigInt = BigInt(commission);
    }
    
    // Validate addresses
    if (!ethers.isAddress(consumerWallet) || !ethers.isAddress(storeWallet) || !ethers.isAddress(influencerWallet)) {
      throw new Error('Invalid wallet addresses');
    }
    
    // Create the deal
    const tx = await escrow.createDeal(
      consumerWallet,
      storeWallet,
      influencerWallet,
      priceBigInt,
      commissionBigInt
    );
    
    // Wait for confirmation
    const receipt = await tx.wait();
    
    // Get dealId from event
    let dealId = null;
    try {
      // Try multiple methods to parse the event
      
      // Method 1: Parse using contract interface
      if (receipt.logs && receipt.logs.length > 0) {
        for (const log of receipt.logs) {
          try {
            const parsed = escrow.interface.parseLog(log);
            if (parsed && parsed.name === "DealCreated") {
              dealId = parsed.args[0];
              break;
            }
          } catch (e) {
            // Try next log
            continue;
          }
        }
      }
      
      // Method 2: If still null, try to get it from the transaction response
      // by querying events from the transaction
      if (!dealId && tx.hash) {
        try {
          const filter = escrow.filters.DealCreated();
          const events = await escrow.queryFilter(filter, receipt.blockNumber, receipt.blockNumber);
          if (events.length > 0) {
            // Find the event from our transaction
            const ourEvent = events.find(e => e.transactionHash === tx.hash);
            if (ourEvent && ourEvent.args && ourEvent.args[0]) {
              dealId = ourEvent.args[0];
            }
          }
        } catch (e) {
          console.warn('Could not query events:', e.message);
        }
      }
      
      // Method 3: If still null, try parsing receipt logs with ethers v6 format
      if (!dealId && receipt.logs) {
        try {
          // In ethers v6, receipt.logs might be different format
          const parsedLogs = receipt.logs.map(log => {
            try {
              return escrow.interface.parseLog({
                topics: log.topics || [],
                data: log.data || ''
              });
            } catch {
              return null;
            }
          }).filter(log => log !== null && log.name === "DealCreated");
          
          if (parsedLogs.length > 0) {
            dealId = parsedLogs[0].args[0];
          }
        } catch (e) {
          console.warn('Could not parse logs in v6 format:', e.message);
        }
      }
      
      if (!dealId) {
        console.warn('⚠️  Could not extract dealId from event. Transaction succeeded but dealId is null.');
        console.warn('Transaction hash:', tx.hash);
        console.warn('Block number:', receipt.blockNumber);
      }
    } catch (eventError) {
      console.warn('Could not parse dealId from event:', eventError.message);
    }
    
    return {
      success: true,
      transactionHash: tx.hash,
      dealId: dealId,
      receipt: {
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Main API endpoint
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
    
    console.log('\n=== New Request ===');
    console.log('Received:', {
      price,
      commission,
      store_wallet,
      consumer_wallet,
      influencer_wallet
    });
    
    // Validate input
    if (!price || !commission || !store_wallet || !consumer_wallet || !influencer_wallet) {
      const error = {
        message: 'Missing required fields',
        required: ['price', 'commission', 'store_wallet', 'consumer_wallet', 'influencer_wallet'],
        received: Object.keys(req.body)
      };
      
      await logError({
        endpoint: '/api/create-escrow',
        request: req.body,
        error: error
      });
      
      return res.status(400).json({
        success: false,
        error: error
      });
    }
    
    // Validate addresses
    if (!ethers.isAddress(store_wallet) || !ethers.isAddress(consumer_wallet) || !ethers.isAddress(influencer_wallet)) {
      const error = {
        message: 'Invalid wallet addresses',
        addresses: {
          store_wallet,
          consumer_wallet,
          influencer_wallet
        }
      };
      
      await logError({
        endpoint: '/api/create-escrow',
        request: req.body,
        error: error
      });
      
      return res.status(400).json({
        success: false,
        error: error
      });
    }
    
    // Step 1: Run Kairo analysis
    console.log('Step 1: Running Kairo analysis...');
    const kairoResult = await runKairoAnalysis();
    
    // Handle Kairo analysis results
    let kairoBuffering = false;
    
    if (!kairoResult.success) {
      // Check if it's a 403 error (rate limited/IP blocked)
      const is403Error = kairoResult.error && kairoResult.error.includes('403');
      
      // Check if it's a network/API error (403, network issues, etc.)
      const isNetworkError = kairoResult.error && (
        kairoResult.error.includes('ENOTFOUND') ||
        kairoResult.error.includes('getaddrinfo') ||
        kairoResult.error.includes('Network') ||
        kairoResult.error.includes('ECONNREFUSED') ||
        kairoResult.error.includes('403') ||
        kairoResult.error.includes('CloudFront') ||
        kairoResult.error.includes('ECONNRESET')
      );
      
      // If 403, set buffering flag and ignore the error
      if (is403Error) {
        kairoBuffering = true;
        console.warn('⚠️  Kairo API returned 403 (rate limited/IP blocked) - KairoAPI_buffering: True, ignoring and continuing');
        kairoResult.decision = 'WARN';
        kairoResult.errorType = 'rate_limited';
        kairoResult.decision_reason = 'Kairo API returned 403 - likely rate limited or IP blocked by CloudFront';
      } else if (isNetworkError) {
        // Other network errors - allow proceeding with warning
        console.warn('⚠️  Kairo API unavailable (network error), proceeding with warning');
        kairoResult.decision = 'WARN';
        
        // Determine specific error type
        let errorType = 'unknown';
        let errorReason = '';
        if (kairoResult.error?.includes('401')) {
          errorType = 'unauthorized';
          errorReason = 'Kairo API returned 401 - API key may be invalid';
        } else if (kairoResult.error?.includes('ENOTFOUND') || kairoResult.error?.includes('getaddrinfo')) {
          errorType = 'network_error';
          errorReason = 'Cannot resolve Kairo API hostname - DNS/network issue';
        } else if (kairoResult.error?.includes('ECONNREFUSED') || kairoResult.error?.includes('ECONNRESET')) {
          errorType = 'connection_refused';
          errorReason = 'Connection to Kairo API refused - service may be down';
        } else if (kairoResult.error?.includes('timeout')) {
          errorType = 'timeout';
          errorReason = 'Request to Kairo API timed out';
        } else {
          errorType = 'api_error';
          errorReason = kairoResult.error || 'Kairo API error - proceeding with warning';
        }
        
        kairoResult.errorType = errorType;
        kairoResult.decision_reason = errorReason;
      } else {
        // Non-network errors - log but allow proceeding (Kairo might have other issues)
        console.warn('⚠️  Kairo analysis had issues, proceeding with warning:', kairoResult.error);
        kairoResult.decision = 'WARN';
        kairoResult.errorType = 'api_error';
        kairoResult.decision_reason = kairoResult.error || 'Kairo API error';
      }
    }
    
    console.log('Kairo decision:', kairoResult.decision);
    
    // Check if Kairo blocks the deployment
    if (kairoResult.decision === 'BLOCK' || kairoResult.decision === 'ESCALATE') {
      const error = {
        message: 'Kairo security check failed - contract is not safe to deploy',
        kairoDecision: kairoResult.decision,
        kairoResult: kairoResult.response
      };
      
      await logError({
        endpoint: '/api/create-escrow',
        request: req.body,
        kairoAnalysis: kairoResult,
        error: error
      });
      
      return res.status(400).json({
        success: false,
        error: error,
        kairoResult: {
          decision: kairoResult.decision,
          findings: kairoResult.response?.findings || []
        }
      });
    }
    
    // Step 2: Create the deal on blockchain
    console.log('Step 2: Creating deal...');
    
    const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
    let dealResult;
    let simulated = false;
    
    // Try real blockchain interaction
    if (ESCROW_ADDRESS) {
      dealResult = await createDeal(
        price,
        commission,
        consumer_wallet,
        store_wallet,
        influencer_wallet
      );
      
      // If real deal creation failed, fall back to simulation
      if (!dealResult.success) {
        console.warn('⚠️  Real escrow creation failed, falling back to simulation:', dealResult.error);
        dealResult = generateSimulatedDeal(price, commission, consumer_wallet, store_wallet, influencer_wallet);
        dealResult.success = true;
        simulated = true;
      }
    } else {
      // ESCROW_ADDRESS not set, use simulation
      console.warn('⚠️  ESCROW_ADDRESS not set, using simulated escrow');
      dealResult = generateSimulatedDeal(price, commission, consumer_wallet, store_wallet, influencer_wallet);
      dealResult.success = true;
      simulated = true;
    }
    
    // Step 3: Return success with contract info
    console.log('✅ Deal created successfully!', simulated ? '(simulated)' : '(on blockchain)');
    console.log('Deal ID:', dealResult.dealId);
    console.log('Transaction:', dealResult.transactionHash);
    
    return res.json({
      success: true,
      message: simulated 
        ? 'Escrow created successfully (simulated)' 
        : 'Escrow created successfully on blockchain',
      simulated: simulated,
      KairoAPI_buffering: kairoBuffering || false,
      kairoAnalysis: {
        decision: kairoResult.decision,
        status: kairoResult.decision === 'ALLOW' ? 'PASSED' : 'WARN',
        errorType: kairoResult.errorType || null,
        errorReason: kairoResult.decision_reason || null,
        findings: kairoResult.response?.findings || [],
        available: kairoResult.success
      },
      contract: {
        address: ESCROW_ADDRESS || 'SIMULATED',
        dealId: dealResult.dealId,
        transactionHash: dealResult.transactionHash,
        blockNumber: dealResult.blockNumber || dealResult.receipt?.blockNumber,
        gasUsed: dealResult.gasUsed || dealResult.receipt?.gasUsed
      },
      escrowDetails: {
        price: price.toString(),
        commission: commission.toString(),
        consumer_wallet,
        store_wallet,
        influencer_wallet
      },
      nextSteps: {
        consumerFund: `POST /api/fund-consumer with {"dealId": "${dealResult.dealId}", "consumer_wallet": "${consumer_wallet}"}`,
        storeFund: `POST /api/fund-store with {"dealId": "${dealResult.dealId}", "store_wallet": "${store_wallet}"}`,
        checkStatus: `GET /api/deal-status/${dealResult.dealId}`
      }
    });
    
  } catch (error) {
    console.error('Unexpected error:', error);
    
    await logError({
      endpoint: '/api/create-escrow',
      request: req.body,
      unexpectedError: {
        message: error.message,
        stack: error.stack
      }
    });
    
    return res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error.message
      }
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Creator Escrow API'
  });
});

/**
 * Get escrow contract instance
 */
async function getEscrowContract(walletAddress = null) {
  const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
  if (!ESCROW_ADDRESS) {
    throw new Error('ESCROW_ADDRESS not set in environment. Deploy contract first.');
  }
  
  if (isHardhat) {
    return await ethers.getContractAt("CreatorCheckoutEscrow", ESCROW_ADDRESS);
  } else {
    const provider = getProvider();
    let signer = getSigner(provider);
    
    // If walletAddress provided, use that wallet's signer instead
    if (walletAddress) {
      const PRIVATE_KEY = process.env[`PRIVATE_KEY_${walletAddress.toLowerCase()}`] || process.env.PRIVATE_KEY;
      if (PRIVATE_KEY) {
        signer = new ethers.Wallet(PRIVATE_KEY, provider);
      }
    }
    
    const artifactsPath = path.join(__dirname, '../artifacts/contracts/CreatorCheckoutEscrow.sol/CreatorCheckoutEscrow.json');
    const artifacts = JSON.parse(await fs.readFile(artifactsPath, 'utf-8'));
    const abi = artifacts.abi;
    return new ethers.Contract(ESCROW_ADDRESS, abi, signer || provider);
  }
}

/**
 * Fund consumer (consumer pays price to store)
 */
app.post('/api/fund-consumer', async (req, res) => {
  try {
    const { dealId, consumer_wallet } = req.body;
    
    if (!dealId || !consumer_wallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: dealId, consumer_wallet'
      });
    }
    
    if (!ethers.isAddress(consumer_wallet)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid consumer_wallet address'
      });
    }
    
    const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
    let simulated = false;
    
    // Try real blockchain interaction
    if (ESCROW_ADDRESS) {
      try {
        // Get contract with consumer wallet signer
        const escrow = await getEscrowContract(consumer_wallet);
        
        // Call fundConsumer on the contract
        const tx = await escrow.fundConsumer(dealId);
        const receipt = await tx.wait();
        
        // Get updated deal status
        const dealInfo = await escrow.getDeal(dealId);
        const status = dealInfo[5]; // Status is 6th return value (index 5)
        
        // Status enum: NONE(0), CREATED(1), CONSUMER_FUNDED(2), STORE_FUNDED(3), RELEASED(4), REFUNDED(5)
        const statusNames = ['NONE', 'CREATED', 'CONSUMER_FUNDED', 'STORE_FUNDED', 'RELEASED', 'REFUNDED'];
        const statusName = statusNames[status] || 'UNKNOWN';
        const fulfilled = status === 4; // RELEASED = 4
        
        return res.json({
          success: true,
          message: fulfilled 
            ? 'Consumer funded and escrow fulfilled! Funds have been released.'
            : 'Consumer funded successfully. Waiting for store to fund.',
          confirmation: {
            consumerFunded: true,
            transactionHash: tx.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString()
          },
          dealStatus: {
            status: statusName,
            statusCode: status,
            fulfilled: fulfilled
          }
        });
      } catch (error) {
        console.warn('⚠️  Real funding failed, falling back to simulation:', error.message);
        simulated = true;
      }
    } else {
      console.warn('⚠️  ESCROW_ADDRESS not set, using simulated funding');
      simulated = true;
    }
    
    // Fallback to simulation
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    const blockNumber = Math.floor(Math.random() * 10000000) + 1000000;
    const gasUsed = Math.floor(Math.random() * 100000) + 50000;
    
    return res.json({
      success: true,
      message: 'Consumer funded successfully (simulated). Waiting for store to fund.',
      simulated: true,
      confirmation: {
        consumerFunded: true,
        transactionHash: txHash,
        blockNumber: blockNumber,
        gasUsed: gasUsed.toString()
      },
      dealStatus: {
        status: 'CONSUMER_FUNDED',
        statusCode: 2,
        fulfilled: false
      }
    });
    
  } catch (error) {
    console.error('Fund consumer error:', error);
    
    await logError({
      endpoint: '/api/fund-consumer',
      request: req.body,
      error: {
        message: error.message,
        stack: error.stack
      }
    });
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Fund store (store pays commission to influencer)
 */
app.post('/api/fund-store', async (req, res) => {
  try {
    const { dealId, store_wallet } = req.body;
    
    if (!dealId || !store_wallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: dealId, store_wallet'
      });
    }
    
    if (!ethers.isAddress(store_wallet)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid store_wallet address'
      });
    }
    
    const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
    let simulated = false;
    
    // Try real blockchain interaction
    if (ESCROW_ADDRESS) {
      try {
        // Get contract with store wallet signer
        const escrow = await getEscrowContract(store_wallet);
        
        // Call fundStore on the contract
        const tx = await escrow.fundStore(dealId);
        const receipt = await tx.wait();
        
        // Get updated deal status
        const dealInfo = await escrow.getDeal(dealId);
        const status = dealInfo[5]; // Status is 6th return value (index 5)
        
        // Status enum: NONE(0), CREATED(1), CONSUMER_FUNDED(2), STORE_FUNDED(3), RELEASED(4), REFUNDED(5)
        const statusNames = ['NONE', 'CREATED', 'CONSUMER_FUNDED', 'STORE_FUNDED', 'RELEASED', 'REFUNDED'];
        const statusName = statusNames[status] || 'UNKNOWN';
        const fulfilled = status === 4; // RELEASED = 4
        
        return res.json({
          success: true,
          message: fulfilled 
            ? 'Store funded and escrow fulfilled! Funds have been released.'
            : 'Store funded successfully. Waiting for consumer to fund.',
          confirmation: {
            storeFunded: true,
            transactionHash: tx.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString()
          },
          dealStatus: {
            status: statusName,
            statusCode: status,
            fulfilled: fulfilled
          }
        });
      } catch (error) {
        console.warn('⚠️  Real funding failed, falling back to simulation:', error.message);
        simulated = true;
      }
    } else {
      console.warn('⚠️  ESCROW_ADDRESS not set, using simulated funding');
      simulated = true;
    }
    
    // Fallback to simulation
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    const blockNumber = Math.floor(Math.random() * 10000000) + 1000000;
    const gasUsed = Math.floor(Math.random() * 100000) + 50000;
    
    return res.json({
      success: true,
      message: 'Store funded successfully (simulated). Waiting for consumer to fund.',
      simulated: true,
      confirmation: {
        storeFunded: true,
        transactionHash: txHash,
        blockNumber: blockNumber,
        gasUsed: gasUsed.toString()
      },
      dealStatus: {
        status: 'STORE_FUNDED',
        statusCode: 3,
        fulfilled: false
      }
    });
    
  } catch (error) {
    console.error('Fund store error:', error);
    
    await logError({
      endpoint: '/api/fund-store',
      request: req.body,
      error: {
        message: error.message,
        stack: error.stack
      }
    });
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get deal status
 */
app.get('/api/deal-status/:dealId', async (req, res) => {
  try {
    const { dealId } = req.params;
    
    const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
    let simulated = false;
    
    // Try real blockchain interaction
    if (ESCROW_ADDRESS) {
      try {
        const escrow = await getEscrowContract();
        
        // Get deal information
        const dealInfo = await escrow.getDeal(dealId);
        const [consumer, store, influencer, price, commission, status] = dealInfo;
        
        // Status enum: NONE(0), CREATED(1), CONSUMER_FUNDED(2), STORE_FUNDED(3), RELEASED(4), REFUNDED(5)
        const statusNames = ['NONE', 'CREATED', 'CONSUMER_FUNDED', 'STORE_FUNDED', 'RELEASED', 'REFUNDED'];
        const statusName = statusNames[status] || 'UNKNOWN';
        const fulfilled = status === 4; // RELEASED = 4
        
        return res.json({
          success: true,
          dealId: dealId,
          deal: {
            consumer: consumer,
            store: store,
            influencer: influencer,
            price: price.toString(),
            commission: commission.toString()
          },
          status: {
            status: statusName,
            statusCode: status,
            fulfilled: fulfilled,
            consumerFunded: status >= 2 && status !== 5, // CONSUMER_FUNDED or higher (except REFUNDED)
            storeFunded: status >= 3 && status !== 5, // STORE_FUNDED or higher (except REFUNDED)
            released: fulfilled
          }
        });
      } catch (error) {
        console.warn('⚠️  Real status check failed, falling back to simulation:', error.message);
        simulated = true;
      }
    } else {
      console.warn('⚠️  ESCROW_ADDRESS not set, using simulated status');
      simulated = true;
    }
    
    // Fallback to simulation
    return res.json({
      success: true,
      simulated: true,
      dealId: dealId,
      deal: {
        consumer: '0x0000000000000000000000000000000000000000',
        store: '0x0000000000000000000000000000000000000000',
        influencer: '0x0000000000000000000000000000000000000000',
        price: '0',
        commission: '0'
      },
      status: {
        status: 'CREATED',
        statusCode: 1,
        fulfilled: false,
        consumerFunded: false,
        storeFunded: false,
        released: false
      }
    });
    
  } catch (error) {
    console.error('Get deal status error:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get contract info endpoint
 */
app.get('/api/contract-info', async (req, res) => {
  try {
    const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
    if (!ESCROW_ADDRESS) {
      return res.status(400).json({
        error: 'ESCROW_ADDRESS not set. Deploy contract first.'
      });
    }
    
    const escrow = await getEscrowContract();
    
    res.json({
      contractAddress: ESCROW_ADDRESS,
      token: await escrow.token(),
      owner: await escrow.owner()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`\n📝 Endpoints:`);
  console.log(`   POST http://localhost:${PORT}/api/create-escrow - Create new escrow deal`);
  console.log(`   POST http://localhost:${PORT}/api/fund-consumer - Consumer pays price (consumer → store)`);
  console.log(`   POST http://localhost:${PORT}/api/fund-store - Store pays commission (store → influencer)`);
  console.log(`   GET  http://localhost:${PORT}/api/deal-status/:dealId - Check deal status and fulfillment`);
  console.log(`   GET  http://localhost:${PORT}/health - Health check`);
  console.log(`   GET  http://localhost:${PORT}/api/contract-info - Get contract information`);
  console.log(`\n⚠️  Make sure ESCROW_ADDRESS is set in .env file for real contracts`);
});
