import type { SiteRole } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { prisma } from '../config/db.js';
import { capabilitiesOf, type Capability } from '../domain/roles.js';

export type Officer = { userId: string; username: string; role: SiteRole; capabilities: Capability[] };
export type TokenVerifier = (token: string) => Promise<{ sub: string }>;

declare module 'fastify' {
  interface FastifyRequest {
    officer?: Officer;
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
      select: { user: { select: { id: true, username: true, role: true } } },
    });
    const user = identity?.user;
    if (!user?.role) return reply.code(403).send({ error: 'Forbidden' });

    request.officer = { userId: user.id, username: user.username, role: user.role, capabilities: capabilitiesOf(user.role) };
  });
}

/** Route hook: 403 unless the signed-in user's role grants `capability`. Runs after requireSiteUser. */
export function requireCapability(capability: Capability) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.officer?.capabilities.includes(capability)) return reply.code(403).send({ error: 'Forbidden' });
  };
}
