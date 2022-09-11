import fp from 'fastify-plugin';
import knex, { Knex } from 'knex';
import { FastifyInstance } from 'fastify';
import { getDbConnectConfig } from '../config';

declare module 'fastify' {
  interface FastifyInstance {
    knex: Knex;
  }
}

const dbPlugin = async (fastify: FastifyInstance, _: unknown, next: () => unknown) => {
  const con = knex(getDbConnectConfig());
  if (!fastify.knex) {
    fastify.decorate('knex', con);
  }
  next();
};

export default fp(dbPlugin);
