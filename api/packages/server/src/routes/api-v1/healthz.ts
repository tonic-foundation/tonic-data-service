import { FastifyInstance } from 'fastify';

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.get('/healthz', async (_, response) => {
    await server.knex.raw('SELECT 1;');
    response.status(200).send('ok');
  });

  done();
}
