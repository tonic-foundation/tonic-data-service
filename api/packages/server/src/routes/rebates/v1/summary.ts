// for historical payouts (fetches from the hard table)
// nb: because of a fix in the way points are calculated, day 1
// in the september program is a few cents off the live query
// used in /leaderboard
import { FastifyInstance } from 'fastify';

export interface RebateSummary {
  account_id: string;
  total_paid: string;
  total_eligible: string;
  outstanding: string;
}

function defaultSummary(account_id: string): RebateSummary {
  return {
    account_id,
    total_eligible: '0',
    total_paid: '0',
    outstanding: '0',
  };
}

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Headers: unknown;
    Querystring: {
      account: string;
    };
  }>({
    url: '/summary',
    method: 'GET',
    schema: {
      querystring: {
        account: { type: 'string' },
      },
    },
    // TODO: search? or maybe return params with history?
    handler: async (req, resp) => {
      const { account } = req.query;

      if (!account?.length) {
        resp.status(400).send({
          error: 'missing account parameter',
        });
        return;
      }

      const { knex } = server;

      const { rows } = await knex.raw<{ rows: RebateSummary[] }>(
        `select * from fee_rebates.rebate_summary where account_id = :account`,
        { account }
      );

      if (!rows.length) {
        resp.status(200).send(defaultSummary(account));
      } else {
        resp.status(200).send(rows[0]);
      }
    },
  });

  done();
}
