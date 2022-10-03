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
import { prompt } from '../util';
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
  console.log(`Outstanding payouts: ${totalOutstanding}\n`);
  console.log(summaries.map((s) => [s.account_id, s.outstanding].join(',')).join('\n'), '\n');

  if (args['dry-run']) {
    console.log('Skip saving due to dry run');
  } else {
    // save the payouts

    // wait for LP payment
    let paid_in_tx_id: string | undefined;
    while (!paid_in_tx_id) {
      paid_in_tx_id = await prompt('payment TX ID: ');
    }

    console.log(`Total: ${totalOutstanding}, paid in ${paid_in_tx_id}`);
    await prompt('Press [ENTER] to save');

    console.log('saving rebate payouts');
    await saveRebates(
      summaries.map((s) => {
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
