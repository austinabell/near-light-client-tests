import { readFileSync } from "fs";
import { lightClient } from "near-api-js";
import { BlockTestVector, getAllJsonFiles } from "./testVector";

function runTestVectors(testVectors: BlockTestVector[]): void {
  let passed = 0;
  let failed = 0;

  testVectors.forEach((test, idx) => {
    const {
      description,
      params: { previous_block, current_bps, new_block },
      expected: { is_valid, error },
    } = test;
    let wasValid: boolean;
    let executionError: Error | undefined;
    try {
      lightClient.validateLightClientBlock({
        lastKnownBlock: previous_block,
        currentBlockProducers: current_bps,
        newBlock: new_block,
      });
      wasValid = true;
    } catch (error) {
      wasValid = false;
      executionError = error;
    }
    if (wasValid !== is_valid) {
      const prefix = `Test Case at index ${idx} "${description}": FAILED - expected`;
      console.log(
        `${prefix} ${
          is_valid
            ? `valid, got error ${executionError}`
            : `invalid result${error ? ` with error "${error}"` : ""}`
        }`
      );
      failed++;
    } else {
      console.log(`Test Case ${idx}: PASSED`);
      passed++;
    }
  });

  console.log(`\nSummary: ${passed} PASSED, ${failed} FAILED`);
}

const args = process.argv.slice(2);
if (args.length !== 1 && args.length !== 2) {
  console.error(
    "Usage: ts-node runBlockTestVectors.ts (--all <directory> | --file <file_path>)"
  );
  process.exit(1);
}

const [flag, path] = args;

if (flag === "--all") {
  const jsonFiles = getAllJsonFiles("./test-vectors/blocks");
  jsonFiles.forEach((file) => {
    console.log("\n\tTesting file: ", file);
    const testVectorsJson = readFileSync(file, "utf-8");
    const testVectors = JSON.parse(testVectorsJson) as BlockTestVector[];
    runTestVectors(testVectors);
  });
} else if (flag === "--file") {
  const testVectorsJson = readFileSync(path, "utf-8");
  const testVectors = JSON.parse(testVectorsJson) as BlockTestVector[];
  runTestVectors(testVectors);
} else {
  console.error("Invalid flag. Use --all or --file.");
  process.exit(1);
}
