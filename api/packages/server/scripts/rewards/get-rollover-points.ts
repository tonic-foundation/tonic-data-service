/**
 * Oh god.
 *
 * ; yarn ts-node scripts/rewards/get-rollover-points.ts
 */
import { Account, Near } from 'near-api-js';
import { getNearConfig, NearEnv } from '@tonic-foundation/config';
import { InMemoryKeyStore } from 'near-api-js/lib/key_stores';
import { parse } from 'ts-command-line-args';
import { getDbConnectConfig } from '../../src/config';
import getConnection from 'knex';
import { assertValidDate } from './util';

const knex = getConnection(getDbConnectConfig());

const {
  NEAR_ENV,
  TONIC_CONTRACT_ID = 'v1.orderbook.near',
  USN_MARKET_ID = 'J5mggeEGCyXVUibvYTe9ydVBrELECRUu23VRk2TwC2is',
} = process.env;

export interface CliOptions {
  'dry-run'?: boolean;
  date: string;
}

export const args = parse<CliOptions>({
  'dry-run': { type: Boolean, optional: true },
  date: { type: String },
});

async function saveRolloverPoints(ob: OrderbookHack, date: string) {
  try {
    await knex.transaction(async (t) => {
      for (const order of [...ob.bids, ...ob.asks]) {
        // spot-checked with wolframalpha and looks okay... 💀💀💀
        //
        // this *saves* the full time on the book for auditability but
        // calculates with the 24h cap
        //
        // note: the event_type arg to calculate_points_v2 doesn't matter as
        // long as the value isn't 'filled'
        await t.raw(
          `
          with time_on_book as (
            select
              order_id,
              extract(epoch from (now() - created_at) / 3600) hours_on_book
            from order_event
          )
          insert into rewards.rollover_orders (
            account_id,
            order_id,
            open_quantity,
            hours_on_book,
            points,
            from_date
          )
          select 
            account_id,
            t.order_id,
            :open_quantity open_quantity,
            hours_on_book,
            rewards.calculate_points_v2(
              :limit_price :: numeric,
              :open_quantity :: numeric,
              least(hours_on_book, 24),
              o.side,
              'created',
              p.eligible_bp_distance,
              p.max_price_multiplier,
              p.fill_multiplier
            ) points,
            :date from_date
          from
            order_event o
            join time_on_book t on t.order_id = o.order_id
            join rewards.params p on p.reward_date = :date
          where
            t.order_id = :order_id
        `,
          {
            limit_price: order.limit_price,
            open_quantity: order.open_quantity,
            order_id: order.order_id,
            date,
          }
        );
        console.log(order.order_id);
      }
    });
  } catch (err) {
    console.error(`oh nooo`, err);
    throw err;
  }
}

interface OrderHack<T = string> {
  owner: string;
  order_id: string;
  limit_price: T;
  open_quantity: T;
}
interface OrderbookHack<T = string> {
  bids: OrderHack<T>[];
  asks: OrderHack<T>[];
}

/**
 * Get the orderbook. No need to sort/load prices because SQL uses native
 * values, and calculator function skips ineligibly-priced orders
 */
async function getOrderbook(account: Account, marketId = USN_MARKET_ID) {
  const ob: OrderbookHack = await account.viewFunction(TONIC_CONTRACT_ID, 'get_orderbook', {
    market_id: marketId,
    depth: 5, // only allow this many bps anyway
    show_owner: true,
    show_order_id: true,
  });

  return ob;
}

async function run() {
  if (!NEAR_ENV || !TONIC_CONTRACT_ID) {
    console.error('missing require env var');
    process.exit(1);
  }
  assertValidDate(args['date']);

  const near = new Near({
    ...getNearConfig(NEAR_ENV as NearEnv),
    keyStore: new InMemoryKeyStore(),
  });
  const account = await near.account('dontcare');

  // TODO: can't use tonic client, since it groups by price
  // const tonic = new Tonic(account, TONIC_CONTRACT_ID);

  const ob = await getOrderbook(account);
  await saveRolloverPoints(ob, args.date);
}

run().then(() => {
  process.exit(0);
});
