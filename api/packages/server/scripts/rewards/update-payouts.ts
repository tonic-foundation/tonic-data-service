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
  todo: string;
}

export const args = parse<CliOptions>({
  'dry-run': { type: Boolean, optional: true },
  todo: { type: String },
});

interface PayoutsParams {
  todo: string;
}

async function updateParameters(params: PayoutsParams) {
  console.log(params);
}

async function run() {
  const _optsFromArgs = { ...args };
  delete _optsFromArgs['dry-run'];

  const opts: PayoutsParams = {
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
