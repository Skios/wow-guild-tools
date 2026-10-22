import Fastify, { type FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { capabilitiesOf, type Capability } from '../domain/roles.js';

export const uuid = (n: number) => `3f2b8c1e-8a4d-4c55-9d7e-${String(n).padStart(12, '0')}`;

export async function buildRouteApp(...plugins: FastifyPluginAsync[]) {
  const app = Fastify();
  for (const plugin of plugins) await app.register(plugin);
  return app;
}

/** Like buildRouteApp, with the request already authenticated as an officer (what requireSiteUser would set). */
export async function buildOfficerRouteApp(...plugins: FastifyPluginAsync[]) {
  return buildRouteAppAs(capabilitiesOf('OFFICER'), ...plugins);
}

/** A route app whose signed-in user has exactly these capabilities. */
export async function buildRouteAppAs(capabilities: Capability[], ...plugins: FastifyPluginAsync[]) {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    request.officer = { userId: uuid(1), username: 'Officer', role: 'OFFICER', capabilities };
  });
  for (const plugin of plugins) await app.register(plugin);
  return app;
}

export const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`internal detail for ${code}: table users_secret`, {
    code,
    clientVersion: '5',
  });
