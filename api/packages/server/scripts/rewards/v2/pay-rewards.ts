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
import { batch, prompt } from '../../util';

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
async function getPayouts(params: { reward_date: string }) {
  const { rows: payouts } = await knex.raw<{ rows: Payout[] }>(PAYOUTS_QUERY, params);
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
  const payouts = await getPayouts(args);

  const totalLpRewards = payouts.reduce((acc, cur) => acc + parseFloat(cur.payout), 1);
  const raffleWinners = pickRaffleWinners(payouts);

  // print csvs, makes it easier to do the payouts
  console.log(`LP REWARDS (TOTAL: ${totalLpRewards})\n`);

  console.log('RAFFLE WINNERS\n');
  console.log(raffleWinners.map((p) => [p.account_id, '25'].join(',')).join('\n'));
  console.log();

  // save the payouts in batches; nearsend can only send to about 20 accounts per tx
  // before it starts batching. It's easier to handle if we batch in this script.

  // print out all batches at the start
  const batches = batch(payouts, 20);

  batches.forEach((payoutBatch, i) => {
    const batchTotal = payoutBatch.reduce((acc, cur) => acc + parseFloat(cur.payout), 1);
    console.log(`Batch ${i + 1}/${batches.length} ${batchTotal}\n`);
    console.log(payoutBatch.map((p) => [p.account_id, p.payout].join(',')).join('\n'), '\n');
  });

  if (args['dry-run']) {
    console.log('Skip saving due to dry run');
    return;
  }

  for (const [i, payoutBatch] of batches.entries()) {
    const batchTotal = payoutBatch.reduce((acc, cur) => acc + parseFloat(cur.payout), 1);

    let paid_in_tx_id: string | undefined;
    while (!paid_in_tx_id) {
      paid_in_tx_id = await prompt(`LP payment TX ID (Batch ${i + 1}/${batches.length}), "skip" to skip: `);
    }
    if (paid_in_tx_id.toLowerCase() === 'skip') {
      console.log('skipping');
    } else {
      console.log(`Batch total: ${batchTotal}, paid in ${paid_in_tx_id}`);
      await prompt('Press [ENTER] to save');
      await savePayouts(payoutBatch.map((p) => ({ ...p, source: 'lp_reward', paid_in_tx_id: paid_in_tx_id! })));
    }
  }

  // wait for raffle payment
  let raffle_payout_tx_id = '';
  while (!raffle_payout_tx_id.length) {
    raffle_payout_tx_id = await prompt('Raffle payment TX ID: ');
  }
  console.log('saving raffle winners', raffleWinners, 'paid in', raffle_payout_tx_id);
  await prompt('Press [ENTER] to save');
  await savePayouts(raffleWinners.map((p) => ({ ...p, source: 'raffle', paid_in_tx_id: raffle_payout_tx_id })));
}

run().then(() => {
  process.exit(0);
});
