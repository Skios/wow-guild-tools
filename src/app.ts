import Fastify from 'fastify';
import { adminRoutes } from './controllers/admin.controller.js';
import { eventRoutes } from './controllers/event.controller.js';
import { groupRoutes } from './controllers/group.controller.js';
import { profileRoutes } from './controllers/profile.controller.js';
import { telegramRoutes } from './controllers/telegram.controller.js';
import { requireApiKey } from './plugins/auth.js';

export async function buildApp(options: { logger?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ?? false });

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // The webhook has its own secret; everything else is officer-only.
  await app.register(telegramRoutes);
  await app.register(async (officer) => {
    requireApiKey(officer);
    await officer.register(adminRoutes);
    await officer.register(eventRoutes);
    await officer.register(profileRoutes);
    await officer.register(groupRoutes);
  });

  return app;
}
