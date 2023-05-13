# near-light-client-tests

This serves as the testing framework for [NEAR light client TS verification implementation](https://github.com/near/near-api-js/pull/1116).

This contains the following:

- Scripts to validate logic against mainnet (either random sampling or most recent blocks):

```
npx ts-node ./scripts/blockValidation
npx ts-node ./scripts/blockValidationRandom
npx ts-node ./scripts/blockValidation
```

- Scripts to generate and manipulate on-chain data for test vectors:

```
# Scrape and generate test vectors in a range
npx ts-node generateBlockTestVectors.ts <start_block> <end_block> <output_file>
npx ts-node runBlockTestVectors.ts (--all <directory> | --file <file_path>)

# Run execution test vectors
npx ts-node runExecutionTestVectors.ts (--all <directory> | --file <file_path>)

# Clean and remove redundant data from RPC response JSON (not needed if using generation above)
npx ts-node cleanBlockVector.ts <file_path>
```

- JSON test vectors, comprised of a mix of scraped real data and manually generated test vectors for different conditions

[./test-vectors](https://github.com/austinabell/near-light-client-tests/tree/main/test-vectors)

> Note: the scripts that use the NAJ implementation PR above requires a local built monorepo. Until that PR has been pulled in, NAJ doesn't have support for using it as a git dependency