const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
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
      const dealCreatedEvent = receipt.logs.find(
        log => {
          try {
            const parsed = escrow.interface.parseLog(log);
            return parsed && parsed.name === "DealCreated";
          } catch {
            return false;
          }
        }
      );
      
      if (dealCreatedEvent) {
        const parsed = escrow.interface.parseLog(dealCreatedEvent);
        dealId = parsed.args[0];
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
    if (!kairoResult.success) {
      // Check if it's a network error (development/sandbox environment)
      const isNetworkError = kairoResult.error && (
        kairoResult.error.includes('ENOTFOUND') ||
        kairoResult.error.includes('getaddrinfo') ||
        kairoResult.error.includes('Network') ||
        kairoResult.error.includes('ECONNREFUSED')
      );
      
      if (isNetworkError && process.env.NODE_ENV !== 'production') {
        // In development, allow proceeding with warning if network is unavailable
        console.warn('⚠️  Kairo API unavailable (network error), proceeding in development mode');
        kairoResult.decision = 'WARN';
        kairoResult.decision_reason = 'Kairo API unavailable - network error (development mode)';
      } else {
        // In production or non-network errors, fail
        const error = {
          message: 'Kairo analysis failed',
          kairoResult: kairoResult
        };
        
        await logError({
          endpoint: '/api/create-escrow',
          request: req.body,
          kairoAnalysis: kairoResult,
          error: error
        });
        
        return res.status(500).json({
          success: false,
          error: error,
          kairoResult: kairoResult
        });
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
    console.log('Step 2: Creating deal on blockchain...');
    const dealResult = await createDeal(
      price,
      commission,
      consumer_wallet,
      store_wallet,
      influencer_wallet
    );
    
    if (!dealResult.success) {
      const error = {
        message: 'Failed to create deal on blockchain',
        dealResult: dealResult
      };
      
      await logError({
        endpoint: '/api/create-escrow',
        request: req.body,
        kairoAnalysis: kairoResult,
        dealCreation: dealResult,
        error: error
      });
      
      return res.status(500).json({
        success: false,
        error: error,
        kairoResult: {
          decision: kairoResult.decision,
          status: 'PASSED'
        },
        dealResult: dealResult
      });
    }
    
    // Step 3: Return success with contract info
    console.log('✅ Deal created successfully!');
    console.log('Deal ID:', dealResult.dealId);
    console.log('Transaction:', dealResult.transactionHash);
    
    return res.json({
      success: true,
      message: 'Escrow created successfully',
      kairoAnalysis: {
        decision: kairoResult.decision,
        status: kairoResult.decision === 'ALLOW' ? 'PASSED' : 'WARN',
        findings: kairoResult.response?.findings || []
      },
      contract: {
        dealId: dealResult.dealId,
        transactionHash: dealResult.transactionHash,
        blockNumber: dealResult.receipt.blockNumber,
        gasUsed: dealResult.receipt.gasUsed
      },
      details: {
        price: price.toString(),
        commission: commission.toString(),
        consumer_wallet,
        store_wallet,
        influencer_wallet
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
    
    // Get contract instance based on environment
    let escrow;
    if (isHardhat) {
      escrow = await ethers.getContractAt("CreatorCheckoutEscrow", ESCROW_ADDRESS);
    } else {
      const provider = getProvider();
      const artifactsPath = path.join(__dirname, '../artifacts/contracts/CreatorCheckoutEscrow.sol/CreatorCheckoutEscrow.json');
      const artifacts = JSON.parse(await fs.readFile(artifactsPath, 'utf-8'));
      const abi = artifacts.abi;
      escrow = new ethers.Contract(ESCROW_ADDRESS, abi, provider);
    }
    
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
  console.log(`📝 Endpoint: POST http://localhost:${PORT}/api/create-escrow`);
  console.log(`🏥 Health: GET http://localhost:${PORT}/health`);
  console.log(`📊 Contract Info: GET http://localhost:${PORT}/api/contract-info`);
  console.log(`\n⚠️  Make sure ESCROW_ADDRESS is set in .env file`);
});
