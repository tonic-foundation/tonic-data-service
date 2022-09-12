// Summary of an account's payouts (pending, paid, and total)
import { FastifyInstance } from 'fastify';

/**
 * If the account earned no rewards on a given day, the row for that day will
 * simply be missing. Missing days are filled in on the frontend.
 */
const REWARDS_SUMMARY_QUERY = `
with total_payments_per_account as (
  select
    account_id,
    sum(payout) total
  from
    rewards.payouts
  group by account_id
)
select
  -- join the total so we can get the summary in one query
  tppa.total,
  points,
  payout,
  reward_date,
  paid_in_tx_id
from
  rewards.payouts p
  join total_payments_per_account tppa
  on p.account_id = tppa.account_id
where
  tppa.account_id = :account
order by reward_date asc;
`;

export interface RewardEntry {
  total: number;
  points: number;
  payout: number;
  reward_date: Date;
  paid_in_tx_id: string | null;
}

export interface RewardsHistory {
  total: number;
  // RewardEntry but omit total and make the date a string
  rewards: (Omit<RewardEntry, 'total' | 'reward_date'> & { reward_date: string })[];
}

/**
 * Group history rows into a single object.
 *
 * Strip timezone information out of the date; it's not useful for this API.
 */
function intoHistory(entries: RewardEntry[]): RewardsHistory {
  if (!entries.length) {
    return {
      total: 0,
      rewards: [],
    };
  }

  return {
    total: entries[0].total,
    rewards: entries.map((e) => {
      return {
        payout: e.payout,
        // server is assumed to be in UTC
        points: e.points,
        reward_date: e.reward_date.toISOString().split('T')[0],
        paid_in_tx_id: e.paid_in_tx_id,
      };
    }),
  };
}

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Querystring: { account?: string };
    Headers: unknown;
  }>({
    url: '/history',
    method: 'GET',
    schema: {
      querystring: {
        account: { type: 'string' },
      },
    },
    handler: async (req, resp) => {
      const { account } = req.query;

      if (!account?.length) {
        resp.status(400).send({
          error: 'missing account parameter',
        });
        return;
      }

      const { knex } = server;
      const { rows } = await knex.raw<{
        rows: RewardEntry[];
      }>(REWARDS_SUMMARY_QUERY, {
        account,
      });

      if (rows.length) {
        resp.status(200).send(intoHistory(rows));
      } else {
        resp.status(200).send({
          total: 0,
          rewards: [],
        } as RewardsHistory);
      }
    },
  });

  done();
}
