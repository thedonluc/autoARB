/**
 * ====================================================================
 * WEEV2 ARB MONITOR - RAILWAY CRON SERVICE
 * ====================================================================
 * 
 * Checks ARBContract.checkArbOpportunity() ONCE per invocation.
 * If an arb opportunity exists (gap >= 2.1%), calls WWMM.forceSync()
 * Then exits. Designed to be called every 5 minutes via Railway cron.
 * 
 * Railway cron: */5 * * * *
 * Railway hours: ~1.5h/month (runs for seconds every 5 min)
 * 
 * ====================================================================
 */

require('dotenv').config();
const { ethers } = require('ethers');

// ====== CONFIGURATION ======
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';
const PRIVATE_KEY = process.env.RAILWAY_PRIVATE_KEY;
const ARB_CONTRACT = process.env.ARB_CONTRACT || '';
const WWMM_CONTRACT = process.env.WWMM_CONTRACT || '';
const MIN_ETH_BALANCE = ethers.utils.parseEther('0.001');

// ====== ABIs ======
const ARB_ABI = [
    'function checkArbOpportunity() external view returns (bool available, uint256 gapBps, bool wethPoolExpensive)',
    'function gapThresholdBps() external view returns (uint256)'
];

const WWMM_ABI = [
    'function forceSync() external',
    'function arbEnabled() external view returns (bool)'
];

function log(msg) {
    console.log('[' + new Date().toISOString() + '] ' + msg);
}

async function main() {
    if (!PRIVATE_KEY) { console.error('Missing RAILWAY_PRIVATE_KEY'); process.exit(1); }
    if (!ARB_CONTRACT || !WWMM_CONTRACT) { console.error('Missing ARB_CONTRACT or WWMM_CONTRACT'); process.exit(1); }

    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const arbContract = new ethers.Contract(ARB_CONTRACT, ARB_ABI, wallet);
    const wwmmContract = new ethers.Contract(WWMM_CONTRACT, WWMM_ABI, wallet);

    // 1. Check if arb opportunity exists
    const [available, gapBps, wethPoolExpensive] = await arbContract.checkArbOpportunity();

    if (!available) {
        log('No arb opportunity');
        return;
    }

    const direction = wethPoolExpensive ? 'WETH>SOL' : 'SOL>WETH';
    log('ARB: ' + direction + ', Gap: ' + gapBps.toString() + ' bps (' + (gapBps.toNumber() / 100).toFixed(2) + '%)');

    // 2. Check if ARB is enabled
    const arbEnabled = await wwmmContract.arbEnabled();
    if (!arbEnabled) { log('ARB disabled'); return; }

    // 3. Check ETH balance
    const balance = await provider.getBalance(wallet.address);
    if (balance.lt(MIN_ETH_BALANCE)) { log('Low ETH: ' + ethers.utils.formatEther(balance)); return; }

    // 4. Execute via forceSync
    log('Triggering arb...');
    const tx = await wwmmContract.forceSync({ gasLimit: 1200000 });
    log('TX: ' + tx.hash);
    const receipt = await tx.wait();
    log('SUCCESS! Gas: ' + receipt.gasUsed.toString());
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('Error: ' + (e.reason || e.message));
        process.exit(1);
    });
