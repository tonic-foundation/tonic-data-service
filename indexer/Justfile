# show help
default:
	just --list

# build release
build:
	cargo build --release

# run clippy
lint:
    cargo clippy

# run on mainnet
run *ARGS:
    #!/bin/bash
    source scripts/prelude

    require_env TONIC_CONTRACT_ID

    cargo run --release -- run --contract-ids $TONIC_CONTRACT_ID {{ARGS}}
