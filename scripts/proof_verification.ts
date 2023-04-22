import bs58 from "bs58";
import { JsonRpcProvider } from "near-api-js/lib/providers";
import { IdType } from "near-api-js/lib/providers/provider";
import { validateExecutionProof } from "../lib";

async function main() {
  const provider = new JsonRpcProvider({
    url: "https://archival-rpc.mainnet.near.org",
  });

  const stat = await provider.status();

  const block = await provider.block({
    blockId: stat.sync_info.latest_block_height,
  });

  const lightClientHead = block.header.last_final_block;

  // TODO this isn't the block used for the merkle root, track down what is
  const finalBlock = await provider.block({
    blockId: lightClientHead,
  });

  // Static txs pulled from explorer
  const successTxRequest = {
    type: IdType.Transaction,
    light_client_head: lightClientHead,
    transaction_hash: "EjzavEJVd1XjFdAsbgY5itivGpu8Np1AgnHDzFHYvrtW",
    sender_id: "token.sweat",
  };
  const successRecRequest = {
    type: IdType.Receipt,
    light_client_head: lightClientHead,
    receipt_id: "85k7uEHA5zyX29j5QzEGRZxFwmueF2tHhLWfB7WirUNR",
    receiver_id: "token.sweat",
  };
  const failTxRequest = {
    type: IdType.Transaction,
    light_client_head: lightClientHead,
    transaction_hash: "8SQ9bHqWyKJXno4Qha4NAX7sn5h7b5oUbpSSw5vnoAsM",
    sender_id: "app.nearcrowd.near",
  };
  const failRecRequest = {
    type: IdType.Receipt,
    light_client_head: lightClientHead,
    receipt_id: "DGKpHxb5gugdtzV1Ewsmh5TuFMmpVePQ5sr2e3xgSNBG",
    receiver_id: "app.nearcrowd.near",
  };

  const successTxProof = await provider.lightClientProof(successTxRequest);
  //   console.log(JSON.stringify(successTxProof, null, 0));
  validateExecutionProof(
    successTxProof,
    bs58.decode(finalBlock.header.block_merkle_root)
  );
  console.log("validated successTxProof");
  const successRecProof = await provider.lightClientProof(successRecRequest);
  validateExecutionProof(
    successRecProof,
    bs58.decode(finalBlock.header.block_merkle_root)
  );
  console.log("validated successRecProof");
  const failTxProof = await provider.lightClientProof(failTxRequest);
  //   console.log(JSON.stringify(failTxProof, null, 0));
  validateExecutionProof(
    failTxProof,
    bs58.decode(finalBlock.header.block_merkle_root)
  );
  console.log("validated failTxProof");
  const failRecProof = await provider.lightClientProof(failRecRequest);
  validateExecutionProof(
    failRecProof,
    bs58.decode(finalBlock.header.block_merkle_root)
  );
  console.log("validated failRecProof");
}

main();
