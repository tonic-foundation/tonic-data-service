import { FastifyInstance } from 'fastify';
import { Nep141Token } from '../../models/nep-141-token';

/**
 * Get list of tokens supported by the API, ie, all tokens involved in at least
 * one listing.
 */
export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Headers: unknown;
  }>({
    url: '/tokens',
    method: 'GET',
    handler: async (_, response) => {
      const tokens = await server.withCache({
        key: 'api-v1-supported-tokens',
        ttl: 15 * 60_000,
        async get() {
          return await server.knex<Nep141Token>('nep_141_token').select('id').where('visible', true);
        },
      });
      response.status(200).send({ tokens });
    },
  });

  done();
}
