import bs58 from "bs58";
import crypto from "crypto";
import {
  LightClientBlockLiteView,
  NextLightClientBlockResponse,
  ValidatorStakeView,
} from "near-api-js/lib/providers/provider";
import { Assignable, Enum } from "near-api-js/lib/utils/enums";
import { BN } from "bn.js";
import { serialize } from "near-api-js/lib/utils/serialize";
import { PublicKey } from "near-api-js/lib/utils";

const ED_PREFIX: string = "ed25519:";

class BorshBlockHeaderInnerLite extends Assignable {
  height: BN;
  epoch_id: Uint8Array;
  next_epoch_id: Uint8Array;
  prev_state_root: Uint8Array;
  outcome_root: Uint8Array;
  timestamp: BN;
  next_bp_hash: Uint8Array;
  block_merkle_root: Uint8Array;
}

class BorshApprovalInner extends Enum {
  // TODO NAJ doesn't have enum values as optional, figure out why
  endorsement?: Uint8Array;
  skip?: BN;
}

class BorshValidatorStakeViewV1 extends Assignable {
  account_id: string;
  public_key: PublicKey;
  stake: BN;
}

class BorshValidatorStakeView extends Enum {
  v1?: BorshValidatorStakeViewV1;
}

class BorshValidatorStakeViewWrapper extends Assignable {
  bps: BorshValidatorStakeView[];
}

// TODO when merging into NAJ, this likely gets combined with their SCHEMA
type Class<T = any> = new (...args: any[]) => T;
const SCHEMA = new Map<Class, any>([
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
        ["public_key", PublicKey],
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
    PublicKey,
    {
      kind: "struct",
      fields: [
        ["keyType", "u8"],
        ["data", [32]],
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

export function validateLightClientBlock(
  lastKnownBlock: LightClientBlockLiteView,
  // TODO this might be a bit awkward to use, don't want to infer storage of epoch to bps mapping
  currentBlockProducers: ValidatorStakeView[],
  newBlock: NextLightClientBlockResponse
) {
  // Numbers for each step references the spec:
  // https://github.com/near/NEPs/blob/c7d72138117ed0ab86629a27d1f84e9cce80848f/specs/ChainSpec/LightClient.md
  const innerRestHashDecoded = bs58.decode(lastKnownBlock.inner_rest_hash);
  const prevHashDecoded = bs58.decode(lastKnownBlock.prev_block_hash);

  // TODO workaround until updated for added nanosec type
  const innerLiteView = lastKnownBlock.inner_lite as any;

  const innerLite = new BorshBlockHeaderInnerLite({
    height: new BN(innerLiteView.height),
    epoch_id: bs58.decode(innerLiteView.epoch_id),
    next_epoch_id: bs58.decode(innerLiteView.next_epoch_id),
    prev_state_root: bs58.decode(innerLiteView.prev_state_root),
    outcome_root: bs58.decode(innerLiteView.outcome_root),
    timestamp: new BN(innerLiteView.timestamp_nanosec),
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

  // (1)
  if (newBlock.inner_lite.height <= lastKnownBlock.inner_lite.height) {
    throw new Error(
      "New block must be at least the height of the last known block"
    );
  }

  // (2)
  if (
    newBlock.inner_lite.epoch_id !== lastKnownBlock.inner_lite.epoch_id &&
    newBlock.inner_lite.epoch_id !== lastKnownBlock.inner_lite.next_epoch_id
  ) {
    throw new Error(
      "New block must either be in the same epoch or the next epoch from the last known block"
    );
  }

  const blockProducers: ValidatorStakeView[] = currentBlockProducers;
  if (newBlock.approvals_after_next.length < blockProducers.length) {
    throw new Error(
      "Number of approvals for next epoch must be at least the number of current block producers"
    );
  }

  // (4) and (5)
  let totalStake = new BN(0);
  let approvedStake = new BN(0);

  for (let i = 0; i < blockProducers.length; i++) {
    const approval = newBlock.approvals_after_next[i];
    const stake = blockProducers[i].stake;

    totalStake.iadd(new BN(stake));

    if (approval === null) {
      continue;
    }

    approvedStake.iadd(new BN(stake));

    const publicKey = PublicKey.fromString(blockProducers[i].public_key);
    const signature = bs58.decode(approval.slice(ED_PREFIX.length));

    // TODO replace this manual borsh encoding with borsh utils
    const approvalEndorsement = serialize(
      SCHEMA,
      new BorshApprovalInner({ endorsement: nextBlockHashDecoded })
    );

    const approvalHeight: BN = new BN(newBlock.inner_lite.height + 2);
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
  if (
    newBlock.inner_lite.epoch_id === lastKnownBlock.inner_lite.next_epoch_id
  ) {
    // (3)
    if (!newBlock.next_bps) {
      throw new Error(
        "New block must include next block producers if a new epoch starts"
      );
    }

    const borshBps: BorshValidatorStakeView[] = newBlock.next_bps.map((bp) => {
      if (bp.validator_stake_struct_version) {
        const version = parseInt(bp.validator_stake_struct_version.slice(1));
        if (version !== 1) {
          throw new Error(
            "Only version 1 of the validator stake struct is supported"
          );
        }
      }
      return new BorshValidatorStakeView({
        v1: new BorshValidatorStakeViewV1({
          account_id: bp.account_id,
          public_key: PublicKey.fromString(bp.public_key),
          stake: bp.stake,
        }),
      });
    });
    const serializedBps = serialize(
      SCHEMA,
      // NOTE: just wrapping because borsh-js requires this type to be in the schema for some reason
      new BorshValidatorStakeViewWrapper({ bps: borshBps })
    );
    const bpsHash = crypto.createHash("sha256").update(serializedBps).digest();

    if (!bpsHash.equals(bs58.decode(newBlock.inner_lite.next_bp_hash))) {
      throw new Error("Next block producers hash doesn't match");
    }
  }
}
