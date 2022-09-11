import { FastifyInstance } from 'fastify';

/**
 * Implement TradingView chart config.
 */
export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.get('/config', async (_, response) => {
    response.status(200).send({
      supported_resolutions: ['1', '5', '15', '30', '60'],
      supports_group_request: false, // this is for returning all symbols supported by (eg) an exchange, which we don't need
      supports_marks: false,
      supports_search: true, // resolve symbols individually
      supports_timescale_marks: false,
    });
  });

  done();
}
