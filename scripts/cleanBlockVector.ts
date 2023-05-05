import { readFileSync, writeFileSync } from "fs";
import { LightClientBlockLiteView } from "near-api-js/lib/providers/provider";
import { BlockTestVector } from "./testVector";

function cleanTestVector(testVector: BlockTestVector): BlockTestVector {
  const {
    previous_block: { prev_block_hash, inner_rest_hash, inner_lite },
  } = testVector.params;

  const cleanedPreviousBlock: LightClientBlockLiteView = {
    prev_block_hash,
    inner_rest_hash,
    inner_lite,
  };

  testVector.params.previous_block = cleanedPreviousBlock;

  return testVector;
}

const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error("Usage: ts-node cleanTestVectors.ts <file_path>");
  process.exit(1);
}

const filePath = args[0];
const testVectorsJson = readFileSync(filePath, "utf-8");
const testVectors = JSON.parse(testVectorsJson) as BlockTestVector[];

const cleanedTestVectors = testVectors.map(cleanTestVector);
const cleanedTestVectorsJson = JSON.stringify(cleanedTestVectors, null, 2);

writeFileSync(filePath, cleanedTestVectorsJson);