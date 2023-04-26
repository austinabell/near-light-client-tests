import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { lightClient } from "near-api-js";
import { TestVector } from "./testVector";

function runTestVectors(testVectors: TestVector[]): void {
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

function getAllJsonFiles(
  dirPath: string,
  arrayOfFiles: string[] = []
): string[] {
  const files = readdirSync(dirPath);

  files.forEach((file) => {
    if (statSync(join(dirPath, file)).isDirectory()) {
      arrayOfFiles = getAllJsonFiles(join(dirPath, file), arrayOfFiles);
    } else if (file.endsWith(".json")) {
      arrayOfFiles.push(join(dirPath, file));
    }
  });

  return arrayOfFiles;
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
    const testVectors = JSON.parse(testVectorsJson) as TestVector[];
    runTestVectors(testVectors);
  });
} else if (flag === "--file") {
  const testVectorsJson = readFileSync(path, "utf-8");
  const testVectors = JSON.parse(testVectorsJson) as TestVector[];
  runTestVectors(testVectors);
} else {
  console.error("Invalid flag. Use --all or --file.");
  process.exit(1);
}
