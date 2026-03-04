import "dotenv/config";
import { createRpc } from "@lightprotocol/stateless.js";
import { createMint, mintTo } from "@lightprotocol/compressed-token";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import fs from "fs";
import os from "os";
import path from "path";

const TOTAL_RECIPIENTS = 1_000_000;
const TOKENS_PER_RECIPIENT = 1;
const TOKEN_DECIMALS = 9;
const TOKEN_SYMBOL = "ZKMAGIC";

async function main() {
  const RPC_ENDPOINT = process.env.RPC_ENDPOINT!;
  const connection = createRpc(RPC_ENDPOINT, RPC_ENDPOINT, RPC_ENDPOINT);

  let payer: Keypair;
  if (process.env.PAYER_KEYPAIR) {
    payer = Keypair.fromSecretKey(bs58.decode(process.env.PAYER_KEYPAIR));
  } else {
    const walletPath = path.join(os.homedir(), ".config", "solana", "id.json");
    payer = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
  }

  console.log("╔══════════════════════════════════════════╗");
  console.log("║   ZK Compression Airdrop - Setup Mint    ║");
  console.log("╚══════════════════════════════════════════╝\n");
  console.log(`📍 Payer: ${payer.publicKey.toBase58()}`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(` Balance: ${balance / LAMPORTS_PER_SOL} SOL\n`);

  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.error("⚠️  Low balance! Run: solana airdrop 2 --url devnet");
    process.exit(1);
  }

  // Step 1: Create mint (automatically creates token pool)
  console.log(" Creating mint...");
  const mintKeypair = Keypair.generate();
  const { mint, transactionSignature: mintTx } = await createMint(
    connection,
    payer,
    payer.publicKey,  // mint authority
    TOKEN_DECIMALS,
    mintKeypair
  );
  console.log(`✅ Mint: ${mint.toBase58()}`);
  console.log(`   Tx: ${mintTx}\n`);

  // Step 2: Mint total supply directly to payer as compressed tokens
  // mintTo() mints to a public key directly — no ATA needed
  const totalSupply = TOTAL_RECIPIENTS * TOKENS_PER_RECIPIENT;
  console.log(` Minting ${totalSupply.toLocaleString()} ${TOKEN_SYMBOL} tokens...`);
  const mintToTx = await mintTo(
    connection,
    payer,
    mint,
    payer.publicKey,  // recipient: payer's public key (not an ATA)
    payer,            // mint authority
    totalSupply
  );
  console.log(`✅ Minted! Tx: ${mintToTx}\n`);

  // Step 3: Save to .env
  const envContent = `# ZK Compression Airdrop Configuration
RPC_ENDPOINT=${RPC_ENDPOINT}
PAYER_KEYPAIR=${bs58.encode(payer.secretKey)}
MINT_ADDRESS=${mint.toBase58()}
TOTAL_RECIPIENTS=${TOTAL_RECIPIENTS}
TOKENS_PER_RECIPIENT=${TOKENS_PER_RECIPIENT}
`;
  fs.writeFileSync(".env", envContent);
  console.log(" Saved to .env\n");

  const batchSize = 14;
  const numBatches = Math.ceil(TOTAL_RECIPIENTS / batchSize);
  const solCost = (numBatches * 15_000) / LAMPORTS_PER_SOL;
  console.log("═══════════════════════════════════════════");
  console.log(" Cost Estimate for 1M Address Airdrop");
  console.log("═══════════════════════════════════════════");
  console.log(`Transactions:  ${numBatches.toLocaleString()}`);
  console.log(`Total SOL:     ~${solCost.toFixed(2)} SOL`);
  console.log(`At $150/SOL:   ~$${(solCost * 150).toFixed(2)}`);
  console.log(`\n⚡ Regular SPL: ~${(2_000_000 * TOTAL_RECIPIENTS / LAMPORTS_PER_SOL).toFixed(0)} SOL`);
  console.log(`   ZK Compressed: ~${solCost.toFixed(2)} SOL`);
  console.log("═══════════════════════════════════════════\n");
  console.log("✅ Run the airdrop with: npm run airdrop");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});