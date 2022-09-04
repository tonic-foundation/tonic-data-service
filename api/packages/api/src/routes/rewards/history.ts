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
    sum(reward) total
  from
    rewards.payouts
  group by account_id
)
select
  -- we join the total in just so we can get the summary in one query
  tppa.total,
  reward,
  reward_date,
  paid_in_tx_id
from
  rewards.payouts p
  join total_payments_per_account tppa
  on p.account_id = tppa.account_id
where
  tppa.account_id = :account
order by reward_date desc;
`;

export interface RewardsSummary {
  total: number;
  reward: number;
  reward_date: Date;
  paid_in_tx_id: string | null;
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
        rows: RewardsSummary[];
      }>(REWARDS_SUMMARY_QUERY, {
        account,
      });

      if (rows.length) {
        resp.status(200).send(rows);
      } else {
        resp.status(404);
      }
    },
  });

  done();
}
