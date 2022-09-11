/**
 * Compute payouts for today based on parameters in rewards.params.
 *
 * All it does is
 * - get all points earned today
 * - write payout amounts to db in proportion to points earned
 *
 * ; export POSTGRES_CONNECTION="postgres://..."
 * ; yarn ts-node scripts/rewards/set-params.ts -h
 */
import { parse } from 'ts-command-line-args';
import { getDbConnectConfig } from '../../src/config';
import getConnection from 'knex';

const knex = getConnection(getDbConnectConfig());

export interface CliOptions {
  'dry-run'?: boolean;
  rewards_pool: number;
  time_divisor?: number;
  max_price_multiplier?: number;
  eligible_bp_distance?: number;
}

export const args = parse<CliOptions>({
  'dry-run': { type: Boolean, optional: true },
  rewards_pool: { type: Number },
  eligible_bp_distance: {
    type: Number,
    optional: true,
  },
  max_price_multiplier: {
    type: Number,
    optional: true,
  },
  time_divisor: {
    type: Number,
    optional: true,
  },
});

interface RewardsParams {
  rewards_pool: number;
  time_divisor: number;
  max_price_multiplier: number;
  eligible_bp_distance: number;
}

async function getExistingParameters(): Promise<RewardsParams> {
  return await knex<RewardsParams>('rewards.params').first('*');
}

async function updateParameters(opts: RewardsParams) {
  return await knex
    .raw(
      `
        update rewards.params
        set
          rewards_pool = :rewards_pool,
          time_divisor = :time_divisor,
          max_price_multiplier = :max_price_multiplier,
          eligible_bp_distance = :eligible_bp_distance
        where true;
      `,
      opts as unknown as Record<string, string>
    )
    .catch((err: unknown) => {
      console.error(`oh nooo`, err);
      throw err;
    });
}

async function run() {
  const existing = await getExistingParameters();

  const _optsFromArgs = { ...args };
  delete _optsFromArgs['dry-run'];

  const opts: RewardsParams = {
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
