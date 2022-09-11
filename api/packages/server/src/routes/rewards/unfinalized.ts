// Unfinalized rewards for the current UTC day, computed using the view and
// cached for ~15 minutes per user.
// TODO XXX FIXME: remove the interval '1 day' stuff, it's just for testing
import { FastifyInstance } from 'fastify';

const REWARDS_TODAY_QUERY = `
with total_unfinalized as (
  select
    sum(points) total_unfinalized
  from
    rewards.usn_rewards_calculator
  where reward_date = date(now())
),
all_unfinalized_rewards as (
  select
    account_id,
    tu.total_unfinalized,
    points account_unfinalized
  from
    rewards.usn_rewards_calculator
  cross join
    total_unfinalized tu
  where
    reward_date = date(now())
),
unfinalized_rankings as (
  select
    *,
    dense_rank() over(
      order by
        au.account_unfinalized desc,
        au.account_id
    ) as overall_rank
  from 
    all_unfinalized_rewards au
)
select
  *
from
  unfinalized_rankings
where
  overall_rank <= 3
or
  account_id = :account
order by overall_rank asc;
`;

// query result looks like this
//
// it always returns up to the top 3 by points earned, and the account being
// requested. if the account is in the top 3, it won't be duplicated
//
// account_id | total_unfinalized | account_unfinalized | overall_rank
// ------------+-------------------+---------------------+--------------
//  tng02.near |            0.1444 |              0.1413 |            1
interface UnfinalizedRanking {
  account_id: string;
  total_unfinalized: string;
  account_unfinalized: string;
  overall_rank: string;
}

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Querystring: { account?: string };
    Headers: unknown;
  }>({
    url: '/unfinalized',
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

      const res = await server.withCache({
        key: `rewards-unfinalized-with-ranking-${account}`,
        ttl: 5 * 60_000,
        async get() {
          const { rows } = await knex.raw<{
            rows: UnfinalizedRanking[];
          }>(REWARDS_TODAY_QUERY, {
            account,
          });

          // if there's no activity for this account, push a default value.
          // if there's no trading activity at all, push a default value.
          if (!rows.length || !rows.find((r) => r.account_id === account)) {
            rows.push({
              account_id: account,
              account_unfinalized: '0',
              overall_rank: '0',
              total_unfinalized: rows[0]?.total_unfinalized || '0',
            });
          }

          return rows;
        },
      });

      resp.status(200).send(res);
    },
  });

  done();
}
