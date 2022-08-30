/*
List tokens in the `nep_141_token` table in DB. 

Basic usage:
% export POSTGRES_CONNECTION="postgres://..."
% export NEAR_ENV="mainnet"
% yarn list-tokens
*/
import Knex from 'knex';
import { getDbConnectConfig } from '../src/config';

const knex = Knex(getDbConnectConfig());

interface Nep141Token {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  spec: 'ft-1.0.0';
  reference: string | null;
  reference_hash: string | null;
}

async function listTokens(): Promise<Nep141Token[]> {
  return await knex<Nep141Token>('nep_141_token').select('*');
}

async function run() {
  console.log(await listTokens());
}

run().then(() => {
  process.exit(0);
});
