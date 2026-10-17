import Fastify, { type FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';

export const uuid = (n: number) => `3f2b8c1e-8a4d-4c55-9d7e-${String(n).padStart(12, '0')}`;

export async function buildRouteApp(...plugins: FastifyPluginAsync[]) {
  const app = Fastify();
  for (const plugin of plugins) await app.register(plugin);
  return app;
}

export const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`internal detail for ${code}: table users_secret`, {
    code,
    clientVersion: '5',
  });
