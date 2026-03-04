import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createRpc,
  Rpc,
} from "@lightprotocol/stateless.js";
import {
  transfer,
  mintTo
} from "@lightprotocol/compressed-token";
import bs58 from "bs58";
import fs from "fs";

import "dotenv/config";

const BATCH_SIZE = 1;             // one recipient per tx (transfer is 1:1)
const CONCURRENT_BATCHES = 3;     // one at a time to avoid rate limits
const MAX_RETRIES = 5;
const DELAY_MS = 1000;            // 2s between transactions

interface Stats {
  sent: number;
  failed: number;
  startTime: number;
  totalRecipients: number;
}

function* generateRecipientAddresses(total: number): Generator<PublicKey> {
  for (let i = 0; i < total; i++) {
    const seed = Buffer.alloc(32);
    seed.writeUInt32BE(i, 0);
    yield Keypair.fromSeed(seed).publicKey;
  }
}

async function sendToRecipient(
  connection: Rpc,
  payer: Keypair,
  mint: PublicKey,
  recipient: PublicKey,
  amount: number,
  index: number,
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const txSig = await mintTo(
        connection,
        payer,
        mint,
        recipient,
        payer,        // owner of compressed tokens
        amount,    // destination
      );
      return { success: true };
    } catch (error: any) {
      if (attempt === MAX_RETRIES) {
        return { success: false, error: error.message || String(error) };
      }
      const delay = error.message?.includes("429") ? 3000 * attempt : 1000 * attempt;
      await sleep(delay);
    }
  }
  return { success: false, error: "Max retries exceeded" };
}

function printProgress(stats: Stats) {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const total = stats.sent + stats.failed;
  const pct = ((total / stats.totalRecipients) * 100).toFixed(2);
  const rate = total / Math.max(elapsed, 1);
  const eta = (stats.totalRecipients - total) / Math.max(rate, 0.001);
  const etaStr = eta > 3600
    ? `${(eta / 3600).toFixed(1)}h`
    : eta > 60
    ? `${(eta / 60).toFixed(1)}m`
    : `${eta.toFixed(0)}s`;

  process.stdout.write(
    `\r Progress: ${pct}% | ` +
    `${stats.sent}/${stats.totalRecipients} sent | ` +
    `${stats.failed} failed | ` +
    `${rate.toFixed(2)} tx/s | ETA: ${etaStr}   `
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
  const MINT_ADDRESS = process.env.MINT_ADDRESS;
  const PAYER_KEYPAIR_BS58 = process.env.PAYER_KEYPAIR;
  const TOTAL_RECIPIENTS = parseInt(process.env.TOTAL_RECIPIENTS || "1000000");
  const TOKENS_PER_RECIPIENT = parseInt(process.env.TOKENS_PER_RECIPIENT || "1");

  if (!RPC_ENDPOINT || !MINT_ADDRESS || !PAYER_KEYPAIR_BS58) {
    console.error("❌ Missing required environment variables.");
    console.error("   Make sure .env contains: RPC_ENDPOINT, MINT_ADDRESS, PAYER_KEYPAIR");
    process.exit(1);
  }

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  ZK Compression Airdrop -> 1M Addresses on Solana║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const payer = Keypair.fromSecretKey(bs58.decode(PAYER_KEYPAIR_BS58));
  const mint = new PublicKey(MINT_ADDRESS);
  const connection: Rpc = createRpc(RPC_ENDPOINT, RPC_ENDPOINT, RPC_ENDPOINT);

  console.log(`📍 Payer: ${payer.publicKey.toBase58()}`);
  console.log(` Mint: ${mint.toBase58()}`);
  console.log(` Total recipients: ${TOTAL_RECIPIENTS.toLocaleString()}`);
  console.log(` Tokens per recipient: ${TOKENS_PER_RECIPIENT}\n`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(` Payer balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

  // Resume from checkpoint
  let startIndex = 0;
  const checkpointFile = ".airdrop-checkpoint.json";
  if (fs.existsSync(checkpointFile)) {
    const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, "utf8"));
    startIndex = checkpoint.lastCompletedIndex + 1;
    console.log(`⏩ Resuming from recipient ${startIndex.toLocaleString()}\n`);
  }

  const stats: Stats = {
    sent: startIndex,
    failed: 0,
    startTime: Date.now(),
    totalRecipients: TOTAL_RECIPIENTS,
  };

  const failedIndices: number[] = [];
  const gen = generateRecipientAddresses(TOTAL_RECIPIENTS);

  // Skip already-processed recipients
  for (let i = 0; i < startIndex; i++) gen.next();

  console.log("🚀 Starting airdrop...\n");

  let index = startIndex;
  const recipients: PublicKey[] = [];
for (const addr of gen) recipients.push(addr);

while (index < recipients.length) {
  const chunk = recipients.slice(index, index + CONCURRENT_BATCHES);

  const results = await Promise.allSettled(
    chunk.map((recipient, i) =>
      sendToRecipient(connection, payer, mint, recipient, TOKENS_PER_RECIPIENT, index + i)
    )
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.success) {
      stats.sent++;
    } else {
      stats.failed++;
      if (result.status === "fulfilled") failedIndices.push(index);
    }
  }

  index += chunk.length;

  if (index % 50 === 0) {
    fs.writeFileSync(checkpointFile, JSON.stringify({ lastCompletedIndex: index - 1 }));
  }

  printProgress(stats);
  await sleep(DELAY_MS);
}

  // Retry failed
  if (failedIndices.length > 0) {
    console.log(`\n\n Retrying ${failedIndices.length} failed recipients...`);
    for (const idx of failedIndices) {
      const seed = Buffer.alloc(32);
      seed.writeUInt32BE(idx, 0);
      const recipient = Keypair.fromSeed(seed).publicKey;
      const result = await sendToRecipient(
        connection, payer, mint, recipient, TOKENS_PER_RECIPIENT, idx
      );
      if (result.success) { stats.sent++; stats.failed--; }
      await sleep(DELAY_MS);
    }
  }

  // Summary
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const finalBalance = await connection.getBalance(payer.publicKey);
  const solSpent = (balance - finalBalance) / LAMPORTS_PER_SOL;

  console.log("\n\n╔══════════════════════════════════════════╗");
  console.log("║              Airdrop Complete!            ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`\n✅ Sent:         ${stats.sent.toLocaleString()}`);
  console.log(`❌ Failed:       ${stats.failed}`);
  console.log(`⏱  Time:         ${(elapsed / 3600).toFixed(2)} hours`);
  console.log(`   SOL spent:    ${solSpent.toFixed(4)} SOL`);
  console.log(`   USD cost:     ~$${(solSpent * 150).toFixed(2)} (at $150/SOL)`);
  console.log(`\n Regular SPL would have cost: ~${(2_000_000 * stats.sent / LAMPORTS_PER_SOL).toFixed(0)} SOL`);

  if (fs.existsSync(checkpointFile)) fs.unlinkSync(checkpointFile);
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});