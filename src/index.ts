import bs58 from "bs58";
import crypto from "crypto";

const ED_PREFIX: string = "ed25519:";

function combineHash(h1: Uint8Array, h2: Uint8Array): Buffer {
  const hash = crypto.createHash("sha256");
  hash.update(h1);
  hash.update(h2);
  return hash.digest();
}

function computeBlockHash(
  innerLiteView: {
    height: number;
    epoch_id: string;
    next_epoch_id: string;
    prev_state_root: string;
    outcome_root: string;
    timestamp_nanosec: string;
    next_bp_hash: string;
    block_merkle_root: string;
  },
  innerRestHash: string,
  prevHash: string
): string {
  const innerRestHashDecoded = bs58.decode(innerRestHash);
  const prevHashDecoded = bs58.decode(prevHash);

  // TODO pull type from NAJ
  const innerLite = new BlockHeaderInnerLite();
  innerLite.height = innerLiteView.height;
  innerLite.epoch_id = bs58.decode(innerLiteView.epoch_id);
  innerLite.next_epoch_id = bs58.decode(innerLiteView.next_epoch_id);
  innerLite.prev_state_root = bs58.decode(innerLiteView.prev_state_root);
  innerLite.outcome_root = bs58.decode(innerLiteView.outcome_root);
  innerLite.timestamp = parseInt(innerLiteView.timestamp_nanosec, 10);
  innerLite.next_bp_hash = bs58.decode(innerLiteView.next_bp_hash);
  innerLite.block_merkle_root = bs58.decode(innerLiteView.block_merkle_root);

  // TODO use borsh serialization for inner lite
  const msg = new BinarySerializer(inner_lite_schema).serialize(innerLite);
  const innerLiteHash = crypto.createHash("sha256").update(msg).digest();
  const innerHash = combineHash(innerLiteHash, innerRestHashDecoded);
  const finalHash = combineHash(innerHash, prevHashDecoded);

  return bs58.encode(finalHash);
}

function validateLightClientBlock(
  lastKnownBlock: any,
  newBlock: any,
  blockProducersMap: Record<string, any>
): boolean {
  const newBlockHash = computeBlockHash(
    newBlock.inner_lite,
    newBlock.inner_rest_hash,
    newBlock.prev_block_hash
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

    const publicKey = blockProducers[i].public_key;
    const signature = bs58.decode(approval.slice(ED_PREFIX.length));
    // TODO use naj for verify key type
    const verifyKey = nacl.signing.VerifyKey(
      bs58.decode(publicKey.slice(ED_PREFIX.length))
    );

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

    verifyKey.verify(approvalMessage, signature);
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
