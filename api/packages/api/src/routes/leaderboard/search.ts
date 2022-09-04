import { FastifyInstance } from 'fastify';
import { groupRankings, TradeRanking } from './util';

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Querystring: { account?: string; race?: string };
    Headers: unknown;
  }>({
    url: '/search',
    method: 'GET',
    schema: {
      querystring: {
        account: { type: 'string' },
        race: { type: 'string' },
      },
    },
    handler: async (req, resp) => {
      const { account, race = 'usdc' } = req.query;

      if (!account?.length) {
        resp.status(400).send({
          error: 'missing account parameter',
        });
        return;
      }

      const { knex } = server;
      const { rows } = await knex.raw<{
        rows: TradeRanking[];
      }>(`select * from competition.ranking_overall where account_id = :account and race = :race`, {
        account,
        race,
      });

      if (rows.length) {
        resp.status(200).send(groupRankings(rows)[0]);
      } else {
        resp.status(404);
      }
    },
  });

  done();
}
