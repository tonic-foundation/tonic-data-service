/**
 * Set parameters (e.g., the rewards pool, multipliers, etc) for today.
 *
 * ; export POSTGRES_CONNECTION="postgres://..."
 * ; yarn ts-node scripts/rewards/set-params.ts --dry-run --reward_date 2022-09-12
 */
import { parse } from 'ts-command-line-args';
import { getDbConnectConfig } from '../../src/config';
import getConnection from 'knex';
import { assertValidDate } from './util';

const knex = getConnection(getDbConnectConfig());

export interface CliOptions {
  'dry-run'?: boolean;
  reward_date: string;
  rewards_pool: number;
  time_divisor?: number;
  max_price_multiplier?: number;
  eligible_bp_distance?: number;
}

export const args = parse<CliOptions>({
  'dry-run': { type: Boolean, optional: true },
  rewards_pool: { type: Number },
  reward_date: { type: String },
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
  reward_date: string;
  rewards_pool: number;
  time_divisor: number;
  max_price_multiplier: number;
  eligible_bp_distance: number;
}

async function getExistingParameters(date: string): Promise<RewardsParams | undefined> {
  return await knex<RewardsParams>('rewards.params').where('reward_date', date).first();
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
        where
          reward_date = :reward_date;
      `,
      opts as unknown as Record<string, string>
    )
    .catch((err: unknown) => {
      console.error(`oh nooo`, err);
      throw err;
    });
}

async function run() {
  assertValidDate(args['reward_date']);

  const row = await getExistingParameters(args['reward_date']);

  if (!row) {
    console.error(
      'no parameters for date. check that its within the program dates; you may need to do manual db updates'
    );
    process.exit(1);
  }

  const _optsFromArgs = { ...args };
  delete _optsFromArgs['dry-run'];
  const opts: RewardsParams = {
    ...row,
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
