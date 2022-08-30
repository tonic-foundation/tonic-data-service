## Tonic Data API

Tonic indexed market data API.

## Installation

```
yarn add @tonic-foundation/data-client
```

## Examples

```typescript
(async () => {
  const indexer = new TonicIndexer('https://data-api.mainnet.tonic.foundation');

  // get supported markets
  const markets = await indexer.markets();

  // stream recent trades
  console.log('getting trade stream for market', markets[0].symbol);
  const [stream, stop] = indexer.recentTradeStream(markets[0].id);
  setTimeout(stop, 10_000);
  for await (const trade of stream) {
    console.log(trade);
  }
  console.log('stopped');
})();
```

## Running the data API

Run an instance of the [Tonic indexer](https://github.com/tonic-foundation/tonic-indexer).

Set the following environment variables.

```
# Point to the same DB as the indexer. A read-only user is OK.
export POSTGRES_CONNECTION=postgresql://...
```

<details>
<summary>
Have a self-signed Postgres cert?
</summary>

Base64-encode the cert and set it in the evironment as

```
export POSTGRES_CA_CERT=Ls0tLS1...
```

</details>

Start the API.

```
# build the server
yarn build:all

# run it
yarn api start
{"level":30,"time":1659042446457,"pid":82965,"hostname":"workstation.local","msg":"initialized sentry (env=testnet,samplerate=0.01)"}
🚀  Fastify server running on port 3006
{"level":30,"time":1659042446589,"pid":82965,"hostname":"workstation.local","msg":"Server listening at http://127.0.0.1:3006"}
```

## Listing a market

Set postgres connection details as shown above (write user required)

```bash
# Add tokens used by the market. Tokens only need to be added once.
NEAR_ENV=mainnet yarn api add-token --token_id usn # token ID is contract ID
NEAR_ENV=mainnet yarn api add-token --token_id near # "near" allowed for native near

# Add market. Symbol must be lowercase.
NEAR_ENV=mainnet yarn api add-market --market_id AAGR... --symbol foo/usdc

# Make it visible. Markets are invisible by default.
yarn api set-visibility --symbol foo/usdc --visibility true
```

## Known issues

- Migrations are all in the indexer repo. We'll combine the two repos in the future.
