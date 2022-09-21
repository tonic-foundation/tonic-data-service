// Unfinalized rewards for the current UTC day, computed using the view and
// cached per user.
import { FastifyInstance } from 'fastify';

const REWARDS_TODAY_QUERY = `
select
  ranking,
  account_id,
  earned_points,
  rollover_points,
  points,
  all_traders_points,
  share,
  trunc(share * p.rewards_pool, 2) payout
from
  rewards.leaderboard_v2 l
  join rewards.params p on p.reward_date = l.event_date
where
  event_date = current_date
  and (ranking <= 3 or account_id = :account)
order by ranking asc;
`;

// query always returns up to the top 3 by points earned, and the account being
// requested. if the account is in the top 3, it won't be duplicated
interface Ranking {
  ranking: string;
  account_id: string;
  earned_points: string;
  rollover_points: string;
  points: string;
  all_traders_points: string;
  share: string;
  payout: string;
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
        key: `rewards-v2-unfinalized-with-ranking-${account}`,
        ttl: 5 * 60_000,
        async get() {
          const { rows } = await knex.raw<{
            rows: Ranking[];
          }>(REWARDS_TODAY_QUERY, {
            account,
          });

          // if there's no activity for this account, push a default value.
          // if there's no trading activity at all, push a default value.
          if (!rows.length || !rows.find((r) => r.account_id === account)) {
            rows.push({
              ranking: '0',
              account_id: account,
              rollover_points: '0', // if they had rollover points, they'd show in the query
              earned_points: '0',
              points: '0',
              all_traders_points: rows[0]?.all_traders_points || '0',
              share: '0',
              payout: '0',
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
