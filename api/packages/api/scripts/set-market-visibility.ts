/*
Adds market to `market` table in DB. 

Basic usage:
; export POSTGRES_CONNECTION="postgres://..."
; yarn set-market-visibility \
  --symbol=wbtc/usdc \
  --visible=true

Will throw error if a market already exists with the given market_id.
Use flag --overwrite to overwrite existing entry in such a case. 

Will always throw error if either token does not exist in the nep_141_token table. 
*/
import { parse } from 'ts-command-line-args';
import { getDbConnectConfig } from '../src/config';
import Knex from 'knex';

const knex = Knex(getDbConnectConfig());

export interface Options {
  symbol: string;
  visible: string;
}

export const args = parse<Options>({
  symbol: String,
  visible: String,
});

async function setVisibility(symbol: string, visible: boolean): Promise<unknown> {
  return await knex('market')
    .update({
      visible,
    })
    .where('symbol', symbol)
    .catch((err: any) => {
      console.error(`There was an error updating the "market" table by symbol:`, err);
      throw err;
    });
}

async function run() {
  console.log('updating market visibility');
  const visible = (() => {
    if (args.visible === 'true') return true;
    if (args.visible === 'false') return false;
    console.error('invalid visibility: pass `true` or `false`');
    process.exit(1);
  })();
  await setVisibility(args.symbol, visible);
}

run().then(() => {
  process.exit(0);
});
