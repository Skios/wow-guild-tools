import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { prisma } from '../config/db.js';
import { capabilitiesOf, registerCapability, type SiteRole } from '../domain/roles.js';

/** The signed-in site user. `role` is the role's name; position and isOwner drive the role-change rules. */
export type Officer = {
  userId: string; username: string; role: string; position: number; isOwner: boolean; capabilities: string[];
  mustChangePassword: boolean; // signed in with a temporary password
};
export type TokenVerifier = (token: string) => Promise<{ sub: string }>;

declare module 'fastify' {
  interface FastifyRequest {
    officer?: Officer;
  }
  interface FastifyContextConfig {
    /** Reachable with a temporary password (who am I, change password); every other route waits. */
    duringPasswordChange?: boolean;
  }
}

// Supabase signs access tokens with an asymmetric key. Pinning the algorithms keeps an
// HS256 token (signed with a guessable shared secret) or alg "none" from ever passing.
const ALGORITHMS = ['ES256', 'RS256'];
const CLOCK_TOLERANCE_SECONDS = 5;
const MAX_HEADER_LENGTH = 4096;
const BEARER = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/i;

/** Verifies a Supabase access token: signature from the project's JWKS, issuer, audience, expiry, real user. */
export function supabaseTokenVerifier(supabaseUrl: string, keys?: JWTVerifyGetKey): TokenVerifier {
  const base = supabaseUrl.replace(/\/+$/, '');
  // jose caches the keys and refetches (with a cooldown) only when it meets an unknown key id.
  const jwks = keys ?? createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
  const options = { algorithms: ALGORITHMS, issuer: `${base}/auth/v1`, audience: 'authenticated', clockTolerance: CLOCK_TOLERANCE_SECONDS, requiredClaims: ['exp', 'sub'] };

  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, options);
    if (typeof payload.sub !== 'string' || payload.sub === '') throw new Error('token has no subject');
    // The anon/service keys are valid project JWTs too; only a signed-in, non-anonymous user counts.
    if (payload.role !== 'authenticated' || payload.is_anonymous === true) throw new Error('not a user token');
    return { sub: payload.sub };
  };
}

/**
 * Admin-site routes: a valid Supabase login backed by a User with a site role in OUR database.
 * The role is read on every request, so a revoke or a demotion takes effect immediately.
 * Call directly on a scope (not via register) so the hook covers that scope's routes.
 */
export function requireSiteUser(scope: FastifyInstance, verify: TokenVerifier) {
  scope.addHook('onRequest', async (request, reply) => {
    const header = request.headers.authorization;
    const token = header && header.length <= MAX_HEADER_LENGTH ? BEARER.exec(header)?.[1] : undefined;
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });

    let sub: string;
    try {
      ({ sub } = await verify(token));
    } catch (err) {
      request.log.info({ err }, 'rejected access token');
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // A database error propagates to the error handler: an outage must not look like "not an officer".
    const identity = await prisma.identity.findUnique({
      where: { platform_platformUserId: { platform: 'supabase', platformUserId: sub } },
      select: { user: { select: { id: true, username: true, mustChangePassword: true, role: { select: ROLE_FIELDS } } } },
    });
    const user = identity?.user;
    if (!user?.role) return reply.code(403).send({ error: 'Forbidden' });

    request.officer = { ...asOfficer(user.id, user.username, user.role), mustChangePassword: user.mustChangePassword };
    if (user.mustChangePassword && !request.routeOptions.config?.duringPasswordChange) {
      return reply.code(403).send({ error: 'Change your password first', code: 'password_change_required' });
    }
  });
}

const ROLE_FIELDS = { name: true, position: true, capabilities: true, isOwner: true } as const;

const asOfficer = (userId: string, username: string, role: SiteRole) => ({
  userId, username, role: role.name, position: role.position, isOwner: role.isOwner, capabilities: capabilitiesOf(role),
});

/**
 * Route hook: 403 unless the signed-in user's role grants `capability`. Runs after requireSiteUser.
 * Calling it registers the capability, which makes it selectable on the Roles page.
 */
export function requireCapability(capability: string) {
  registerCapability(capability);
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.officer?.capabilities.includes(capability)) return reply.code(403).send({ error: 'Forbidden' });
  };
}

/** Route hook: only the Owner (configuring roles is not a capability that can be handed out). */
export async function requireOwner(request: FastifyRequest, reply: FastifyReply) {
  if (!request.officer?.isOwner) return reply.code(403).send({ error: 'Forbidden' });
}
