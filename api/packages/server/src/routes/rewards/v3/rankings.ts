import { FastifyInstance } from 'fastify';

const REWARDS_TODAY_QUERY = `
select
  dense_rank() over (order by account_liquidity_hours desc, account_id) ranking,
  account_id,
  account_liquidity_hours,
  total_liquidity_hours,
  share,
  reward
from
  rewards.get_lp_rewards_v3(:symbol, :date)
where
  share > 0.001
order by ranking;
`;

interface Ranking {
  ranking: string;
  account_id: string;
  account_liquidity_hours: number;
  total_liquidity_hours: number;
  share: number;
  reward: number;
}

interface GroupedRankings {
  total_liquidity_hours: number;
  rankings: Omit<Ranking, 'ranking' | 'total_liquidity_hours'>[];
}

function stripTotal(r: Ranking): Omit<Ranking, 'ranking' | 'total_liquidity_hours'> {
  return {
    account_id: r.account_id,
    account_liquidity_hours: r.account_liquidity_hours,
    reward: r.reward,
    share: r.share,
  };
}

function groupRankings(rankings: Ranking[]): GroupedRankings {
  const total_liquidity_hours = rankings.length ? rankings[0].total_liquidity_hours : 0;
  return {
    total_liquidity_hours,
    rankings: rankings.map(stripTotal),
  };
}

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Querystring: { date: string; symbol: string };
    Headers: unknown;
  }>({
    url: '/rankings',
    method: 'GET',
    schema: {
      querystring: {
        date: { type: 'string' },
        symbol: { type: 'string' },
      },
    },
    handler: async (req, resp) => {
      const { symbol, date } = req.query;

      if (!date?.length) {
        resp.status(400).send({
          error: 'missing date parameter',
        });
        return;
      }

      if (!symbol?.length) {
        resp.status(400).send({
          error: 'missing symbol parameter',
        });
        return;
      }

      const { knex } = server;
      const { rows } = await knex.raw<{
        rows: Ranking[];
      }>(REWARDS_TODAY_QUERY, {
        symbol,
        date,
      });

      resp.status(200).send(groupRankings(rows));
    },
  });

  done();
}
