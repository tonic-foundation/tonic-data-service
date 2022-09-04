import { FastifyInstance } from 'fastify';
import { groupRankings, TradeRanking } from './util';

const RANK_QUERY = `
SELECT *
FROM competition.ranking_overall
WHERE 
  race = :race
AND overall_rank
  BETWEEN :offset::int
  AND :limit::int + :offset::int
ORDER BY after_multiplier DESC, account_id, market_id
`;

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Querystring: { limit?: number; offset?: number; race?: string };
    Headers: unknown;
  }>({
    url: '/rankings',
    method: 'GET',
    schema: {
      querystring: {
        limit: { type: 'number' },
        offset: { type: 'number' },
        race: { type: 'string' },
      },
    },
    handler: async (req, resp) => {
      const { limit: rawLimit = 20, offset = 0, race = 'usdc' } = req.query;
      const limit = Math.min(rawLimit, 50);

      const { knex } = server;
      const { rows } = await knex.raw<{
        rows: TradeRanking[];
      }>(RANK_QUERY, {
        limit,
        offset,
        race,
      });
      resp.status(200).send({
        ranks: groupRankings(rows),
        hasMore: rows.length >= limit,
        // this will be wrong if the last page has exactly `limit` entries but
        // doesn't matter for this api
      });
    },
  });

  done();
}
