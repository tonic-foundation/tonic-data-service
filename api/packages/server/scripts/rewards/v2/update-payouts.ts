/**
 * Compute payouts for today based on parameters in rewards.params.
 *
 * All it does is
 * - get all points earned today
 * - write payout amounts to db in proportion to points earned
 *
 * This uses the time-bounded leaderboard view, so it doesn't really matter when
 * you run it.
 *
 * ; yarn ts-node scripts/rewards/update-payouts.ts --reward_date 2022-09-12
 */
import { parse } from 'ts-command-line-args';
import { getDbConnectConfig } from '../../../src/config';
import getConnection from 'knex';
import { prompt } from '../util';

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
  paid_in_tx_id: string;
}

// same as in the rewards/v2/leaderboad route (TODO: refactor)
const PAYOUTS_QUERY = `
select
  event_date reward_date,
  ranking,
  account_id,
  points,
  share,
  trunc(share * p.rewards_pool, 2) payout
from
  rewards.leaderboard_v2 l
  join rewards.params p on p.reward_date = l.event_date
where
  event_date = :reward_date
  and share > 0
order by ranking, account_id;
`;

interface Payout {
  account_id: string;
  points: string;
  share: string;
  payout: string;
  reward_date: Date;
  paid_in_tx_id: string;
  source?: 'lp_reward' | 'raffle';
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
            paid_in_tx_id,
            source
          )
          values (
            :account_id,
            :points,
            :payout,
            :reward_date,
            :paid_in_tx_id,
            :source
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

function sampleWithoutReplacement<T>(xs: T[], n: number): T[] {
  // whatever lol
  if (n >= xs.length) {
    return xs;
  }

  const bag = [...xs];
  const ret: T[] = [];
  while (ret.length < n) {
    const idx = Math.floor(Math.random() * bag.length);
    ret.push(bag.splice(idx, 1)[0]);
  }

  return ret;
}

function pickRaffleWinners(payouts: Payout[]): Payout[] {
  return sampleWithoutReplacement(
    payouts.filter((p) => parseFloat(p.points) > 0),
    4
  ).map((w) => ({
    account_id: w.account_id,
    reward_date: w.reward_date,
    share: w.share,
    paid_in_tx_id: w.paid_in_tx_id,
    payout: '25',
    points: '0',
    source: 'raffle',
  }));
}

async function run() {
  const _optsFromArgs = { ...args };
  delete _optsFromArgs['dry-run'];

  // TODO: this type is wrong, needs to be split into 2. getPayouts is receiving
  // an extra property (paid_in_tx_id)
  const opts = {
    ..._optsFromArgs,
  } as PayoutsParams;

  const payouts = await getPayouts(opts);
  const totalLpRewards = payouts.reduce((acc, cur) => acc + parseFloat(cur.payout), 1);
  const raffleWinners = pickRaffleWinners(payouts);

  // print csvs, makes it easier to do the payouts
  console.log(`LP REWARDS (TOTAL: ${totalLpRewards})\n`);
  console.log(payouts.map((p) => [p.account_id, p.payout].join(',')).join('\n'), '\n');

  console.log('RAFFLE WINNERS\n');
  console.log(raffleWinners.map((p) => [p.account_id, '25'].join(',')).join('\n'));
  console.log('\n');

  if (args['dry-run']) {
    console.log('Skip saving due to dry run');
  } else {
    // save the payouts

    // wait for LP payment
    while (!opts.paid_in_tx_id) {
      opts.paid_in_tx_id = await prompt('LP payment TX ID: ');
    }

    console.log(`Total: ${totalLpRewards}, paid in ${opts.paid_in_tx_id}`);
    await prompt('Press [ENTER] to save');

    console.log('saving lp rewards');
    await savePayouts(payouts.map((p) => ({ ...p, source: 'lp_reward', paid_in_tx_id: opts.paid_in_tx_id })));

    // wait for raffle payment
    let raffle_payout_tx_id = '';
    while (!raffle_payout_tx_id.length) {
      raffle_payout_tx_id = await prompt('Raffle payment TX ID: ');
    }
    console.log('saving raffle winners', raffleWinners, 'paid in', raffle_payout_tx_id);
    await prompt('Press [ENTER] to save');
    await savePayouts(raffleWinners.map((p) => ({ ...p, paid_in_tx_id: raffle_payout_tx_id })));
  }
}

run().then(() => {
  process.exit(0);
});
