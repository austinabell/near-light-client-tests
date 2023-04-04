import bs58 from "bs58";
import crypto from "crypto";
import { LightClientBlockLiteView } from "near-api-js/lib/providers/provider";
import { Assignable } from "near-api-js/lib/utils/enums";
import { BN } from "bn.js";
import { serialize } from "near-api-js/lib/utils/serialize";
import { PublicKey } from "near-api-js/lib/utils";

const ED_PREFIX: string = "ed25519:";

export class BorshBlockHeaderInnerLite extends Assignable {
  // TODO height and timestamp are re-using same types
  height: BN;
  epoch_id: string;
  next_epoch_id: string;
  prev_state_root: string;
  outcome_root: string;
  timestamp: BN;
  next_bp_hash: string;
  block_merkle_root: string;
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
]);

function combineHash(h1: Uint8Array, h2: Uint8Array): Buffer {
  const hash = crypto.createHash("sha256");
  hash.update(h1);
  hash.update(h2);
  return hash.digest();
}

function computeBlockHash(
  header: BorshBlockHeaderInnerLite,
  innerRestHash: Uint8Array,
  prevHash: Uint8Array
): string {
  const msg = serialize(SCHEMA, header);
  const innerLiteHash = crypto.createHash("sha256").update(msg).digest();
  const innerHash = combineHash(innerLiteHash, innerRestHash);
  const finalHash = combineHash(innerHash, prevHash);

  return bs58.encode(finalHash);
}

// TODO this is probably public endpoint
function validateLightClientBlock(
  lastKnownBlock: LightClientBlockLiteView,
  // TODO this block type needed isn't in NAJ. Look into if provider is not done for this
  newBlock: any,
  blockProducersMap: Record<string, any>
): boolean {
  const innerRestHashDecoded = bs58.decode(lastKnownBlock.inner_rest_hash);
  const prevHashDecoded = bs58.decode(lastKnownBlock.prev_block_hash);

  const innerLiteView = lastKnownBlock.inner_lite;
  const innerLite = new BorshBlockHeaderInnerLite({
    height: new BN(innerLiteView.height),
    epoch_id: bs58.decode(innerLiteView.epoch_id),
    next_epoch_id: bs58.decode(innerLiteView.next_epoch_id),
    prev_state_root: bs58.decode(innerLiteView.prev_state_root),
    outcome_root: bs58.decode(innerLiteView.outcome_root),
    timestamp: new BN(innerLiteView.timestamp),
    // TODO could be using timestamp_nanosec. Check if it exists on the JS object in practice
    // timestamp: parseInt(innerLiteView.timestamp_nanosec, 10),
    next_bp_hash: bs58.decode(innerLiteView.next_bp_hash),
    block_merkle_root: bs58.decode(innerLiteView.block_merkle_root),
  });
  const newBlockHash = computeBlockHash(
    innerLite,
    innerRestHashDecoded,
    prevHashDecoded
  );
  const nextBlockHashDecoded = combineHash(
    bs58.decode(newBlock.next_block_inner_hash),
    bs58.decode(newBlockHash)
  );

  if (
    newBlock.inner_lite.epoch_id !== lastKnownBlock.inner_lite.epoch_id &&
    newBlock.inner_lite.epoch_id !== lastKnownBlock.inner_lite.next_epoch_id
  ) {
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

    const publicKey = PublicKey.from(blockProducers[i].public_key);
    const signature = bs58.decode(approval.slice(ED_PREFIX.length));

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

  if (
    newBlock.inner_lite.epoch_id === lastKnownBlock.inner_lite.next_epoch_id
  ) {
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
    for (const bp of newBlock.next_bps) {
      let version = 0;
      if (bp.validator_stake_struct_version) {
        version = parseInt(bp.validator_stake_struct_version.slice(1)) - 1;
        serializedNextBp.set(
          new Uint8Array([version]),
          serializedNextBp.length
        );
      }
      serializedNextBp.set(
        new Uint8Array([5, 0, 0, 0]),
        serializedNextBp.length
      );
      serializedNextBp.set(
        new TextEncoder().encode(bp.account_id),
        serializedNextBp.length
      );
      serializedNextBp.set(new Uint8Array([0]), serializedNextBp.length);
      serializedNextBp.set(bs58.decode(bp.public_key.slice(ED_PREFIX.length)));
    }
  }
  return true;
}
