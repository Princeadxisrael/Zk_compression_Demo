/**
 * ZK Compression Airdrop - Send to 1,000,000 Addresses .This script sends compressed tokens to 1 million addresses using
 * Light Protocol's ZK Compression. Each token account costs ~5,000 lamports instead of ~2,000,000 lamports (400x cheaper).
 *
 * Total cost: ~$5-40 for 1M recipients (vs ~$60,000+ regular SPL)
 *
 * Run: npm run airdrop
 * Prerequisites: npm run setup-mint (first time)
 */

import {
  Keypair,
  PublicKey,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  bn,
  buildAndSignTx,
  sendAndConfirmTx,
  createRpc,
  Rpc,
  selectStateTreeInfo,
} from "@lightprotocol/stateless.js";
import {
  CompressedTokenProgram,
 getAssociatedTokenAddressInterface,
 getSplInterfaceInfos,
  selectSplInterfaceInfo,
} from "@lightprotocol/compressed-token";
import bs58 from "bs58";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();


// Tuning knobs
const BATCH_SIZE = 14;          // recipients per transaction (safe limit)
const CONCURRENT_BATCHES = 20;  // parallel transactions
const MAX_RETRIES = 3;          // retry failed transactions
const PROGRESS_INTERVAL = 1000; // log progress every N transactions

// TYPES
interface BatchResult {
  success: boolean;
  batchIndex: number;
  error?: string;
  txSig?: string;
}

interface Stats {
  sent: number;
  failed: number;
  startTime: number;
  totalBatches: number;
}

// ─────────────────────────────────────────────
// ADDRESS GENERATION

/**
 * Generates recipient addresses.
 * In a real airdrop, load these from a CSV/JSON file.
 * For demo purposes, we generate deterministic random addresses.
 */
function* generateRecipientAddresses(total: number): Generator<PublicKey> {
  // For a real airdrop, replace this with your address list:
  //   const addresses = JSON.parse(fs.readFileSync('recipients.json', 'utf8'));
  //   for (const addr of addresses) yield new PublicKey(addr);

  for (let i = 0; i < total; i++) {
    // Generate deterministic keypairs for demo
    // In production: load from file or use real user addresses
    const seed = Buffer.alloc(32);
    seed.writeUInt32BE(i, 0);
    yield Keypair.fromSeed(seed).publicKey;
  }
}

// CORE AIRDROP LOGIC
/**
 * Sends compressed tokens to a batch of recipients in one transaction.
 */
async function sendBatch(
  connection: Rpc,
  payer: Keypair,
  mint: PublicKey,
  sourceTokenAccount: PublicKey,
  recipients: PublicKey[],
  amount: number,
  batchIndex: number
): Promise<BatchResult> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Fetch current state tree and token pool infos
      const treeInfos = await connection.getStateTreeInfos();
      const treeInfo = selectStateTreeInfo(treeInfos);
      const tokenPoolInfos = await getSplInterfaceInfos(connection, mint);
      const tokenPoolInfo = selectSplInterfaceInfo(tokenPoolInfos);

      // Build compress instructions: one per recipient
      const instructions = await Promise.all(
        recipients.map((recipient) =>
          CompressedTokenProgram.compress({
            payer: payer.publicKey,
            owner: payer.publicKey,
            source: sourceTokenAccount,
            toAddress: recipient,
            amount: bn(amount),
            mint,
            tokenPoolInfo,
            outputStateTreeInfo: treeInfo,

          })
        )
      );

      // Add compute budget for reliability
      const computeIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 200_000 + 50_000 * recipients.length,
      });

      const allInstructions = [computeIx, ...instructions];

      // Build, sign, and send transaction
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();

      const tx = buildAndSignTx(allInstructions, payer, blockhash, [payer]);

      const txSig = await sendAndConfirmTx(connection, tx, {
        commitment: "confirmed",
        skipPreflight: false,
      });

      return { success: true, batchIndex, txSig };
    } catch (error: any) {
      if (attempt === MAX_RETRIES) {
        return {
          success: false,
          batchIndex,
          error: error.message || String(error),
        };
      }
      // Exponential backoff
      await sleep(500 * attempt);
    }
  }

  return { success: false, batchIndex, error: "Max retries exceeded" };
}

