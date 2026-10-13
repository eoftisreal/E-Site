const app = require('./app');
const env = require('./config/env');
const connectDb = require('./config/db');
const mongoose = require('mongoose');

async function start() {
  const server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on :${env.port}`);
  });
  server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 15000);
  server.headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS || 20000);
  server.requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS || 30000);

  try {
    await connectDb();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to connect to database on startup. Server is still running.', error.message);
  }

  const shutdown = async (signal) => {
    // eslint-disable-next-line no-console
    console.log(`Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      try {
        await mongoose.disconnect();
      } finally {
        process.exit(0);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start backend', error);
  process.exit(1);
});
