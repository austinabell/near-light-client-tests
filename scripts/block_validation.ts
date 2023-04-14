import { JsonRpcProvider } from "near-api-js/lib/providers";

async function main() {
  const provider = new JsonRpcProvider({
    url: "https://rpc.mainnet.near.org",
  });

  const stat = await provider.status();

  // Get block in at least the last epoch (epoch duration 43,200 blocks on mainnet and testnet)
  const height = stat.sync_info.latest_block_height;
  const protocolConfig: any = await provider.experimental_protocolConfig({
    finality: "final",
  });

  const prevEpochHeight = height - protocolConfig.epoch_length;
  const prevBlock = await provider.block({ blockId: prevEpochHeight });
  const nextBlock = await provider.nextLightClientBlock({
    last_block_hash: prevBlock.header.hash,
  });
  
  console.log(nextBlock);
}

main();
