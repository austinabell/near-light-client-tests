import {
  LightClientBlockLiteView,
  LightClientProof,
  NextLightClientBlockResponse,
  ValidatorStakeView,
} from "near-api-js/lib/providers/provider";

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
  }
}