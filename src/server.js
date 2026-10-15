'use strict';
const config = require('./config/env'); // falha rápido se a configuração for inválida
const prisma = require('./config/prisma');
const logger = require('./utils/logger');
const { createApp } = require('./app');

async function main() {
  await prisma.$connect();
  const listenOptions = config.isDevelopment ? { port: config.port, host: '0.0.0.0' } : { port: config.port };
  const server = createApp().listen(listenOptions, () => logger.info('server_started', {
    port: config.port,
    host: config.isDevelopment ? '0.0.0.0' : undefined,
    env: config.env,
  }));

  const shutdown = async (signal) => {
    logger.info('shutdown', { signal });
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (err) => logger.error('unhandled_rejection', err));
main().catch((err) => {
  logger.error('startup_failed', err);
  process.exit(1);
});
