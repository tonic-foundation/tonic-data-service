[tonic-site]: https://tonic.foundation
[diesel-cli]: https://github.com/diesel-rs/diesel/tree/master/diesel_cli
[aws-cli]: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
[running-a-node]: https://near-nodes.io/validator/compile-and-run-a-node#testnet
[near-lake]: https://github.com/near/near-lake-framework-rs
[tonic-deploy-block]: https://nearblocks.io/txns/3nQNWkwAK4hRydDM9i9AQUEABRgHoXvvczkWbGPiNaCY

# Tonic DEX Indexer

Example indexer using the [NEAR Lake Framework][near-lake] for saving trade data
from [Tonic][tonic-site].

## Developing

**Prerequisites**

- a working [Rust installation](https://rustup.rs/)
- a Postgres instance that you control
  - Docker users: a compose file is included in the repo
- the [Diesel CLI][diesel-cli] (`cargo install diesel_cli --no-default-features --features postgres`)
- an AWS account with permission to fetch from the NEAR lake S3 bucket

<details>
<summary>Required IAM permissions</summary>

At a minimum, you need the following permissions

```
GetBucketLocation
ListBucket
GetObject
```

on the following resources

```
arn:aws:s3:::near-lake-data-mainnet
arn:aws:s3:::near-lake-data-mainnet/*
```

A basic policy would be

```terraform
data "aws_iam_policy_document" "near_lake_reader_policy" {
  statement {
    sid = "AllowReadNearLakeBucket"

    actions = [
      "s3:GetBucketLocation",
      "s3:ListBucket",
      "s3:GetObject",
    ]

    resources = [
      "arn:aws:s3:::near-lake-data-mainnet",
      "arn:aws:s3:::near-lake-data-mainnet/*"
    ]
  }
}

resource "aws_iam_policy" "near_lake_reader_policy" {
  name        = "near-lake-reader-policy"
  description = "Allow access to the NEAR Lake S3 bucket"
  policy      = data.aws_iam_policy_document.near_lake_reader_policy.json
}
```

</details>

**Set required environment variables**

```bash
export DATABASE_URL=postgres://postgres:test@localhost:5432/postgres
export TONIC_CONTRACT_ID=v1.orderbook.near
```

**(Docker users only): Start dev postgres container**

```
docker compose up -d
```

**Run migrations**

```
diesel migration run
```

**Run indexer**

When the indexer starts, it will check the database for the latest processed
block number. If none is found, it starts from block 0. You can pass the
`--from-blockheight` flag to start at a specific block. The official Tonic
contract was [deployed in block 66,296,455][tonic-deploy-block].

```bash
# if you have Just
just run --from-blockheight 66296455

# or
cargo run --release -- run --contract-ids $TONIC_CONTRACT_ID --from-blockheight 66296455
```

For all future runs, the flag can be omitted

```bash
# if you have Just
just run

# or
cargo run --release -- run --contract-ids $TONIC_CONTRACT_ID
```
