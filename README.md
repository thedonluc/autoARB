# 77ME autoARB - Arbitrage Monitoring

Always-on worker that monitors for arb opportunities.

## Setup on Railway

1. Create new project from GitHub repo
2. Set environment variables (copy from .env)
3. Deploy as "Worker" (always running, NOT cron)

## What it does

1. Polls every 10 seconds for price gaps between pools
2. If gap > 2.1%, triggers arb via WWMM keeper function
3. Profits are automatically burned

## Environment Variables

```
RPC_URL=https://mainnet.base.org
RAILWAY_PRIVATE_KEY=<your_key>
ARB_CONTRACT=0xcb68fabe01fb7589698df4e24ff534db264f7dd0
WWMM_CONTRACT=0xdc5d038b4ad82d349055f4c4d1032d5f6d34814d
```

## Railway Wallet

- Address: `0x5aa6c2102a4c6249a5015FB8Aa283765d1259aD1`
- Already set as WWMM keeper ✅
