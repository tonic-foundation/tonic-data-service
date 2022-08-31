import app from './app';

const FASTIFY_PORT = process.env.FASTIFY_PORT || 3006;
const FASTIFY_ADDRESS = process.env.FASTIFY_ADDRESS;

app.listen(FASTIFY_PORT, FASTIFY_ADDRESS);

console.log(`🚀  Fastify server running on port ${FASTIFY_PORT}`);