// ─────────────────────────────────────────────
// PROGRESS DISPLAY

function printProgress(stats: Stats) {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const totalSent = stats.sent + stats.failed;
  const totalRecipients = stats.totalBatches * BATCH_SIZE;
  const pct = ((totalSent / stats.totalBatches) * 100).toFixed(1);
  const rate = totalSent / elapsed;
  const remaining = stats.totalBatches - totalSent;
  const eta = remaining / rate;
  const etaStr = eta > 60
    ? `${(eta / 60).toFixed(1)}m`
    : `${eta.toFixed(0)}s`;

  process.stdout.write(
    `\r Progress: ${pct}% | ` +
    `${stats.sent * BATCH_SIZE}/${totalRecipients} recipients | ` +
    `${stats.failed} failed batches | ` +
    `${(rate * BATCH_SIZE).toFixed(0)} addr/s | ` +
    `⏱ ETA: ${etaStr}   `
  );
}


//MAIN Mechanism

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {


//config
const API_KEY = process.env.API_KEY;
const MINT_ADDRESS = process.env.MINT_ADDRESS!;
const PAYER_KEYPAIR_BS58 = process.env.PAYER_KEYPAIR!;
const TOTAL_RECIPIENTS = parseInt(process.env.TOTAL_RECIPIENTS || "1000000");
const TOKENS_PER_RECIPIENT = parseInt(process.env.TOKENS_PER_RECIPIENT || "1");
  // Validate config
  if (!API_KEY || !MINT_ADDRESS || !PAYER_KEYPAIR_BS58) {
    console.error("❌ Missing required environment variables.");
    console.error("   Run 'npm run setup-mint' first, or set in .env:");
    console.error("   RPC_ENDPOINT, MINT_ADDRESS, PAYER_KEYPAIR");
    process.exit(1);
  }

   const RPC_URL = `https://devnet.helius-rpc.com/?api-key=${API_KEY}`;

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  ZK Compression Airdrop -> 1M Addresses on Solana║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const payer = Keypair.fromSecretKey(bs58.decode(PAYER_KEYPAIR_BS58));
  const mint = new PublicKey(MINT_ADDRESS);
  const connection: Rpc = createRpc(RPC_URL, RPC_URL, RPC_URL);

  console.log(`📍 Payer: ${payer.publicKey.toBase58()}`);
  console.log(` Mint: ${mint.toBase58()}`);
  console.log(` Recipients: ${TOTAL_RECIPIENTS.toLocaleString()}`);
  console.log(` Tokens per recipient: ${TOKENS_PER_RECIPIENT}`);
  console.log(` Batch size: ${BATCH_SIZE} recipients/tx`);
  console.log(` Concurrent batches: ${CONCURRENT_BATCHES}\n`);

  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log(` Payer balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

  // Get source token account
 
  // Use Interface helper to get the ATA — consistent with how setup-mint created it
  const sourceAta = getAssociatedTokenAddressInterface(mint, payer.publicKey);
  console.log(`📥 Source ATA: ${sourceAta.toBase58()}\n`);


  // Build batches
  const totalBatches = Math.ceil(TOTAL_RECIPIENTS / BATCH_SIZE);
  console.log(`📋 Creating ${totalBatches.toLocaleString()} batches...\n`);

  // Pre-generate all recipient addresses into batches
  const allBatches: PublicKey[][] = [];
  const gen = generateRecipientAddresses(TOTAL_RECIPIENTS);
  let currentBatch: PublicKey[] = [];

  for (const addr of gen) {
    currentBatch.push(addr);
    if (currentBatch.length === BATCH_SIZE) {
      allBatches.push(currentBatch);
      currentBatch = [];
    }
  }
  if (currentBatch.length > 0) allBatches.push(currentBatch);

  // Check if we should resume from checkpoint
  let startBatch = 0;
  const checkpointFile = ".airdrop-checkpoint.json";
  if (fs.existsSync(checkpointFile)) {
    const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, "utf8"));
    startBatch = checkpoint.lastCompletedBatch + 1;
    console.log(`⏩ Resuming from batch ${startBatch.toLocaleString()}\n`);
  }

  // ─── AIRDROP LOOP ───
  const stats: Stats = {
    sent: startBatch, // already-sent batches
    failed: 0,
    startTime: Date.now(),
    totalBatches,
  };

  const failedBatches: number[] = [];
  let batchIndex = startBatch;

  console.log("🚀 Starting airdrop...\n");

  while (batchIndex < allBatches.length) {
    // Process CONCURRENT_BATCHES at a time
    const chunk = allBatches.slice(batchIndex, batchIndex + CONCURRENT_BATCHES);
    const batchPromises = chunk.map((recipients, i) =>
      sendBatch(
        connection,
        payer,
        mint,
        sourceTokenAccount.address,
        recipients,
        TOKENS_PER_RECIPIENT,
        batchIndex + i
      )
    );

    const results = await Promise.allSettled(batchPromises);

    for (const result of results) {
      if (result.status === "fulfilled") {
        if (result.value.success) {
          stats.sent++;
        } else {
          stats.failed++;
          failedBatches.push(result.value.batchIndex);
        }
      } else {
        stats.failed++;
      }
    }

    batchIndex += chunk.length;

    // Save checkpoint
    fs.writeFileSync(
      checkpointFile,
      JSON.stringify({ lastCompletedBatch: batchIndex - 1, timestamp: Date.now() })
    );

    // Show progress
    printProgress(stats);
  }

  
  // ─── RETRY FAILED BATCHES ───
  if (failedBatches.length > 0) {
    console.log(`\n\n Retrying ${failedBatches.length} failed batches...`);

const retryBatches = failedBatches
  .map(idx => ({ idx, recipients: allBatches[idx] }))
  .filter(
    (b): b is { idx: number; recipients: PublicKey[] } =>
      b.recipients !== undefined
  );

  for (const {idx, recipients} of retryBatches) {
      const result = await sendBatch(
        connection,
        payer,
        mint,
        sourceTokenAccount.address,
        recipients,
        TOKENS_PER_RECIPIENT,
        idx
      );

      if (result.success) {
        stats.sent++;
        stats.failed--;
      }
    }
  }

  // ─── FINAL SUMMARY ───
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const successfulRecipients = stats.sent * BATCH_SIZE;
  const finalBalance = await connection.getBalance(payer.publicKey);
  const solSpent = (balance - finalBalance) / LAMPORTS_PER_SOL;

  console.log("\n\n╔══════════════════════════════════════════╗");
  console.log("║              Airdrop Complete!            ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`\n✅ Successful recipients: ${successfulRecipients.toLocaleString()}`);
  console.log(`❌ Failed batches: ${stats.failed}`);
  console.log(`⏱  Total time: ${(elapsed / 60).toFixed(1)} minutes`);
  console.log(`    SOL spent: ${solSpent.toFixed(4)} SOL`);
  console.log(`    USD cost: ~$${(solSpent * 150).toFixed(2)} (at $150/SOL)`);
  console.log(`\n🎉 ZK Compression savings vs regular SPL:`);
  console.log(`   Regular SPL would cost: ~${(2_000_000 * successfulRecipients / LAMPORTS_PER_SOL).toFixed(0)} SOL`);
  console.log(`   ZK Compressed cost:     ~${solSpent.toFixed(4)} SOL`);
  console.log(`   Savings:                ~${((2_000_000 * successfulRecipients / LAMPORTS_PER_SOL) / solSpent).toFixed(0)}x cheaper!\n`);

  // Clean up checkpoint
  if (fs.existsSync(checkpointFile)) {
    fs.unlinkSync(checkpointFile);
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});