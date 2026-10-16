import Fastify from 'fastify';
import { prisma } from './config/db.js';
import { getEnv } from './config/env.js';
import { requireApiKey } from './plugins/auth.js';
import { eventRoutes } from './controllers/event.controller.js';
import { telegramRoutes } from './controllers/telegram.controller.js';
import { profileRoutes } from './controllers/profile.controller.js';
import { groupRoutes } from './controllers/group.controller.js';

const env = getEnv(); // fail fast on missing or invalid configuration

const server = Fastify({
  logger: true,
});

// Register Routes
// Webhook has its own secret; everything else is officer-only.
server.register(telegramRoutes);
server.register(async (officer) => {
  requireApiKey(officer);
  await officer.register(eventRoutes);
  await officer.register(profileRoutes);
  await officer.register(groupRoutes);
});

server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
  try {
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await server.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}
