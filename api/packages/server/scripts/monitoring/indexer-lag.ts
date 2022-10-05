import axios from 'axios';
import { IndexerProcessedBlock } from '../../src/routes/monitoring/indexer';

const {
  TONIC_DATA_SERVICE_API_URL,
  TONIC_DATA_SERVICE_INDEXER_ALERT_DISCORD_WEBHOOK_ID,
  TONIC_DATA_SERVICE_INDEXER_ALERT_DISCORD_WEBHOOK_TOKEN,
  TONIC_DATA_SERVICE_INDEXER_ALERT_THRESHOLD = '60',
} = process.env;

if (!TONIC_DATA_SERVICE_API_URL) {
  console.error('Error: missing TONIC_DATA_API_URL');
  process.exit(1);
}

if (!TONIC_DATA_SERVICE_INDEXER_ALERT_DISCORD_WEBHOOK_ID) {
  console.warn('Warning: missing TONIC_DATA_SERVICE_INDEXER_ALERT_DISCORD_WEBHOOK_ID');
  process.exit(1);
}

if (!TONIC_DATA_SERVICE_INDEXER_ALERT_DISCORD_WEBHOOK_TOKEN) {
  console.warn('Warning: missing TONIC_DATA_SERVICE_INDEXER_ALERT_DISCORD_WEBHOOK_TOKEN');
  process.exit(1);
}

async function sendAlert(content: string) {
  const id = TONIC_DATA_SERVICE_INDEXER_ALERT_DISCORD_WEBHOOK_ID;
  const token = TONIC_DATA_SERVICE_INDEXER_ALERT_DISCORD_WEBHOOK_TOKEN;
  await axios.post(`https://discord.com/api/webhooks/${id}/${token}`, { content });
}

async function getLatestBlock(): Promise<IndexerProcessedBlock> {
  const res = await axios.get<IndexerProcessedBlock>(`${TONIC_DATA_SERVICE_API_URL}/monitoring/indexer`);
  return res.data;
}

async function run() {
  const latest = await getLatestBlock();

  const threshold = parseInt(TONIC_DATA_SERVICE_INDEXER_ALERT_THRESHOLD);
  if (latest.seconds_since > threshold) {
    sendAlert(
      `@everyone indexer is lagging:
        latest block ${latest.latest_block_height}
        processed at ${latest.processed_at}
        (seconds since: ${latest.seconds_since})
      `
    );
  }
}

(async () => await run())();
