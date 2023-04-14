import { LightClientBlockLiteView, NextLightClientBlockResponse, ValidatorStakeView } from "near-api-js/lib/providers/provider";
export declare function validateLightClientBlock(lastKnownBlock: LightClientBlockLiteView, currentBlockProducers: ValidatorStakeView[], newBlock: NextLightClientBlockResponse): boolean;
