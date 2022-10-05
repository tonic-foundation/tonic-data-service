// for historical payouts (fetches from the hard table)
// nb: because of a fix in the way points are calculated, day 1
// in the september program is a few cents off the live query
// used in /leaderboard
import { FastifyInstance } from 'fastify';

export interface RebatePayout {
  account_id: string;
  amount: string;
  paid_in_tx_id: string | null;
}

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Headers: unknown;
    Querystring: {
      account: string;
    };
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

      const { rows } = await knex.raw<{ rows: RebatePayout[] }>(
        `select * from fee_rebates.rebates where account_id = :account order by paid_at desc`,
        { account }
      );

      resp.status(200).send(rows);
    },
  });

  done();
}
