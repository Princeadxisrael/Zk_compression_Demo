
import "dotenv/config";
import { createRpc } from "@lightprotocol/stateless.js";
import { createSplInterface } from "@lightprotocol/compressed-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";

async function main() {
  const connection = createRpc(
    process.env.RPC_ENDPOINT,
    process.env.RPC_ENDPOINT,
    process.env.RPC_ENDPOINT
  );
  const payer = Keypair.fromSecretKey(bs58.decode(process.env.PAYER_KEYPAIR!));
  const mint = new PublicKey(process.env.MINT_ADDRESS!);

  console.log("Creating SPL interface for mint:", mint.toBase58());
  const tx = await createSplInterface(
    connection,
    payer,
    mint,
    undefined,           // confirmOptions
    TOKEN_2022_PROGRAM_ID  // must match the mint's token program
  );
  console.log("Done! Tx:", tx);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
