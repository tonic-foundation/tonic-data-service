/**
 * Set initial parameters (e.g., the date) for the competition.
 *
 * ; export POSTGRES_CONNECTION="postgres://..."
 * ; yarn ts-node scripts/rewards/init-program.ts -h
 */
import { parse } from 'ts-command-line-args';
import { getDbConnectConfig } from '../../src/config';
import getConnection from 'knex';
import { assertValidDate } from '../util';

const knex = getConnection(getDbConnectConfig());

export interface CliOptions {
  'dry-run'?: boolean;
  'start-date': string;
  'end-date': string;
}

export const args = parse<CliOptions>({
  'dry-run': { type: Boolean, optional: true },
  'start-date': {
    type: String,
  },
  'end-date': {
    type: String,
  },
});

interface RewardsConstOpts {
  start_date: string;
  end_date: string;
}

async function setProgramConst(opts: RewardsConstOpts) {
  return await knex.transaction(async (t) => {
    try {
      // set parameters
      await t.raw(
        `
        update rewards.const
        set
          start_date = :start_date,
          end_date = :end_date
        where true;
      `,
        opts as unknown as Record<string, string>
      );
      // create a default parameter row for each day
      await t.raw(
        `
        insert into rewards.params (
          reward_date
        )
        select
          day
        from 
          generate_series(:start_date, :end_date, interval '1 day') day;
      `,
        opts as unknown as Record<string, string>
      );
    } catch (err) {
      console.error(`oh nooo`, err);
      throw err;
    }
  });
}

async function run() {
  assertValidDate(args['end-date']);
  assertValidDate(args['start-date']);

  const opts: RewardsConstOpts = {
    start_date: args['start-date'],
    end_date: args['end-date'],
  };

  if (args['dry-run']) {
    console.log('skipping update');
  } else {
    await setProgramConst(opts);
  }
}

run().then(() => {
  process.exit(0);
});
