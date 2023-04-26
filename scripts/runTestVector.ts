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
    try {
      lightClient.validateLightClientBlock({
        lastKnownBlock: previous_block,
        currentBlockProducers: next_bps,
        newBlock: new_block,
      });
      console.log(`Test Case ${idx + 1}: PASSED`);
      passed++;
    } catch (error) {
      console.log(`Test Case ${idx + 1}: FAILED - ${error.message}`);
      failed++;
    }
  });

  console.log(`\nSummary: ${passed} PASSED, ${failed} FAILED`);
}

const testVectorsJson = readFileSync("test_vectors.json", "utf-8");
const testVectors = JSON.parse(testVectorsJson) as TestVector[];
runTestVector(testVectors);