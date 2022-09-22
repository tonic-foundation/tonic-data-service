/**
 * Compute payouts for today based on parameters in rewards.params.
 *
 * All it does is
 * - get all points earned today
 * - write payout amounts to db in proportion to points earned
 *
 * ; yarn ts-node scripts/rewards/update-payouts.ts --reward_date 2022-09-12
 */
import { parse } from 'ts-command-line-args';
import { getDbConnectConfig } from '../../src/config';
import getConnection from 'knex';
import { prompt } from './util';

const knex = getConnection(getDbConnectConfig());

export interface CliOptions {
  'dry-run'?: boolean;
  paid_in_tx_id?: string;
  reward_date: string;
}

export const args = parse<CliOptions>({
  'dry-run': { type: Boolean, optional: true },
  paid_in_tx_id: { type: String, optional: true },
  reward_date: { type: String },
});

interface PayoutsParams {
  reward_date: string;
}

const PAYOUTS_QUERY = `
select
  account_id,
  points,
  share,
  payout,
  reward_date
from rewards.usn_payouts_leaderboard
where
  reward_date = :reward_date
  and points > 0
order by ranking, account_id;
`;

interface Payout {
  account_id: string;
  points: string;
  share: string;
  payout: string;
  reward_date: Date;
  paid_in_tx_id: string;
}
async function getPayouts(params: PayoutsParams) {
  const { rows: payouts } = await knex.raw<{ rows: Payout[] }>(
    PAYOUTS_QUERY,
    params as unknown as Record<string, string>
  );
  return payouts;
}

async function savePayouts(payouts: Payout[]) {
  try {
    await knex.transaction(async (t) => {
      for (const payout of payouts) {
        await t.raw(
          `
          insert into rewards.payouts (
            account_id,
            points,
            payout,
            reward_date,
            paid_in_tx_id
          )
          values (
            :account_id,
            :points,
            :payout,
            :reward_date,
            :paid_in_tx_id
          );
          `,
          payout as unknown as Record<string, string>
        );
      }
    });
  } catch (err) {
    console.error(`oh nooo`, err);
    throw err;
  }
}

async function run() {
  if (!args['dry-run'] && !args['paid_in_tx_id']) {
    console.error('paid_in_tx_id must be provided when writing payouts');
    process.exit(1);
  }

  const _optsFromArgs = { ...args };
  delete _optsFromArgs['dry-run'];

  const opts: PayoutsParams = {
    ..._optsFromArgs,
  };

  const payouts = await getPayouts(opts);
  const total = payouts.reduce((acc, cur) => acc + parseFloat(cur.payout), 1);
  if (args['dry-run']) {
    console.table(payouts);
    console.log(`TOTAL: ${total}`);
  } else {
    console.table(payouts);
    console.log(`TOTAL: ${total}`);
    await prompt('Press [ENTER] to save');

    console.log('saving');
    // whatever lol
    await savePayouts(payouts.map((p) => ({ ...p, paid_in_tx_id: args.paid_in_tx_id! })));
  }
}

run().then(() => {
  process.exit(0);
});
