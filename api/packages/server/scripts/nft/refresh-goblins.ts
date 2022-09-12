/**
 * Update number of goblins held by accounts that have placed orders on Tonic.
 *
 * This is far from optimal---ideally, we'd index this data ourselves. At the
 * moment, this involves querying nearly 400 times.
 *
 * ; export POSTGRES_CONNECTION="postgres://..."
 * ; export NEAR_ENV=mainnet
 * ; export NFT_CONTRACT_ID=whatever.enleap.near
 * ; yarn refresh-goblins --dry-run
 */
import { Near } from 'near-api-js';
import { parse } from 'ts-command-line-args';
import { getNearConfig } from '@tonic-foundation/config';
import { InMemoryKeyStore } from 'near-api-js/lib/key_stores';
import { getDbConnectConfig } from '../../src/config';
import getConnection from 'knex';

const knex = getConnection(getDbConnectConfig());

const { NEAR_ENV } = process.env;
const { NFT_CONTRACT_ID } = process.env;

export interface CliOptions {
  'dry-run'?: boolean;
}

export const args = parse<CliOptions>({
  'dry-run': { type: Boolean, optional: true },
});

async function getParticipants(): Promise<string[]> {
  const rows = await knex('rewards.signup').distinct('account_id');
  return rows.map((row: { account_id: string }) => row.account_id);
}

async function updateGoblinsHeld(account_id: string, n_held: number, multiplier: number) {
  return await knex('nft.nft_holder')
    .insert({
      account_id,
      n_held,
      multiplier,
    })
    .onConflict('account_id')
    .merge()
    .catch((err: unknown) => {
      console.error(`oh nooo`, err);
      throw err;
    });
}

function getMultiplier(held: number) {
  if (held === 0) {
    return 1;
  } else if (held === 1) {
    return 1.2;
  } else if (held <= 4) {
    return 1.25;
  } else {
    return 1.3;
  }
}

async function run() {
  if (!NEAR_ENV || !NFT_CONTRACT_ID) {
    console.error('missing require env var');
    process.exit(1);
  }

  const near = new Near({
    ...getNearConfig(NEAR_ENV as any),
    keyStore: new InMemoryKeyStore(),
  });
  const account = await near.account('dontcare');

  const accounts = await getParticipants();
  console.log(accounts.length, 'accounts to check');

  for (const id of accounts) {
    const res: unknown[] = await account.viewFunction(NFT_CONTRACT_ID, 'nft_tokens_for_owner', {
      account_id: id,
    });
    const held = res.length;
    const multiplier = getMultiplier(held);

    // slow down for rate limit
    await new Promise((resolve) => setTimeout(resolve, 750));

    console.log(id, 'holds', held, 'multiplier', multiplier);
    if (args['dry-run']) {
      console.log('(skipped saving due to dry run)');
    } else {
      await updateGoblinsHeld(id, held, multiplier);
    }
  }
}

run().then(() => {
  process.exit(0);
});
