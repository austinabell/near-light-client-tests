import bs58 from "bs58";
import { JsonRpcProvider } from "near-api-js/lib/providers";
import {
  computeBlockHash,
  validateLightClientBlock,
} from "near-api-js/lib/light-client";

async function main() {
  const provider = new JsonRpcProvider({
    url: "https://archival-rpc.mainnet.near.org",
  });

  const stat = await provider.status();

  // Get block in at least the last epoch (epoch duration 43,200 blocks on mainnet and testnet)
  const height = stat.sync_info.latest_block_height;
  console.log("current height is " + height);

  let newBlock;
  let lastKnownBlock;

  while (true) {
    try {
      const firstEpochHeight = Math.floor(Math.random() * height - 1);
      console.log("querying for block at height: " + firstEpochHeight);
      const firstBlock = await provider.block({ blockId: firstEpochHeight });
      //   console.log("got block hash: " + firstBlock.header.hash);
      lastKnownBlock = await provider.nextLightClientBlock({
        last_block_hash: firstBlock.header.hash,
      });
      //   console.log("last known: " + prevBlock.inner_lite.height);
      newBlock = await provider.nextLightClientBlock({
        last_block_hash: bs58.encode(computeBlockHash(lastKnownBlock)),
      });
      //   console.log("next block", nextBlock.inner_lite.height);
      if (!lastKnownBlock.next_bps) {
        throw new Error("Rpc should include the next_bps field");
      }

      // This will throw an error if invalid
      validateLightClientBlock({
        lastKnownBlock,
        currentBlockProducers: lastKnownBlock.next_bps,
        newBlock,
      });
      console.log(`validated block at height: ${newBlock.inner_lite.height}`);
    } catch (e) {
      console.warn("error: " + e);
      if (e.toString().includes("DB Not Found Error: BLOCK HEIGHT:")) {
      } else if (
        e.toString().includes("Next block producers hash doesn't match")
      ) {
        console.log("BPS MISMATCH: ", lastKnownBlock.next_bps);
      }
      continue;
    }
  }
}

main();
