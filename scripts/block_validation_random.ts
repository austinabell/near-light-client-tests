import bs58 from "bs58";
import { JsonRpcProvider } from "near-api-js/lib/providers";
import { computeBlockHash, validateLightClientBlock } from "../lib";

async function main() {
  const provider = new JsonRpcProvider({
    url: "https://archival-rpc.mainnet.near.org",
  });

  const stat = await provider.status();

  // Get block in at least the last epoch (epoch duration 43,200 blocks on mainnet and testnet)
  const height = stat.sync_info.latest_block_height;
  console.log("current height is " + height);

  let nextBlock;
  let prevBlock;

  while (true) {
    try {
      const firstEpochHeight = Math.floor(Math.random() * height - 1);
      console.log("querying for block at height: " + firstEpochHeight);
      const firstBlock = await provider.block({ blockId: firstEpochHeight });
      //   console.log("got block hash: " + firstBlock.header.hash);
      prevBlock = await provider.nextLightClientBlock({
        last_block_hash: firstBlock.header.hash,
      });
      //   console.log("last known: " + prevBlock.inner_lite.height);
      nextBlock = await provider.nextLightClientBlock({
        last_block_hash: bs58.encode(computeBlockHash(prevBlock)),
      });
      //   console.log("next block", nextBlock.inner_lite.height);
      if (!prevBlock.next_bps) {
        throw new Error("Rpc should include the next_bps field");
      }

      // This will throw an error if invalid
      validateLightClientBlock(prevBlock, prevBlock.next_bps, nextBlock);
      console.log(`validated block at height: ${nextBlock.inner_lite.height}`);
    } catch (e) {
      console.warn("error: " + e);
      if (e.toString().includes("DB Not Found Error: BLOCK HEIGHT:")) {
      } else if (
        e.toString().includes("Next block producers hash doesn't match")
      ) {
        console.log("BPS MISMATCH: ", prevBlock.next_bps);
      }
      continue;
    }
  }
}

main();
