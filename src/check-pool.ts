import "dotenv/config";
import { createRpc } from "@lightprotocol/stateless.js";
import { getSplInterfaceInfos } from "@lightprotocol/compressed-token";
import { PublicKey } from "@solana/web3.js";

async function main() {
  const connection = createRpc(
    process.env.RPC_ENDPOINT!,
    process.env.RPC_ENDPOINT!,
    process.env.RPC_ENDPOINT!
  );
  const mint = new PublicKey(process.env.MINT_ADDRESS!);

  console.log("Checking SPL interface for mint:", mint.toBase58());
  const infos = await getSplInterfaceInfos(connection, mint);
  console.log("SPL interface infos:", JSON.stringify(infos, null, 2));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});