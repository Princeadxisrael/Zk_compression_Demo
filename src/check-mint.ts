import "dotenv/config";
import { createRpc } from "@lightprotocol/stateless.js";
import { PublicKey } from "@solana/web3.js";

async function main() {
  const connection = createRpc(
    process.env.RPC_ENDPOINT!,
    process.env.RPC_ENDPOINT!,
    process.env.RPC_ENDPOINT!
  );
  const mint = new PublicKey(process.env.MINT_ADDRESS!);
  const info = await connection.getAccountInfo(mint);
  console.log("Mint owner (token program):", info?.owner.toBase58());
  console.log("TokenkegQ (legacy):", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  console.log("Token2022:          ", "TokenzQdBNbequW8tbBEqQvTqYnx3hecjnQaRMNPNPQ");
}

main().catch(console.error);