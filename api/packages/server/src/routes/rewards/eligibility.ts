// Summary of an account's payouts (pending, paid, and total)
import { FastifyInstance } from 'fastify';

/**
 * If the account earned no rewards on a given day, the row for that day will
 * simply be missing. Missing days are filled in on the frontend.
 */
const ELIGIBILITY_QUERY = `
  select (
    exists (
        select
        from
        rewards.eligible_account
        where
        account_id = :account
    )::int
  );
`;

export interface RewardsProgramParameters {
  start_date: string;
  end_date: string;
}

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Headers: unknown;
    Querystring: {
      account: string;
    };
  }>({
    url: '/eligibility',
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
        resp.status(404).send();
        return;
      }

      const { knex } = server;
      const { rows } = await knex.raw<{
        rows: { exists: number }[];
      }>(ELIGIBILITY_QUERY, { account });

      if (rows[0]?.exists) {
        resp.status(200).send({ eligible: true });
      } else {
        resp.status(200).send({ eligible: false });
      }
    },
  });

  done();
}
