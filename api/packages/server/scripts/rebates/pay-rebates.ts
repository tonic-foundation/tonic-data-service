/**
 * Get outstanding fee rebates as a CSV for near-send.io and save resulting tx info.
 *
 * Safe to run multiple times as long as you don't actually save.
 *
 * ; yarn ts-node scripts/rebates/pay-rebates.ts --dry-run
 */
import { parse } from 'ts-command-line-args';
import { getDbConnectConfig } from '../../src/config';
import getConnection from 'knex';
import { batch, prompt } from '../util';
import { RebateSummary } from '../../src/routes/rebates/v1/summary';

const knex = getConnection(getDbConnectConfig());

export interface CliOptions {
  'dry-run'?: boolean;
}

export const args = parse<CliOptions>({
  'dry-run': { type: Boolean, optional: true },
});

async function getRebateSummaries(): Promise<RebateSummary[]> {
  const { rows } = await knex.raw<{ rows: RebateSummary[] }>(
    `
      select
        *
      from
        fee_rebates.rebate_summary
      where
        outstanding > 0
      order by
        outstanding desc;
    `
  );
  return rows;
}

interface RebatePayout {
  account_id: string;
  amount: string;
  paid_in_tx_id: string;
}
async function saveRebates(payouts: RebatePayout[]) {
  try {
    await knex.transaction(async (t) => {
      for (const payout of payouts) {
        await t.raw(
          `
          insert into fee_rebates.rebates (
            account_id,
            amount,
            paid_in_tx_id
          )
          values (
            :account_id,
            :amount,
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
  const summaries = await getRebateSummaries();

  // print csvs, makes it easier to do the payouts
  const totalOutstanding = summaries.reduce((acc, c) => acc + parseFloat(c.outstanding), 0);
  console.log(`Total outstanding payouts: ${totalOutstanding}\n`);

  // save the payouts in batches (nearsend can only send so many at a time, about 20 or so)
  const batches = batch(summaries);
  for (const [i, payoutBatch] of batches.entries()) {
    console.log(`Batch ${i + 1} / ${batches.length}`);
    console.log(payoutBatch.map((s) => [s.account_id, s.outstanding].join(',')).join('\n'), '\n');

    if (args['dry-run']) {
      console.log('skipped saving due to dry run\n');
      continue;
    }

    let paid_in_tx_id: string | undefined;
    while (!paid_in_tx_id) {
      paid_in_tx_id = await prompt('payment TX ID: ');
    }

    console.log(`Total: ${totalOutstanding}, paid in ${paid_in_tx_id}`);
    await prompt('Press [ENTER] to save');
    await saveRebates(
      payoutBatch.map((s) => {
        return {
          account_id: s.account_id,
          amount: s.outstanding,
          paid_in_tx_id: paid_in_tx_id!,
        };
      })
    );
  }
}

run().then(() => {
  process.exit(0);
});
