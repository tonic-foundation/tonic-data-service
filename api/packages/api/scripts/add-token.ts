/*
Adds token to `nep_141_token` table in DB. 

Basic usage:
; export POSTGRES_CONNECTION="postgres://..."
; expost NEAR_ENV="mainnet"
; yarn add-token --token_id=a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near

Will throw error if a token already exists with the given token_id. 
Use flag --overwrite to overwrite existing entry in such cases. 
*/
import { parse } from 'ts-command-line-args';
import { getDbConnectConfig } from '../src/config';
const { providers } = require('near-api-js');

const knex = require('knex')(getDbConnectConfig());

const { NEAR_ENV = 'testnet' } = process.env;

interface FtMetadata {
  spec: string;
  name: string;
  symbol: string;
  icon: string;
  reference: string;
  reference_hash: string;
  decimals: string;
}

const NEAR_METADATA = {
  spec: '',
  name: 'NEAR',
  symbol: 'NEAR',
  decimals: 24,
} as unknown as FtMetadata;

export interface NewTokenOptions {
  /**
   * NEP-141 token contract ID or 'NEAR' for native NEAR
   */
  token_id: string;
  overwrite?: boolean;
}

export const args = parse<NewTokenOptions>({
  token_id: String,
  overwrite: { type: Boolean, optional: true },
});

async function getTokenById(tokenId: string): Promise<object[]> {
  return await knex('nep_141_token').select().where('id', tokenId);
}

async function fetchFtTokenMetadata(contractId: string): Promise<FtMetadata> {
  if (contractId.toUpperCase() === 'NEAR') {
    return NEAR_METADATA;
  }
  return await getState(contractId);
}

async function getState(contractId: string): Promise<FtMetadata> {
  const provider = new providers.JsonRpcProvider(`https://rpc.${NEAR_ENV}.near.org`);
  const rawResult = await provider.query({
    request_type: 'call_function',
    account_id: contractId,
    method_name: 'ft_metadata',
    args_base64: 'e30=',
    finality: 'optimistic',
  });

  // format result
  return JSON.parse(Buffer.from(rawResult.result).toString());
}

async function addToken(token: FtMetadata): Promise<string> {
  return await knex('nep_141_token')
    .insert({
      id: args.token_id,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      spec: token.spec,
      reference: token.reference,
      reference_hash: token.reference_hash,
    })
    .onConflict('id')
    .merge()
    .catch((err: any) => {
      console.error(`There was an error upserting the "nep_141_token" table by id:`, err);
      throw err;
    });
}

async function run() {
  console.log('Fetching on-chain metadata');
  const token: FtMetadata = await fetchFtTokenMetadata(args.token_id);

  console.log('Checking if token already exists...');
  const storedToken = await getTokenById(args.token_id);

  if (!storedToken.length || args.overwrite) {
    console.log('adding new token to DB...');
    await addToken(token);
    console.log('Done');
  } else {
    console.log(`Token already exists with id=${args.token_id}. Use flag --overwrite to overwrite.`);
  }
}

run().then(() => {
  process.exit(0);
});
