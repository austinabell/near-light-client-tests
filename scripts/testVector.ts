import {
  LightClientBlockLiteView,
  LightClientProof,
  NextLightClientBlockResponse,
  ValidatorStakeView,
} from "near-api-js/lib/providers/provider";
import { join } from "path";
import { readdirSync, statSync } from "fs";

export interface BlockTestVector {
  description: string;
  expected: {
    is_valid: boolean;
    error?: string;
  };
  params: {
    previous_block: LightClientBlockLiteView;
    current_bps: ValidatorStakeView[];
    new_block: NextLightClientBlockResponse;
  };
}

export interface ExecutionTestVector {
  description: string;
  expected: {
    is_valid: boolean;
    error?: string;
  };
  params: {
    proof: LightClientProof;
    block_merkle_root: string;
  };
}

export function getAllJsonFiles(dirPath: string): string[] {
  let arrayOfFiles: string[] = [];
  const files = readdirSync(dirPath);

  files.forEach((file) => {
    if (statSync(join(dirPath, file)).isDirectory()) {
      const subDirFiles = getAllJsonFiles(join(dirPath, file));
      arrayOfFiles = arrayOfFiles.concat(subDirFiles);
    } else if (file.endsWith(".json")) {
      arrayOfFiles.push(join(dirPath, file));
    }
  });

  return arrayOfFiles;
}
