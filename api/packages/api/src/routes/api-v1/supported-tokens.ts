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
      const key = 'token-list';
      let tokens = server.cache.getTimed(key);
      if (!tokens) {
        tokens = await server.knex<Nep141Token>('nep_141_token').select('id');
        server.cache.setTimed(key, tokens, 60_000);
      }
      response.status(200).send({ tokens });
    },
  });

  done();
}
