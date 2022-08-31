import { OriginFunction } from '@fastify/cors';

const SENTRY_URL = process.env.SENTRY_URL;
const SENTRY_ENV = process.env.SENTRY_ENV;
const SENTRY_SAMPLE_RATE = parseFloat(process.env.SENTRY_SAMPLE_RATE || '0.01');

const IS_DEV = process.env.NODE_ENV === 'development';
const NEAR_ENV = process.env.NEAR_ENV;
const TONIC_CONTRACT_ID = process.env.TONIC_CONTRACT_ID;
const WEBSOCKET_HEARTBEAT_DEADLINE = 15_000;

// allow all for now
const checkCorsOrigin: OriginFunction = (_, cb) => {
  cb(null, true);
};

export function getPostgresSslConfig() {
  if (process.env.POSTGRES_CA_CERT?.length) {
    const POSTGRES_CA_CERT = Buffer.from(process.env.POSTGRES_CA_CERT, 'base64').toString();
    return {
      rejectUnauthorized: false,
      ca: POSTGRES_CA_CERT,
    };
  }
  return undefined;
}

export function getDbConnectConfig() {
  return {
    client: 'pg',
    connection: {
      connectionString: process.env.POSTGRES_CONNECTION,
      ssl: getPostgresSslConfig(),
    },
    pool: {
      min: 2,
      max: 8,
    },
  };
}

export function getConfig() {
  if (!TONIC_CONTRACT_ID) {
    throw new Error('missing TONIC_CONTRACT_ID');
  }
  if (!NEAR_ENV) {
    throw new Error('missing NEAR_ENV');
  }

  return {
    IS_DEV,
    TONIC_CONTRACT_ID,
    NEAR_ENV,
    WEBSOCKET_HEARTBEAT_DEADLINE,
    SENTRY_URL,
    SENTRY_ENV,
    SENTRY_SAMPLE_RATE,
    checkCorsOrigin,
  };
}
