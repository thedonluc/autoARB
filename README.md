# 66mee autoARB - Arbitrage Monitoring

Always-on worker that monitors for arb opportunities between 66MEE/WETH and 66MEE/SOL pools.

## Setup on Railway

1. Create new project from GitHub repo
2. Set environment variables
3. Deploy as **Worker** (always running, NOT cron)

## What it does

1. Polls `checkArbOpportunity()` every 10 seconds for price gaps between pools
2. If gap >= 2.1% (210 bps), triggers arb via `WWMM.forceSync()`
3. Profits are automatically burned by ARBContract

## Environment Variables

```
RPC_URL=https://mainnet.base.org
RAILWAY_PRIVATE_KEY=<your_key>
ARB_CONTRACT=<FILL_IN_AFTER_DEPLOY>
WWMM_CONTRACT=<FILL_IN_AFTER_DEPLOY>
```

## Railway Wallet

- Address: `0x0FBFA93c52a083849D933F3e85fbEEEaC6BB2D4f`
- `forceSync()` is public — no access control needed
