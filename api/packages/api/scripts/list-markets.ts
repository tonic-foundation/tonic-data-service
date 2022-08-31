/*
List markets in the `market` table in DB. 

Basic usage:
% export POSTGRES_CONNECTION="postgres://..."
% export NEAR_ENV="mainnet"
% yarn list-markets
*/
import Knex from 'knex';
import { getDbConnectConfig } from '../src/config';

const knex = Knex(getDbConnectConfig());

async function listMarkets(): Promise<unknown[]> {
  return await knex('market').select('*');
}

async function run() {
  console.log(await listMarkets());
}

run().then(() => {
  process.exit(0);
});
