# zk_compression_airdrop
# ZK Compression Airdrop Demo

**Mint and send tokens to 1,000,000 addresses for under $50** using [Light Protocol's ZK Compression](https://www.zkcompression.com) on Solana.

## Why ZK Compression?

| | Regular SPL | ZK Compressed |
|---|---|---|
| Token account cost | ~$0.30 each | ~$0.00075 each |
| 1M recipients | ~$300,000+ | **~$5–40** |
| Security | L1 Solana | L1 Solana (same!) |

ZK Compression stores token state in Merkle trees — only a root hash lives on-chain. Recipients can decompress back to regular SPL at any time.

## Prerequisites

- Node.js >= 20.9.0
- [Helius](https://helius.dev) API key (free tier works; Helius natively supports ZK Compression)
- Funded Solana wallet

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit RPC_ENDPOINT with your Helius API key
```

### 3. Fund your wallet (devnet only)

```bash
solana airdrop 2 --url devnet   # repeat a few times
```

### 4. Preview costs

```bash
npm run estimate
```

### 5. Create the mint

```bash
npm run setup-mint
```

Creates a compressed token mint, sets up the token pool, mints 1M tokens to your ATA, saves config to `.env`.

### 6. Run the airdrop

```bash
npm run airdrop
```

## How It Works

Each transaction compresses tokens directly from your SPL token account to 14 recipient compressed accounts simultaneously. With 20 parallel batches, the script can process ~5,000 addresses/second.

### Cost for 1M recipients

```
Transactions:  ~71,429  (1M ÷ 14/tx)
Per-tx fee:    ~15,000 lamports
Total:         ~1.07 SOL
At $150/SOL:   ~$16
At $200/SOL:   ~$21
```

vs regular SPL token accounts: ~2,039 SOL = **~$300,000** (400x more expensive)

## Files

```
src/setup-mint.ts      # Create mint + fund supply (run once)
src/airdrop.ts         # Main airdrop with batching + progress
src/estimate-cost.ts   # Cost calculator
tasks/todo.md          # Project plan
```

## Production Tips

- Replace `generateRecipientAddresses()` with your real address list from a JSON/CSV file
- Increase `CONCURRENT_BATCHES` for faster distribution (check RPC rate limits)
- Checkpoint file `.airdrop-checkpoint.json` enables resume on interruption
- Consider a paid Helius plan for high-throughput airdrops

## Links

- [ZK Compression Docs](https://www.zkcompression.com)
- [Light Protocol GitHub](https://github.com/Lightprotocol/light-protocol)
- [Airdrop Guide](https://www.zkcompression.com/compressed-tokens/advanced-guides/airdrop)