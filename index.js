/**
 * ====================================================================
 * WEEV2 ARB MONITOR - RAILWAY CRON SERVICE
 * ====================================================================
 * 
 * Polls ARBContract.checkArbOpportunity() every 10 seconds.
 * If an arb opportunity exists (gap >= 2.1%), calls WWMM.forceSync()
 * 
 * This is a BACKUP keeper - catches missed opportunities between tax-triggered arbs.
 * 
 * Cost estimate:
 * - Reads: FREE (no gas, just RPC calls)
 * - Writes: ~0.01-0.02 ETH per arb (only when opportunity exists)
 * 
 * ====================================================================
 */

require('dotenv').config();
const { ethers } = require('ethers');

// ====== CONFIGURATION ======
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';
const PRIVATE_KEY = process.env.RAILWAY_PRIVATE_KEY;

// Contract addresses - UPDATE THESE AFTER DEPLOYMENT
const ARB_CONTRACT = process.env.ARB_CONTRACT || '';
const WWMM_CONTRACT = process.env.WWMM_CONTRACT || '';

// Polling interval in milliseconds (10 seconds)
const POLL_INTERVAL_MS = 10000;

// Minimum gap to log (in bps) - just for logging, contract handles threshold
const LOG_GAP_THRESHOLD = 100; // 1%

// Minimum ETH balance to keep the keeper running
const MIN_ETH_BALANCE = ethers.utils.parseEther('0.001');

// ====== ABIs ======
const ARB_ABI = [
    "function checkArbOpportunity() external view returns (bool available, uint256 gapBps, bool wethPoolExpensive)",
    "function gapThresholdBps() external view returns (uint256)"
];

const WWMM_ABI = [
    "function forceSync() external",
    "function arbEnabled() external view returns (bool)"
];

// ====== STATE ======
let provider;
let wallet;
let arbContract;
let wwmmContract;
let lastArbTime = 0;
let totalArbs = 0;
let totalGasUsed = ethers.BigNumber.from(0);

// ====== HELPERS ======
function log(msg) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function checkAndTriggerArb() {
    try {
        // 1. Check if arb opportunity exists using checkArbOpportunity
        const [available, gapBps, wethPoolExpensive] = await arbContract.checkArbOpportunity();

        if (!available) {
            // No opportunity - silent (don't spam logs)
            return { triggered: false, reason: 'no_opportunity' };
        }

        // 2. Log the opportunity
        const direction = wethPoolExpensive ? 'WETH→SOL' : 'SOL→WETH';
        log(`🎯 ARB OPPORTUNITY: ${direction}, Gap: ${gapBps.toString()} bps (${(gapBps.toNumber() / 100).toFixed(2)}%)`);

        // 3. Check if ARB is enabled on WWMM
        const arbEnabled = await wwmmContract.arbEnabled();
        if (!arbEnabled) {
            log(`⚠️ ARB is disabled on WWMM, skipping`);
            return { triggered: false, reason: 'arb_disabled' };
        }

        // 4. Check ETH balance
        const balance = await provider.getBalance(wallet.address);
        if (balance.lt(MIN_ETH_BALANCE)) {
            log(`❌ Low ETH balance: ${ethers.utils.formatEther(balance)}`);
            return { triggered: false, reason: 'low_balance' };
        }

        // 5. Execute the arb via forceSync
        log(`🚀 Triggering arb via forceSync...`);
        const tx = await wwmmContract.forceSync({
            gasLimit: 1200000  // FIX #12: 800K was too low, tradePistol alone uses ~757K
        });

        log(`📤 TX sent: ${tx.hash}`);
        const receipt = await tx.wait();

        // 6. Update stats
        totalArbs++;
        totalGasUsed = totalGasUsed.add(receipt.gasUsed.mul(receipt.effectiveGasPrice));
        lastArbTime = Date.now();

        log(`✅ ARB SUCCESS! Gas: ${receipt.gasUsed.toString()}, Total arbs: ${totalArbs}`);

        return { triggered: true, txHash: tx.hash };

    } catch (error) {
        // Check if it's a "No arb opportunity" or similar expected error
        const reason = error.reason || error.message;
        if (reason.includes('No arb opportunity') || reason.includes('Gap below threshold') || reason.includes('no opportunity')) {
            // Expected - opportunity closed between check and execute
            return { triggered: false, reason: 'opportunity_closed' };
        }

        log(`❌ Error: ${reason}`);
        return { triggered: false, reason: 'error', error: reason };
    }
}

async function runLoop() {
    log(`${'═'.repeat(50)}`);
    log(`WEEV2 ARB MONITOR STARTED`);
    log(`${'═'.repeat(50)}`);
    log(`Polling every ${POLL_INTERVAL_MS / 1000} seconds`);
    log(`ARB Contract: ${ARB_CONTRACT}`);
    log(`WWMM Contract: ${WWMM_CONTRACT}`);
    log(`Keeper Wallet: ${wallet.address}`);

    // Check initial balance
    const balance = await provider.getBalance(wallet.address);
    log(`Wallet Balance: ${ethers.utils.formatEther(balance)} ETH`);

    // Check if ARB is enabled
    const arbEnabled = await wwmmContract.arbEnabled();
    if (!arbEnabled) {
        log(`\n⚠️ WARNING: ARB is disabled on WWMM!`);
        log(`Run: wwmmContract.setArbEnabled(true)`);
    } else {
        log(`✅ ARB is enabled on WWMM`);
    }

    // Get threshold
    const threshold = await arbContract.gapThresholdBps();
    log(`Gap Threshold: ${threshold.toString()} bps (${threshold.toNumber() / 100}%)`);

    log(`\n${'─'.repeat(50)}\n`);

    // Main polling loop
    while (true) {
        await checkAndTriggerArb();

        // Wait for next poll
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
}

// ====== MAIN ======
async function main() {
    // Validate config
    if (!PRIVATE_KEY) {
        console.error("❌ Missing RAILWAY_PRIVATE_KEY in .env");
        process.exit(1);
    }

    if (!ARB_CONTRACT || !WWMM_CONTRACT) {
        console.error("❌ Missing ARB_CONTRACT or WWMM_CONTRACT in .env");
        process.exit(1);
    }

    // Initialize
    provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    arbContract = new ethers.Contract(ARB_CONTRACT, ARB_ABI, wallet);
    wwmmContract = new ethers.Contract(WWMM_CONTRACT, WWMM_ABI, wallet);

    // Run forever
    await runLoop();
}

main().catch((e) => {
    console.error(`\n❌ FATAL: ${e.message}`);
    process.exit(1);
});
