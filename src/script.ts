import {Keypair, LAMPORTS_PER_SOL} from "@solana/web3.js";
import {createRpc,c} from "@lightprotocol/stateless.js";
import {createMintInterface, createAtaInterface, mintToInterface, getAssociatedTokenAddressInterface} from "@lightprotocol/compressed-token";
import bs58 from "bs58";
import fs from "fs";
import os from "os";
import path from "path";

import "dotenv/config"

console.log(process.env.API_KEY);

const TOTAL_RECIPIENTS = 1_000_000;
const TOKENS_PER_RECIPIENT = 1; // 1 token each
const TOKEN_DECIMALS = 0; // whole tokens only
const TOKEN_SYMBOL = "ZKMAGIC";

// Network: use devnet for free testing, mainnet-beta for real
// Helius supports ZK Compression natively on both networks
const RPC_URL = `https://devnet.helius-rpc.com/?api-key=${process.env.API_KEY!}`;
const connection = createRpc(RPC_URL, RPC_URL, RPC_URL); // pass it three times. I wonder why?

//confirm URL isn't empty at runtime
console.log("RPC_URL:", RPC_URL);

function loadOrCreateKeypair(): Keypair {
  if (process.env.PAYER_KEYPAIR) {
    return Keypair.fromSecretKey(bs58.decode(process.env.PAYER_KEYPAIR));
  }

  const walletPath = path.join(os.homedir(), ".config", "solana", "id.json");
  if (fs.existsSync(walletPath)) {
    const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf8"));
    return Keypair.fromSecretKey(Buffer.from(secretKey));
  }


  console.error("❌ No keypair found. Set PAYER_KEYPAIR in .env or create ~/.config/solana/id.json");
  process.exit(1);
}

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   ZK Compression Airdrop - Setup Mint    ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const payer = loadOrCreateKeypair();
  const rpc = connection;
  
  console.log(`📍 Payer address: ${payer.publicKey.toBase58()}`);
  console.log(`🌐 RPC endpoint: ${RPC_URL}\n`);

  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Payer balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  if (balance < 0.05 * LAMPORTS_PER_SOL) {
    console.log("\n Low balance! For devnet, run:");
    console.log("   solana airdrop 2 --url devnet");
    console.log("   (repeat a few times to get enough SOL)\n");
  }

  // Create compressed token mint
  console.log(" Creating compressed token mint...");
  const mintKeypair = Keypair.generate();

  const { mint, transactionSignature: mintTxSig } = await createMintInterface(
 rpc, payer, payer, null, 9, mintKeypair
);


  console.log(`Mint created: ${mint.toBase58()}`);
  console.log(` Tx: ${mintTxSig}\n`);

  // Create token pool (enables compression)
  // Note: createMint in newer versions may already create the pool
  // This ensures the pool exists
//   console.log(" Setting up token pool for compression...");
//   try {
//     const poolTx = await createTokenPool(
//   connection,
//   payer,
//   mint,
//   undefined,            // confirmOptions (4th)
//   TOKEN_2022_PROGRAM_ID // tokenProgramId (5th)
// );;
//     console.log(` Token pool ready: ${poolTx}\n`);
//   } catch (e: any) {
//     // Pool may already exist if createMint created it
//     if (e.message?.includes("already in use") || e.message?.includes("custom program error: 0x0")) {
//       console.log(" Token pool already exists\n");
//     } else {
//       throw e;
//     }
//   }

  
// Create it
console.log("Creating payer ATA...");
await createAtaInterface(connection, payer, mint, payer.publicKey);
const ataAddress = getAssociatedTokenAddressInterface(mint, payer.publicKey);
console.log(`ATA: ${ataAddress.toBase58()}\n`);

const totalSupply = TOTAL_RECIPIENTS * TOKENS_PER_RECIPIENT;
console.log(`Minting ${totalSupply.toLocaleString()} tokens to payer ATA...`);


// mint to it
const mintToTx = await mintToInterface(
  connection,
  payer,
  mint,
  ataAddress,
  payer,           // mint authority
  BigInt(totalSupply)
);

  console.log(`✅ Minted ${totalSupply.toLocaleString()} ${TOKEN_SYMBOL} tokens`);
  // console.log(`   ATA: ${ata.address.toBase58()}`);
  console.log(`   Tx: ${mintToTx}\n`);

  // Save mint address to .env
const envContent = `# ZK Compression Airdrop Configuration
RPC_ENDPOINT=${RPC_URL}
PAYER_KEYPAIR=${bs58.encode(payer.secretKey)}
MINT_ADDRESS=${mint.toBase58()}
PAYER_ATA=${ataAddress.toBase58()}
TOTAL_RECIPIENTS=${TOTAL_RECIPIENTS}
TOKENS_PER_RECIPIENT=${TOKENS_PER_RECIPIENT}
`;

  fs.writeFileSync(".env", envContent);
  console.log(" Saved configuration to .env\n");

  // Print cost estimate
  console.log("═══════════════════════════════════════════");
  console.log(" Cost Estimate for 1M Address Airdrop");
  console.log("═══════════════════════════════════════════");
  const batchSize = 14; // safe batch size for ZK compressed transfers
  const numBatches = Math.ceil(TOTAL_RECIPIENTS / batchSize);
  const lamportsPerTx = 15_000; // ~15k lamports per compressed tx
  const totalLamports = numBatches * lamportsPerTx;
  const solCost = totalLamports / LAMPORTS_PER_SOL;

  console.log(`Recipients:       ${TOTAL_RECIPIENTS.toLocaleString()}`);
  console.log(`Batch size:       ${batchSize} recipients/tx`);
  console.log(`Transactions:     ${numBatches.toLocaleString()}`);
  console.log(`Cost per tx:      ~${lamportsPerTx.toLocaleString()} lamports`);
  console.log(`Total SOL:        ~${solCost.toFixed(2)} SOL`);
  console.log(`At $150/SOL:      ~$${(solCost * 150).toFixed(2)}`);
  console.log(`At $200/SOL:      ~$${(solCost * 200).toFixed(2)}`);
  console.log(`\n⚡ Compare: Regular SPL tokens would cost ~2000x more!`);
  console.log(`   Regular: ~${(2_000_000 * TOTAL_RECIPIENTS / LAMPORTS_PER_SOL).toFixed(0)} SOL`);
  console.log(`   ZK Compressed: ~${solCost.toFixed(2)} SOL`);
  console.log("═══════════════════════════════════════════\n");

  console.log(" Setup complete! Run the airdrop with:");
  console.log("   npm run airdrop\n");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
