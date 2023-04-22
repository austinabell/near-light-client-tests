/// <reference types="node" />
import { LightClientBlockLiteView, LightClientProof, NextLightClientBlockResponse, ValidatorStakeView } from "near-api-js/lib/providers/provider";
export declare function computeBlockHash(block: LightClientBlockLiteView): Buffer;
export declare function validateLightClientBlock(lastKnownBlock: LightClientBlockLiteView, currentBlockProducers: ValidatorStakeView[], newBlock: NextLightClientBlockResponse): void;
export declare function validateExecutionProof(proof: LightClientProof, merkleRoot: Uint8Array): void;
