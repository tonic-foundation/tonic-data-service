/**
 * Set parameters (e.g., the rewards pool, multipliers, etc) for today.
 *
 * ; export POSTGRES_CONNECTION="postgres://..."
 * ; yarn ts-node scripts/rewards/set-params.ts --dry-run --reward_date 2022-09-12
 */
import { parse } from 'ts-command-line-args';
import { getDbConnectConfig } from '../../../src/config';
import getConnection from 'knex';
import { assertValidDate } from '../../util';

const knex = getConnection(getDbConnectConfig());

export interface CliOptions {
  'dry-run'?: boolean;
  symbol: string;
  for_date: string;
  max_price_rank_multiplier?: number;
  max_eligible_price_rank?: number;
  rewards_pool: number;
}

export const args = parse<CliOptions>({
  'dry-run': { type: Boolean, optional: true },
  symbol: { type: String },
  for_date: { type: String },
  max_price_rank_multiplier: { type: Number, optional: true },
  max_eligible_price_rank: { type: Number, optional: true },
  rewards_pool: { type: Number },
});

interface RewardsParams {
  for_date: string;
  symbol: string;
  market_id: string;
  max_price_rank_multiplier?: number;
  max_eligible_price_rank?: number;
  rewards_pool: number;
}

async function getMarketId(symbol: string): Promise<{ id: string } | undefined> {
  return await knex<{ id: string; symbol: string }>('market').select('id').where('symbol', symbol).first();
}

async function getExistingParams(market_id: string, for_date: string): Promise<RewardsParams | undefined> {
  return await knex<RewardsParams>('rewards.params_v3')
    .where('for_date', for_date)
    .andWhere('market_id', market_id)
    .first();
}

// for_date | symbol | market_id | max_price_rank_multiplier | max_eligible_price_rank | rewards_pool
async function updateParameters(opts: RewardsParams) {
  return await knex
    .raw(
      `
        insert into rewards.params_v3 (
          for_date,
          symbol,
          market_id,
          rewards_pool
        )
        values (
          :for_date,
          :symbol,
          :market_id,
          :rewards_pool
        );
      `,
      opts as unknown as Record<string, string>
    )
    .catch((err: unknown) => {
      console.error(`oh nooo`, err);
      throw err;
    });
}

async function run() {
  assertValidDate(args.for_date);
  const market = await getMarketId(args.symbol);

  if (!market) {
    console.error(`Market not found: ${args.symbol}`);
    process.exit(1);
  }

  const { id: market_id } = market;
  const existing = await getExistingParams(market_id, args.for_date);

  const _optsFromArgs = { ...args };
  delete _optsFromArgs['dry-run'];

  const opts: RewardsParams = {
    market_id,
    ...existing,
    ..._optsFromArgs,
  };

  if (args['dry-run']) {
    console.log('skipping update:', opts);
  } else {
    await updateParameters(opts);
  }
}

run().then(() => {
  process.exit(0);
});
