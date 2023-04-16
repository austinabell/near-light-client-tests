"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateLightClientBlock = void 0;
const bs58_1 = __importDefault(require("bs58"));
const crypto_1 = __importDefault(require("crypto"));
const enums_1 = require("near-api-js/lib/utils/enums");
const bn_js_1 = require("bn.js");
const serialize_1 = require("near-api-js/lib/utils/serialize");
const utils_1 = require("near-api-js/lib/utils");
const ED_PREFIX = "ed25519:";
class BorshBlockHeaderInnerLite extends enums_1.Assignable {
}
class BorshApprovalInner extends enums_1.Enum {
}
class BorshValidatorStakeViewV1 extends enums_1.Assignable {
}
class BorshValidatorStakeView extends enums_1.Enum {
}
class BorshValidatorStakeViewWrapper extends enums_1.Assignable {
}
const SCHEMA = new Map([
    [
        BorshBlockHeaderInnerLite,
        {
            kind: "struct",
            fields: [
                ["height", "u64"],
                ["epoch_id", [32]],
                ["next_epoch_id", [32]],
                ["prev_state_root", [32]],
                ["outcome_root", [32]],
                ["timestamp", "u64"],
                ["next_bp_hash", [32]],
                ["block_merkle_root", [32]],
            ],
        },
    ],
    [
        BorshApprovalInner,
        {
            kind: "enum",
            field: "enum",
            values: [
                ["endorsement", [32]],
                ["skip", "u64"],
            ],
        },
    ],
    [
        BorshValidatorStakeViewV1,
        {
            kind: "struct",
            fields: [
                ["account_id", "string"],
                ["public_key", utils_1.PublicKey],
                ["stake", "u128"],
            ],
        },
    ],
    [
        BorshValidatorStakeView,
        {
            kind: "enum",
            field: "enum",
            values: [["v1", BorshValidatorStakeViewV1]],
        },
    ],
    [
        BorshValidatorStakeViewWrapper,
        {
            kind: "struct",
            fields: [["bps", [BorshValidatorStakeView]]],
        },
    ],
    // TODO this is a duplicate from naj
    [
        utils_1.PublicKey,
        {
            kind: "struct",
            fields: [
                ["keyType", "u8"],
                ["data", [32]],
            ],
        },
    ],
]);
function combineHash(h1, h2) {
    const hash = crypto_1.default.createHash("sha256");
    hash.update(h1);
    hash.update(h2);
    return hash.digest();
}
function computeBlockHash(header, innerRestHash, prevHash) {
    const msg = (0, serialize_1.serialize)(SCHEMA, header);
    const innerLiteHash = crypto_1.default.createHash("sha256").update(msg).digest();
    const innerHash = combineHash(innerLiteHash, innerRestHash);
    const finalHash = combineHash(innerHash, prevHash);
    return bs58_1.default.encode(finalHash);
}
function validateLightClientBlock(lastKnownBlock, 
// TODO this might be a bit awkward to use, don't want to infer storage of epoch to bps mapping
currentBlockProducers, newBlock) {
    // Numbers for each step references the spec:
    // https://github.com/near/NEPs/blob/c7d72138117ed0ab86629a27d1f84e9cce80848f/specs/ChainSpec/LightClient.md
    const innerRestHashDecoded = bs58_1.default.decode(lastKnownBlock.inner_rest_hash);
    const prevHashDecoded = bs58_1.default.decode(lastKnownBlock.prev_block_hash);
    // TODO workaround until updated for added nanosec type
    const innerLiteView = lastKnownBlock.inner_lite;
    const innerLite = new BorshBlockHeaderInnerLite({
        height: new bn_js_1.BN(innerLiteView.height),
        epoch_id: bs58_1.default.decode(innerLiteView.epoch_id),
        next_epoch_id: bs58_1.default.decode(innerLiteView.next_epoch_id),
        prev_state_root: bs58_1.default.decode(innerLiteView.prev_state_root),
        outcome_root: bs58_1.default.decode(innerLiteView.outcome_root),
        timestamp: new bn_js_1.BN(innerLiteView.timestamp_nanosec),
        next_bp_hash: bs58_1.default.decode(innerLiteView.next_bp_hash),
        block_merkle_root: bs58_1.default.decode(innerLiteView.block_merkle_root),
    });
    const newBlockHash = computeBlockHash(innerLite, innerRestHashDecoded, prevHashDecoded);
    const nextBlockHashDecoded = combineHash(bs58_1.default.decode(newBlock.next_block_inner_hash), bs58_1.default.decode(newBlockHash));
    // (1)
    if (newBlock.inner_lite.height <= lastKnownBlock.inner_lite.height) {
        throw new Error("New block must be at least the height of the last known block");
    }
    // (2)
    if (newBlock.inner_lite.epoch_id !== lastKnownBlock.inner_lite.epoch_id &&
        newBlock.inner_lite.epoch_id !== lastKnownBlock.inner_lite.next_epoch_id) {
        throw new Error("New block must either be in the same epoch or the next epoch from the last known block");
    }
    const blockProducers = currentBlockProducers;
    if (newBlock.approvals_after_next.length < blockProducers.length) {
        throw new Error("Number of approvals for next epoch must be at least the number of current block producers");
    }
    // (4) and (5)
    let totalStake = new bn_js_1.BN(0);
    let approvedStake = new bn_js_1.BN(0);
    for (let i = 0; i < blockProducers.length; i++) {
        const approval = newBlock.approvals_after_next[i];
        const stake = blockProducers[i].stake;
        totalStake.iadd(new bn_js_1.BN(stake));
        if (approval === null) {
            continue;
        }
        approvedStake.iadd(new bn_js_1.BN(stake));
        const publicKey = utils_1.PublicKey.fromString(blockProducers[i].public_key);
        const signature = bs58_1.default.decode(approval.slice(ED_PREFIX.length));
        // TODO replace this manual borsh encoding with borsh utils
        const approvalEndorsement = (0, serialize_1.serialize)(SCHEMA, new BorshApprovalInner({ endorsement: nextBlockHashDecoded }));
        const approvalHeight = new bn_js_1.BN(newBlock.inner_lite.height + 2);
        const approvalHeightLe = approvalHeight.toArrayLike(Uint8Array, "le", 8);
        const approvalMessage = new Uint8Array([
            ...approvalEndorsement,
            ...approvalHeightLe,
        ]);
        publicKey.verify(approvalMessage, signature);
    }
    // (5)
    const threshold = (totalStake * 2) / 3;
    if (approvedStake <= threshold) {
        throw new Error("Approved stake does not exceed the 2/3 threshold");
    }
    // (6)
    if (newBlock.inner_lite.epoch_id === lastKnownBlock.inner_lite.next_epoch_id) {
        // (3)
        if (!newBlock.next_bps) {
            throw new Error("New block must include next block producers if a new epoch starts");
        }
        // TODO this type is missing this version field, this may be broken if NAJ discards the field
        const bps = newBlock.next_bps;
        const borshBps = bps.map((bp) => {
            if (bp.validator_stake_struct_version) {
                const version = parseInt(bp.validator_stake_struct_version.slice(1));
                if (version !== 1) {
                    throw new Error("Only version 1 of the validator stake struct is supported");
                }
            }
            return new BorshValidatorStakeView({
                v1: new BorshValidatorStakeViewV1({
                    account_id: bp.account_id,
                    public_key: utils_1.PublicKey.fromString(bp.public_key),
                    stake: bp.stake,
                }),
            });
        });
        const serializedBps = (0, serialize_1.serialize)(SCHEMA, 
        // NOTE: just wrapping because borsh-js requires this type to be in the schema for some reason
        new BorshValidatorStakeViewWrapper({ bps: borshBps }));
        const bpsHash = crypto_1.default.createHash("sha256").update(serializedBps).digest();
        if (!bpsHash.equals(bs58_1.default.decode(newBlock.inner_lite.next_bp_hash))) {
            throw new Error("Next block producers hash doesn't match");
        }
    }
}
exports.validateLightClientBlock = validateLightClientBlock;
