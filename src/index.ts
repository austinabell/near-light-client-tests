import bs58 from "bs58";
import crypto from "crypto";
import {
  BlockHeaderInnerLiteView,
  ExecutionOutcomeWithIdView,
  ExecutionStatus,
  ExecutionStatusBasic,
  LightClientBlockLiteView,
  LightClientProof,
  MerklePath,
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

class BorshEmpty extends Assignable {}

class BorshPartialExecutionStatus extends Enum {
  unknown?: BorshEmpty;
  failure?: BorshEmpty;
  successValue?: Uint8Array;
  successReceiptId?: Uint8Array;
}

class BorshPartialExecutionOutcome extends Assignable {
  receiptIds: Uint8Array[];
  gasBurnt: BN;
  tokensBurnt: BN;
  executorId: string;
  status: BorshPartialExecutionStatus;
}

class BorshCryptoHash extends Assignable {
  array: Uint8Array;
}

class BorshCryptoHashes extends Assignable {
  hashes: Uint8Array[];
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
  [
    BorshEmpty,
    {
      kind: "struct",
      fields: [],
    },
  ],
  [
    BorshCryptoHash,
    {
      kind: "struct",
      fields: [["hash", [32]]],
    },
  ],
  [
    BorshCryptoHashes,
    {
      kind: "struct",
      fields: [["hashes", [[32]]]],
    },
  ],
  [
    BorshPartialExecutionStatus,
    {
      kind: "enum",
      field: "enum",
      values: [
        ["unknown", BorshEmpty],
        ["failure", BorshEmpty],
        ["successValue", ["u8"]],
        ["successReceiptId", [32]],
      ],
    },
  ],
  [
    BorshPartialExecutionOutcome,
    {
      kind: "struct",
      fields: [
        ["receiptIds", [[32]]],
        ["gasBurnt", "u64"],
        ["tokensBurnt", "u128"],
        ["executorId", "string"],
        ["status", BorshPartialExecutionStatus],
      ],
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

export function computeBlockHash(block: LightClientBlockLiteView): Buffer {
  const header = block.inner_lite;
  const borshHeader = new BorshBlockHeaderInnerLite({
    height: new BN(header.height),
    epoch_id: bs58.decode(header.epoch_id),
    next_epoch_id: bs58.decode(header.next_epoch_id),
    prev_state_root: bs58.decode(header.prev_state_root),
    outcome_root: bs58.decode(header.outcome_root),
    timestamp: new BN(header.timestamp_nanosec),
    next_bp_hash: bs58.decode(header.next_bp_hash),
    block_merkle_root: bs58.decode(header.block_merkle_root),
  });
  const msg = serialize(SCHEMA, borshHeader);
  const innerRestHash = bs58.decode(block.inner_rest_hash);
  const prevHash = bs58.decode(block.prev_block_hash);
  const innerLiteHash = crypto.createHash("sha256").update(msg).digest();
  const innerHash = combineHash(innerLiteHash, innerRestHash);
  const finalHash = combineHash(innerHash, prevHash);

  return finalHash;
}

export function validateLightClientBlock(
  lastKnownBlock: LightClientBlockLiteView,
  currentBlockProducers: ValidatorStakeView[],
  newBlock: NextLightClientBlockResponse
) {
  // Numbers for each step references the spec:
  // https://github.com/near/NEPs/blob/c7d72138117ed0ab86629a27d1f84e9cce80848f/specs/ChainSpec/LightClient.md
  const newBlockHash = computeBlockHash(lastKnownBlock);
  const nextBlockHashDecoded = combineHash(
    bs58.decode(newBlock.next_block_inner_hash),
    newBlockHash
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

    const approvalEndorsement = serialize(
      SCHEMA,
      new BorshApprovalInner({ endorsement: nextBlockHashDecoded })
    );

    const approvalHeight: BN = new BN(newBlock.inner_lite.height + 2);
    const approvalHeightLe = approvalHeight.toArrayLike(Buffer, "le", 8);
    const approvalMessage = new Uint8Array([
      ...approvalEndorsement,
      ...approvalHeightLe,
    ]);

    publicKey.verify(approvalMessage, signature);
  }

  // (5)
  const threshold = totalStake.mul(new BN(2)).div(new BN(3));
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

function blockHeaderInnerLiteHash(data: BlockHeaderInnerLiteView): Buffer {
  let hash = crypto.createHash("sha256");
  hash.update(new BN(data.height).toArrayLike(Buffer, "le", 8));
  hash.update(bs58.decode(data.epoch_id));
  hash.update(bs58.decode(data.next_epoch_id));
  hash.update(bs58.decode(data.prev_state_root));
  hash.update(bs58.decode(data.outcome_root));
  hash.update(
    new BN(data.timestamp_nanosec || data.timestamp).toArrayLike(
      Buffer,
      "le",
      8
    )
  );
  hash.update(bs58.decode(data.next_bp_hash));
  hash.update(bs58.decode(data.block_merkle_root));
  return hash.digest();
}

function computeRoot(node: Buffer, proof: MerklePath): Buffer {
  proof.forEach((step) => {
    if (step.direction == "Left") {
      node = combineHash(bs58.decode(step.hash), node);
    } else {
      node = combineHash(node, bs58.decode(step.hash));
    }
  });
  return node;
}

function computeMerkleRoot(proof: LightClientProof): Buffer {
  const innerLiteHash = blockHeaderInnerLiteHash(
    proof.block_header_lite.inner_lite
  );

  const headerHash = combineHash(
    combineHash(
      innerLiteHash,
      bs58.decode(proof.block_header_lite.inner_rest_hash)
    ),
    bs58.decode(proof.block_header_lite.prev_block_hash)
  );

  return computeRoot(headerHash, proof.block_proof);
}

function computeOutcomeRoot(
  outcomeWithId: ExecutionOutcomeWithIdView,
  outcomeRootProof: MerklePath
) {
  // Generate outcome proof hash through borsh encoding
  const receiptIds = outcomeWithId.outcome.receipt_ids.map((id) =>
    bs58.decode(id)
  );

  const borshStatus = (
    status: ExecutionStatus | ExecutionStatusBasic
  ): BorshPartialExecutionStatus => {
    if (status === ExecutionStatusBasic.Pending) {
      throw new Error("Pending status is not supported");
    } else if (status === ExecutionStatusBasic.Unknown) {
      return new BorshPartialExecutionStatus({
        unknown: new BorshEmpty({}),
      });
    } else if (status === ExecutionStatusBasic.Failure || "Failure" in status) {
      return new BorshPartialExecutionStatus({
        failure: new BorshEmpty({}),
      });
    } else if (
      status.SuccessValue !== undefined &&
      status.SuccessValue !== null
    ) {
      return new BorshPartialExecutionStatus({
        successValue: Buffer.from(status.SuccessValue, "base64"),
      });
    } else if (
      status.SuccessReceiptId !== undefined &&
      status.SuccessReceiptId !== null
    ) {
      return new BorshPartialExecutionStatus({
        successReceiptId: bs58.decode(status.SuccessReceiptId),
      });
    } else {
      throw new Error(`Unexpected execution status ${status}`);
    }
  };
  const partialExecOutcome: BorshPartialExecutionOutcome =
    new BorshPartialExecutionOutcome({
      receiptIds: receiptIds,
      gasBurnt: new BN(outcomeWithId.outcome.gas_burnt),
      // TODO missing declarations of object types in NAJ
      tokensBurnt: new BN((outcomeWithId.outcome as any).tokens_burnt),
      executorId: (outcomeWithId.outcome as any).executor_id,
      status: borshStatus(outcomeWithId.outcome.status),
    });
  const serializedPartialOutcome = serialize(SCHEMA, partialExecOutcome);
  const partialOutcomeHash = crypto
    .createHash("sha256")
    .update(serializedPartialOutcome)
    .digest();

  const logsHashes: Uint8Array[] = outcomeWithId.outcome.logs.map((log) => {
    return crypto.createHash("sha256").update(log).digest();
  });
  const outcomeHashes: Uint8Array[] = new Array(
    bs58.decode(outcomeWithId.id),
    partialOutcomeHash,
    ...logsHashes
  );

  const outcomeSerialized = serialize(
    SCHEMA,
    new BorshCryptoHashes({ hashes: outcomeHashes })
  );
  const outcomeHash = crypto
    .createHash("sha256")
    .update(outcomeSerialized)
    .digest();

  // Generate shard outcome root
  // computeRoot(sha256(borsh(outcome)), outcome.proof)
  const outcomeShardRoot = computeRoot(outcomeHash, outcomeWithId.proof);

  // Generate block outcome root
  // computeRoot(sha256(borsh(shardOutcomeRoot)), outcomeRootProof)
  const shardRootBorsh = serialize(
    SCHEMA,
    new BorshCryptoHash({ hash: outcomeShardRoot })
  );
  const shardRootHash = crypto
    .createHash("sha256")
    .update(shardRootBorsh)
    .digest();

  return computeRoot(shardRootHash, outcomeRootProof);
}

export function validateExecutionProof(
  proof: LightClientProof,
  merkleRoot: Uint8Array
) {
  // Execution outcome root verification
  const blockOutcomeRoot = computeOutcomeRoot(
    proof.outcome_proof,
    proof.outcome_root_proof
  );
  const proofRoot = proof.block_header_lite.inner_lite.outcome_root;
  if (!blockOutcomeRoot.equals(bs58.decode(proofRoot))) {
    throw new Error(
      `Block outcome root (${bs58.encode(
        blockOutcomeRoot
      )}) doesn't match proof (${proofRoot})}`
    );
  }

  // Block merkle root verification
  const blockMerkleRoot = computeMerkleRoot(proof);
  if (!blockMerkleRoot.equals(merkleRoot)) {
    throw new Error(
      `Block merkle root (${bs58.encode(
        blockMerkleRoot
      )}) doesn't match proof (${bs58.encode(merkleRoot)})}`
    );
  }
}
