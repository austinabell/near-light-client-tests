import { readFileSync } from "fs";
import { lightClient } from "near-api-js";
import { TestVector } from "./testVector";

function runTestVector(testVectors: TestVector[]): void {
  let passed = 0;
  let failed = 0;

  testVectors.forEach((test, idx) => {
    const {
      description,
      params: { previous_block, next_bps, new_block },
      expected: { is_valid, error },
    } = test;
    let wasValid: boolean;
    try {
      lightClient.validateLightClientBlock({
        lastKnownBlock: previous_block,
        currentBlockProducers: next_bps,
        newBlock: new_block,
      });
      wasValid = true;
    } catch (error) {
      wasValid = false;
    }
    if (wasValid !== is_valid) {
      console.log(
        `Test Case at index ${idx} "${description}": FAILED - expected ${
          is_valid ? "valid" : "invalid"
        } result${error ? ` with error "${error}"` : ""}`
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
if (args.length !== 1) {
  console.error(
    "Usage: ts-node runTestVector.ts <input_file>"
  );
  process.exit(1);
}

const [fileName] = args;
const testVectorsJson = readFileSync(fileName, "utf-8");
const testVectors = JSON.parse(testVectorsJson) as TestVector[];
runTestVector(testVectors);
