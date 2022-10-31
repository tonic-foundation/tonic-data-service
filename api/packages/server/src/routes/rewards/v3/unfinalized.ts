import { FastifyInstance } from 'fastify';

const REWARDS_TODAY_QUERY = `
select
  dense_rank() over (order by account_liquidity_hours desc, account_id) ranking,
  ranking,
  account_id,
  account_liquidity_hours,
  total_liquidity_hours,
  share,
  reward
from
  rewards.get_lp_rewards_v3(:ticker, :date)
order by ranking;
`;

// query always returns up to the top 3 by points earned, and the account being
// requested. if the account is in the top 3, it won't be duplicated
interface Ranking {
  ranking: string;
  account_id: string;
  account_liquidity_hours: string;
  total_liquidity_hours: string;
  share: string;
  reward: string;
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
        key: `rewards-v3-unfinalized-with-ranking-${account}`,
        ttl: 1 * 60_000, // it's a subsecond query usually, so can cache less
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
              account_liquidity_hours: '0',
              total_liquidity_hours: rows[0]?.total_liquidity_hours || '0',
              share: '0',
              reward: '0',
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
