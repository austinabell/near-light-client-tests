import { LightClientBlockLiteView, NextLightClientBlockResponse } from "near-api-js/lib/providers/provider";
import { Assignable } from "near-api-js/lib/utils/enums";
import { BN } from "bn.js";
export declare class BorshBlockHeaderInnerLite extends Assignable {
    height: BN;
    epoch_id: string;
    next_epoch_id: string;
    prev_state_root: string;
    outcome_root: string;
    timestamp: BN;
    next_bp_hash: string;
    block_merkle_root: string;
}
export declare function validateLightClientBlock(lastKnownBlock: LightClientBlockLiteView, newBlock: NextLightClientBlockResponse, blockProducersMap: Record<string, any>): boolean;
