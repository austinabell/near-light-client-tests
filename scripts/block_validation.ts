import { JsonRpcProvider } from "near-api-js/lib/providers";
import { validateLightClientBlock } from "../lib";

async function main() {
  const provider = new JsonRpcProvider({
    url: "https://archival-rpc.mainnet.near.org",
  });

  const stat = await provider.status();

  // Get block in at least the last epoch (epoch duration 43,200 blocks on mainnet and testnet)
  const height = stat.sync_info.latest_block_height;
  console.log("current height is " + height);
  const protocolConfig: any = await provider.experimental_protocolConfig({
    finality: "final",
  });

  // Get a block from 8 epochs back
  const firstEpochHeight = height - protocolConfig.epoch_length * 40;
  const firstBlock = await provider.block({ blockId: firstEpochHeight });
  let prevBlock = await provider.nextLightClientBlock({
    last_block_hash: firstBlock.header.hash,
  });
  let nextBlock = await provider.nextLightClientBlock({
    // TODO using prev block hash for convenience. Maybe there is a better way around this?
    last_block_hash: prevBlock.prev_block_hash,
  });

  while (
    nextBlock &&
    nextBlock.inner_lite.height > prevBlock.inner_lite.height
  ) {
    if (!prevBlock.next_bps) {
      throw new Error("Rpc should include the next_bps field");
    }

    // This will throw an error if invalid
    validateLightClientBlock(prevBlock, prevBlock.next_bps, nextBlock);
    console.log(`validated block at height: ${nextBlock.inner_lite.height}`);

    prevBlock = nextBlock;
    nextBlock = await provider.nextLightClientBlock({
      last_block_hash: prevBlock.prev_block_hash,
    });
  }
}

main();
