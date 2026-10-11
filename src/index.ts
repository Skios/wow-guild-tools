import Fastify from 'fastify';
import { prisma } from './config/db.js';
import { eventRoutes } from './controllers/event.controller.js';
import { telegramRoutes } from './controllers/telegram.controller.js';
import { profileRoutes } from './controllers/profile.controller.js';
import { groupRoutes } from './controllers/group.controller.js';

const server = Fastify({
  logger: true,
});

// Register Routes
server.register(eventRoutes);
server.register(telegramRoutes);
server.register(profileRoutes);
server.register(groupRoutes);

server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
  try {
    await server.listen({ port: 3000, host: '0.0.0.0' });
    console.log('🚀 Server ready at http://localhost:3000');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
