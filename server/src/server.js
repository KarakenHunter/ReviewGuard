try { process.loadEnvFile(); } catch { /* no .env file: use real environment */ }
const mongoose = require('mongoose');
const { loadConfig } = require('./config/env');
const { createAiClient } = require('./services/aiClient');
const { createApp } = require('./app');

async function main() {
  const config = loadConfig();
  mongoose.set('strictQuery', true);
  mongoose.set('bufferTimeoutMS', 3000); // fail fast (503) instead of hanging when MongoDB is unreachable
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 10 });
  const app = createApp({ config, ai: createAiClient(config) });
  const server = app.listen(config.port, () => console.log(JSON.stringify({ level: 'info', msg: 'listening', port: config.port, env: config.nodeEnv })));
  const stop = () => server.close(() => mongoose.disconnect().then(() => process.exit(0)));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
main().catch((e) => { console.error(JSON.stringify({ level: 'fatal', msg: e.message })); process.exit(1); });
