"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateLightClientBlock = exports.BorshBlockHeaderInnerLite = void 0;
const bs58_1 = __importDefault(require("bs58"));
const crypto_1 = __importDefault(require("crypto"));
const enums_1 = require("near-api-js/lib/utils/enums");
const bn_js_1 = require("bn.js");
const serialize_1 = require("near-api-js/lib/utils/serialize");
const utils_1 = require("near-api-js/lib/utils");
const ED_PREFIX = "ed25519:";
class BorshBlockHeaderInnerLite extends enums_1.Assignable {
}
exports.BorshBlockHeaderInnerLite = BorshBlockHeaderInnerLite;
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
// TODO this is probably public endpoint
function validateLightClientBlock(lastKnownBlock, newBlock, blockProducersMap) {
    const innerRestHashDecoded = bs58_1.default.decode(lastKnownBlock.inner_rest_hash);
    const prevHashDecoded = bs58_1.default.decode(lastKnownBlock.prev_block_hash);
    const innerLiteView = lastKnownBlock.inner_lite;
    const innerLite = new BorshBlockHeaderInnerLite({
        height: new bn_js_1.BN(innerLiteView.height),
        epoch_id: bs58_1.default.decode(innerLiteView.epoch_id),
        next_epoch_id: bs58_1.default.decode(innerLiteView.next_epoch_id),
        prev_state_root: bs58_1.default.decode(innerLiteView.prev_state_root),
        outcome_root: bs58_1.default.decode(innerLiteView.outcome_root),
        timestamp: new bn_js_1.BN(innerLiteView.timestamp),
        // TODO could be using timestamp_nanosec. Check if it exists on the JS object in practice
        // timestamp: parseInt(innerLiteView.timestamp_nanosec, 10),
        next_bp_hash: bs58_1.default.decode(innerLiteView.next_bp_hash),
        block_merkle_root: bs58_1.default.decode(innerLiteView.block_merkle_root),
    });
    const newBlockHash = computeBlockHash(innerLite, innerRestHashDecoded, prevHashDecoded);
    const nextBlockHashDecoded = combineHash(bs58_1.default.decode(newBlock.next_block_inner_hash), bs58_1.default.decode(newBlockHash));
    if (newBlock.inner_lite.epoch_id !== lastKnownBlock.inner_lite.epoch_id &&
        newBlock.inner_lite.epoch_id !== lastKnownBlock.inner_lite.next_epoch_id) {
        throw new Error("Validation failed");
    }
    const blockProducers = blockProducersMap[newBlock.inner_lite.epoch_id];
    if (newBlock.approvals_after_next.length !== blockProducers.length) {
        throw new Error("Validation failed");
    }
    let totalStake = 0;
    let approvedStake = 0;
    for (let i = 0; i < newBlock.approvals_after_next.length; i++) {
        const approval = newBlock.approvals_after_next[i];
        const stake = blockProducers[i].stake;
        totalStake += parseInt(stake, 10);
        if (approval === null) {
            continue;
        }
        approvedStake += parseInt(stake, 10);
        const publicKey = utils_1.PublicKey.from(blockProducers[i].public_key);
        const signature = bs58_1.default.decode(approval.slice(ED_PREFIX.length));
        const approvalMessage = new Uint8Array([
            0,
            ...nextBlockHashDecoded,
            newBlock.inner_lite.height + 2,
            0,
            0,
            0,
            0,
            0,
            0,
            // TODO think this is wrong and should be another 0
        ]);
        publicKey.verify(approvalMessage, signature);
    }
    const threshold = (totalStake * 2) / 3;
    if (approvedStake <= threshold) {
        throw new Error("Validation failed");
    }
    if (newBlock.inner_lite.epoch_id === lastKnownBlock.inner_lite.next_epoch_id) {
        if (newBlock.next_bps === null) {
            throw new Error("Validation failed");
        }
        console.log(newBlock.next_bps);
        const serializedNextBp = new Uint8Array([
            newBlock.next_bps.length,
            0,
            0,
            0,
        ]);
        for (const nbp of newBlock.next_bps) {
            const bp = nbp;
            let version = 0;
            if (bp.validator_stake_struct_version) {
                version = parseInt(bp.validator_stake_struct_version.slice(1)) - 1;
                serializedNextBp.set(new Uint8Array([version]), serializedNextBp.length);
            }
            serializedNextBp.set(new Uint8Array([5, 0, 0, 0]), serializedNextBp.length);
            serializedNextBp.set(new TextEncoder().encode(bp.account_id), serializedNextBp.length);
            serializedNextBp.set(new Uint8Array([0]), serializedNextBp.length);
            serializedNextBp.set(bs58_1.default.decode(bp.public_key.slice(ED_PREFIX.length)));
        }
    }
    return true;
}
exports.validateLightClientBlock = validateLightClientBlock;
