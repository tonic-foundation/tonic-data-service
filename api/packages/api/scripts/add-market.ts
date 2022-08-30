/*
Adds market to `market` table in DB. 

Basic usage:
; export POSTGRES_CONNECTION="postgres://..."
; export NEAR_ENV=testnet
; export TONIC_CONTRACT_ID=v1.orderbook.testnet
; yarn add-market \
  --symbol=wbtc/usdc \
  --market_id=d13869e89f6ab651d666a6e95523efd9756858d0b4ce9b53

Will throw error if a market already exists with the given market_id.
Use flag --overwrite to overwrite existing entry in such a case. 

Will always throw error if either token does not exist in the nep_141_token table. 
*/
import { Near } from 'near-api-js';
import { parse } from 'ts-command-line-args';
import { getNearConfig } from '@tonic-foundation/config';
import { Market, Tonic } from '@tonic-foundation/tonic';
import { InMemoryKeyStore } from 'near-api-js/lib/key_stores';
import { getDbConnectConfig } from '../src/config';

const knex = require('knex')(getDbConnectConfig());

const { NEAR_ENV = 'testnet', TONIC_CONTRACT_ID } = process.env;
if (!TONIC_CONTRACT_ID) {
  console.error('Missing TONIC_CONTRACT_ID in env');
  process.exit(1);
}
export interface NewMarketOptions {
  market_id: string;
  symbol: string;
  // base_token_id: string;
  // quote_token_id: string;

  overwrite?: boolean;
}

export const args = parse<NewMarketOptions>({
  market_id: String,
  symbol: String,
  // base_token_id: String,
  // quote_token_id: String,

  overwrite: { type: Boolean, optional: true },
});

interface Token {
  // other fields not important
  decimals: number;
}

async function getMarketById(marketId: string): Promise<[]> {
  return await knex('market').select().where('id', marketId);
}

async function getTokenById(tokenId: string): Promise<Token[]> {
  return await knex('nep_141_token').select().where('id', tokenId);
}

async function addMarket(market: Market): Promise<string> {
  return await knex('market')
    .insert({
      id: args.market_id,
      symbol: args.symbol,
      base_decimals: market.baseDecimals,
      base_lot_size: market.baseLotSize,
      base_token_id: market.baseTokenId,
      quote_decimals: market.quoteDecimals,
      quote_lot_size: market.quoteLotSize,
      quote_token_id: market.quoteTokenId,
    })
    .onConflict('id')
    .merge()
    .catch((err: any) => {
      console.error(`There was an error upserting the "market" table by id:`, err);
      throw err;
    });
}

async function run() {
  const near = new Near({
    ...getNearConfig(NEAR_ENV as any),
    keyStore: new InMemoryKeyStore(),
  });
  const account = await near.account('dontcare');
  const tonic = new Tonic(account, TONIC_CONTRACT_ID as string);

  const chainMarket = await tonic.getMarket(args.market_id);

  const storedMarket = await getMarketById(args.market_id);
  console.log(storedMarket);

  // check whitelisted tokens?
  const base_token = await getTokenById(chainMarket.baseTokenId);
  if (base_token.length == 0) {
    console.error(`Base token ${chainMarket.baseTokenId} not found in nep_141_token table`);
    process.exit(1);
  }
  const quote_token = await getTokenById(chainMarket.quoteTokenId);
  if (quote_token.length == 0) {
    console.error(`Quote token ${chainMarket.quoteTokenId} not found in nep_141_token table`);
    process.exit(1);
  }

  if (!storedMarket.length || args.overwrite) {
    console.log('adding new market to DB');
    await addMarket(chainMarket);
  } else {
    console.log(`market already exists with id=${args.market_id}. Use --overwrite=true to overwrite.`);
  }
}

run().then(() => {
  process.exit(0);
});
