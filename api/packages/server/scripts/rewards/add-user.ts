/**
 * Add one or more users to the rewards program
 *
 * ; yarn ts-node scripts/rewards/add-user.ts --account_ids asdf.near,foo.near,bar.near
 */
import { parse } from 'ts-command-line-args';
import { getDbConnectConfig } from '../../src/config';
import getConnection from 'knex';

const knex = getConnection(getDbConnectConfig());

export interface CliOptions {
  account_ids: string;
}

export const args = parse<CliOptions>({
  account_ids: { type: String },
});

async function saveUser(account_ids: string[]) {
  try {
    await knex.transaction(async (t) => {
      for (const account_id of account_ids) {
        await t('rewards.signup').insert({ account_id }).onConflict('account_id').ignore();
        await t('nft.nft_holder').insert({ account_id }).onConflict('account_id').ignore();
      }
    });
  } catch (err) {
    console.error(`oh nooo`, err);
    throw err;
  }
}

async function run() {
  const accountIds = args.account_ids.split(',').map((a) => a.trim());
  console.log(`saving ${accountIds}\n`);
  await saveUser(accountIds);
  console.log('done');
}

run().then(() => {
  process.exit(0);
});
