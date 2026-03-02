/**
 * Cost Estimator for ZK Compression Airdrop
 *
 * Run: npm run estimate
 * Shows detailed cost breakdown before you spend anything.
 */

import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const SOL_PRICES = [50, 100, 150, 200, 250];

interface Scenario {
  name: string;
  recipients: number;
  batchSize: number;
  lamportsPerTx: number;
}

const SCENARIOS: Scenario[] = [
  {
    name: "Small demo (10K)",
    recipients: 10_000,
    batchSize: 14,
    lamportsPerTx: 15_000,
  },
  {
    name: "Medium airdrop (100K)",
    recipients: 100_000,
    batchSize: 14,
    lamportsPerTx: 15_000,
  },
  {
    name: "Large airdrop (1M)",
    recipients: 1_000_000,
    batchSize: 14,
    lamportsPerTx: 15_000,
  },
  {
    name: "Mega airdrop (10M)",
    recipients: 10_000_000,
    batchSize: 14,
    lamportsPerTx: 15_000,
  },
];

function estimate(scenario: Scenario) {
  const numBatches = Math.ceil(scenario.recipients / scenario.batchSize);
  const totalLamports = numBatches * scenario.lamportsPerTx;
  const solCost = totalLamports / LAMPORTS_PER_SOL;

  // Regular SPL comparison
  const regularLamports = scenario.recipients * 2_039_280; // rent-exempt for token account
  const regularSol = regularLamports / LAMPORTS_PER_SOL;

  return { numBatches, solCost, regularSol };
}

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║           ZK Compression Airdrop - Cost Estimator           ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

console.log(" ZK Compression vs Regular SPL Token Accounts\n");
console.log("┌─────────────────────────┬──────────┬──────────┬──────────────┐");
console.log("│ Scenario                │ ZK (SOL) │ Reg (SOL)│ Savings      │");
console.log("├─────────────────────────┼──────────┼──────────┼──────────────┤");

for (const scenario of SCENARIOS) {
  const { solCost, regularSol } = estimate(scenario);
  const savings = (regularSol / solCost).toFixed(0);
  console.log(
    `│ ${scenario.name.padEnd(23)} │ ${solCost.toFixed(2).padStart(8)} │ ${regularSol.toFixed(0).padStart(8)} │ ${(savings + "x").padStart(12)} │`
  );
}

console.log("└─────────────────────────┴──────────┴──────────┴──────────────┘\n");

console.log("💵 USD Cost for 1M Recipient Airdrop\n");
const mainScenario = SCENARIOS[2]; // 1M
if (!mainScenario) {
  throw new Error("Scenario[2] does not exist");
}
const { solCost } = estimate(mainScenario)!;

console.log("┌──────────────┬─────────┬──────────────────────────────────┐");
console.log("│ SOL Price    │ SOL     │ USD Cost                         │");
console.log("├──────────────┼─────────┼──────────────────────────────────┤");

for (const price of SOL_PRICES) {
  const usd = (solCost * price).toFixed(2);
  const bar = "█".repeat(Math.min(Math.floor(parseFloat(usd) / 2), 20));
  console.log(
    `│ $${price.toString().padEnd(11)} │ ${solCost.toFixed(2).padStart(7)} │ $${usd.padEnd(6)} ${bar.padEnd(20)} │`
  );
}

console.log("└──────────────┴─────────┴──────────────────────────────────┘\n");

console.log("⚡ Key Facts about ZK Compression:\n");
console.log("  • Regular SPL token account: ~2,039,280 lamports ($0.30 each)");
console.log("  • ZK Compressed token: ~5,000 lamports ($0.00075 each)");
console.log("  • 400x cheaper storage, same L1 security");
console.log("  • Tokens stored in Merkle trees, only root hash on-chain");
console.log("  • Supported by Helius, QuickNode, and other major RPCs\n");

console.log("🚀 Getting Started:\n");
console.log("  1. Get a Helius API key: https://helius.dev");
console.log("  2. Edit .env with your RPC_ENDPOINT and PAYER_KEYPAIR");
console.log("  3. Fund payer wallet (devnet: 'solana airdrop 2 --url devnet')");
console.log("  4. Run: npm run setup-mint");
console.log("  5. Run: npm run airdrop\n");