import bs58 from "bs58";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { lightClient } from "near-api-js";
import { ExecutionTestVector } from "./testVector";

function runTestVectors(testVectors: ExecutionTestVector[]): void {
  let passed = 0;
  let failed = 0;

  testVectors.forEach((test, idx) => {
    const {
      description,
      params: { proof, block_merkle_root },
      expected: { is_valid, error },
    } = test;
    let wasValid: boolean;
    let executionError: Error | undefined;
    try {
      lightClient.validateExecutionProof({
        proof,
        blockMerkleRoot: bs58.decode(block_merkle_root),
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
    "Usage: ts-node runExecutionTestVectors.ts (--all <directory> | --file <file_path>)"
  );
  process.exit(1);
}

const [flag, path] = args;

if (flag === "--all") {
  const jsonFiles = getAllJsonFiles("./test-vectors/executions");
  jsonFiles.forEach((file) => {
    console.log("\n\tTesting file: ", file);
    const testVectorsJson = readFileSync(file, "utf-8");
    const testVectors = JSON.parse(testVectorsJson) as ExecutionTestVector[];
    runTestVectors(testVectors);
  });
} else if (flag === "--file") {
  const testVectorsJson = readFileSync(path, "utf-8");
  const testVectors = JSON.parse(testVectorsJson) as ExecutionTestVector[];
  runTestVectors(testVectors);
} else {
  console.error("Invalid flag. Use --all or --file.");
  process.exit(1);
}
