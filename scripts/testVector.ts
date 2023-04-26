import {
  LightClientBlockLiteView,
  NextLightClientBlockResponse,
  ValidatorStakeView,
} from "near-api-js/lib/providers/provider";

export interface TestVector {
  description: string;
  expected: {
    is_valid: boolean;
    error?: string;
  };
  params: {
    previous_block: LightClientBlockLiteView;
    next_bps: ValidatorStakeView[];
    new_block: NextLightClientBlockResponse;
  };
}
