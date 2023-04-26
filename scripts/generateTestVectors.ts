import bs58 from "bs58";
import { JsonRpcProvider } from "near-api-js/lib/providers";
import { writeFileSync } from "fs";
import { TestVector } from "./testVector";
import { computeBlockHash } from "near-api-js/lib/light-client";

async function generateTestVectors(
  startBlock: number,
  endBlock: number,
  fileName: string
): Promise<void> {
  const provider = new JsonRpcProvider({
    url: "https://archival-rpc.mainnet.near.org",
  });

  const testVectors: TestVector[] = [];

  const protocolConfig: any = await provider.experimental_protocolConfig({
    finality: "final",
  });

  // Bit hacky, but retrieves a block from the previous epoch to more easily
  // get the light client data more easily. (RPC is a bit limiting)
  const firstBlock = await provider.block({
    blockId: startBlock - protocolConfig.epoch_length,
  });

  let prevBlock = await provider.nextLightClientBlock({
    last_block_hash: firstBlock.header.hash,
  });

  while (prevBlock.inner_lite.height < endBlock) {
    console.log("at height: ", prevBlock.inner_lite.height);
    let nextBlock = await provider.nextLightClientBlock({
      last_block_hash: bs58.encode(computeBlockHash(prevBlock)),
    });

    testVectors.push({
      description: `Mainnet Block ${prevBlock.inner_lite.height}`,
      expected: {
        is_valid: true,
      },
      params: {
        previous_block: prevBlock,
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
    "Usage: ts-node generateTestVectors.ts <start_block> <end_block> <output_file>"
  );
  process.exit(1);
}

const [startBlock, endBlock, fileName] = args;
generateTestVectors(parseInt(startBlock), parseInt(endBlock), fileName).catch(
  (err) => console.error("Failed to generate test vectors:", err)
);
