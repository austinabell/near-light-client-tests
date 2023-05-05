import bs58 from "bs58";
import { JsonRpcProvider } from "near-api-js/lib/providers";
import { writeFileSync } from "fs";
import { BlockTestVector } from "./testVector";
import { computeBlockHash } from "near-api-js/lib/light-client";
import { LightClientBlockLiteView } from "near-api-js/lib/providers/provider";

async function generateTestVectors(
  startBlock: number,
  endBlock: number,
  fileName: string
): Promise<void> {
  const provider = new JsonRpcProvider({
    url: "https://archival-rpc.mainnet.near.org",
  });
  console.log("generating vectors");

  const testVectors: BlockTestVector[] = [];

  const protocolConfig: any = await provider.experimental_protocolConfig({
    finality: "final",
  });
  console.log("got config");

  // Bit hacky, but retrieves a block from the previous epoch to more easily
  // get the light client data more easily. (RPC is a bit limiting)
  const firstBlock = await provider.block({
    blockId: startBlock - protocolConfig.epoch_length,
  });
  console.log("got a block");

  let prevBlock = await provider.nextLightClientBlock({
    last_block_hash: firstBlock.header.hash,
  });

  while (prevBlock.inner_lite.height < endBlock) {
    console.log("at height: ", prevBlock.inner_lite.height);
    let nextBlock = await provider.nextLightClientBlock({
      last_block_hash: bs58.encode(computeBlockHash(prevBlock)),
    });

    // Only need a subset of the data stored in the vector
    const previous_block: LightClientBlockLiteView = {
      prev_block_hash: prevBlock.prev_block_hash,
      inner_rest_hash: prevBlock.inner_rest_hash,
      inner_lite: prevBlock.inner_lite,
    }

    testVectors.push({
      description: `Mainnet Block ${prevBlock.inner_lite.height}`,
      expected: {
        is_valid: true,
      },
      params: {
        previous_block,
        next_bps: prevBlock.next_bps!,
        new_block: nextBlock,
      },
    });

    prevBlock = nextBlock;
  }

  writeFileSync(fileName, JSON.stringify(testVectors, null, 2));
}

const args = process.argv.slice(2);
if (args.length !== 3) {
  console.error(
    "Usage: ts-node generateBlockTestVectors.ts <start_block> <end_block> <output_file>"
  );
  process.exit(1);
}

const [startBlock, endBlock, fileName] = args;
generateTestVectors(parseInt(startBlock), parseInt(endBlock), fileName).catch(
  (err) => console.error("Failed to generate test vectors:", err)
);
