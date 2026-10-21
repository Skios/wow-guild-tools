import { buildApp } from './app.js';
import { prisma } from './config/db.js';
import { getEnv } from './config/env.js';

const env = getEnv(); // fail fast on missing or invalid configuration
const server = await buildApp({ logger: true });

try {
  await server.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await server.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}
