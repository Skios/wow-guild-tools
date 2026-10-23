import Fastify, { type FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { registerCapability } from '../domain/roles.js';
import type { Officer } from '../plugins/auth.js';

// What the seeded Officer role grants (prisma/migrations/20261023120000_roles_table).
export const OFFICER_CAPABILITIES = ['roster.manage', 'events.manage', 'messages.send', 'accounts.manage'];

export const uuid = (n: number) => `3f2b8c1e-8a4d-4c55-9d7e-${String(n).padStart(12, '0')}`;

export async function buildRouteApp(...plugins: FastifyPluginAsync[]) {
  const app = Fastify();
  for (const plugin of plugins) await app.register(plugin);
  return app;
}

/** Like buildRouteApp, with the request already authenticated as an officer (what requireSiteUser would set). */
export async function buildOfficerRouteApp(...plugins: FastifyPluginAsync[]) {
  return buildRouteAppAs(OFFICER_CAPABILITIES, ...plugins);
}

/** A route app whose signed-in user has exactly these capabilities. */
export async function buildRouteAppAs(capabilities: string[], ...plugins: FastifyPluginAsync[]) {
  return buildRouteAppFor({ capabilities }, ...plugins);
}

/** A route app signed in as an Officer, with any field overridden (e.g. { isOwner: true }). */
export async function buildRouteAppFor(over: Partial<Officer>, ...plugins: FastifyPluginAsync[]) {
  const officer: Officer = { userId: uuid(1), username: 'Officer', role: 'Officer', position: 20, isOwner: false, capabilities: [], ...over };
  officer.capabilities.forEach(registerCapability);
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    request.officer = officer;
  });
  for (const plugin of plugins) await app.register(plugin);
  return app;
}

export const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`internal detail for ${code}: table users_secret`, {
    code,
    clientVersion: '5',
  });
