import { FastifyInstance } from 'fastify';

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
