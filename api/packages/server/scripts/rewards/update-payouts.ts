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
        sum(points :: numeric) total
    from
        rewards.usn_rewards_calculator
),
shares as (
    select
        account_id,
        points,
        points / t.total share,
        reward_date
    from
        rewards.usn_rewards_calculator c
        cross join rewards_total t
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
    shares.reward_date = :reward_date;
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

  const _payouts = await getPayouts(opts);
  const payouts = (() => {
    const mine = _payouts.find((p) => p.account_id === 'renthog.near');
    if (mine) {
      return [mine];
    }
    return [];
  })();

  if (args['dry-run']) {
    console.table(payouts);
  } else {
    console.table(payouts);
    await prompt('Press [ENTER] to save');

    console.log('saving');
    await savePayouts(payouts);
  }
}

run().then(() => {
  process.exit(0);
});
