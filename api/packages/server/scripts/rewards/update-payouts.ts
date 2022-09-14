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
  reward_date: string;
}

export const args = parse<CliOptions>({
  'dry-run': { type: Boolean, optional: true },
  reward_date: { type: String },
});

interface PayoutsParams {
  reward_date: string;
}

const PAYOUTS_QUERY = `
with rewards_total as (
    select
        sum(points :: numeric) total,
        reward_date
    from
        rewards.usn_rewards_calculator
    group by reward_date
),
shares as (
    select
        c.account_id,
        c.points,
        points / t.total share,
        t.reward_date
    from
        rewards.usn_rewards_calculator c
        join rewards_total t on t.reward_date = c.reward_date
)
select
    account_id,
    points,
    share,
    trunc(share * p.rewards_pool, 2) payout,
    shares.reward_date
from
    shares
    join rewards.params p on p.reward_date = shares.reward_date
where
    points > 0
    and shares.reward_date = :reward_date
order by payout desc, account_id;
`;

interface Payout {
  account_id: string;
  points: string;
  share: string;
  payout: string;
  reward_date: Date;
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
            reward_date
          )
          values (
            :account_id,
            :points,
            :payout,
            :reward_date
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
    await savePayouts(payouts);
  }
}

run().then(() => {
  process.exit(0);
});
