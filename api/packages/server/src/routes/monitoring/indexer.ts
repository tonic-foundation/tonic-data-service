import { FastifyInstance } from 'fastify';

export interface IndexerProcessedBlock {
  latest_block_height: number;
  processed_at: Date;
  seconds_since: number;
}

const QUERY = `
  select
    block_height latest_block_height,
    processed_at,
    extract(epoch from now() - processed_at) seconds_since
  from
    indexer_processed_block
  order by block_height desc
    limit 1;
`;

/**
 * Get an account's trade history in a market.
 */
export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route({
    url: '/indexer',
    method: 'GET',
    // http handler used for polling/fetching initial list of requests when populating a ui
    handler: async (_, response) => {
      const { knex } = server;
      const { rows } = await knex.raw<{ rows: IndexerProcessedBlock[] }>(QUERY);

      response.status(200).send(rows[0]);
    },
  });

  done();
}
