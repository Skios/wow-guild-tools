import Fastify from 'fastify';
import { SignJWT } from 'jose';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';
import { ISSUER, OFFICER_SUB, SUPABASE_URL, makeSigner, unsignedToken } from '../test/jwt.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { knownCapabilities, registerCapability } from '../domain/roles.js';
import { requireCapability, requireOwner, requireSiteUser, supabaseTokenVerifier, type Officer, type TokenVerifier } from './auth.js';

registerCapability('roster.manage'); // as a route would

let signer: Awaited<ReturnType<typeof makeSigner>>;
let verify: TokenVerifier;

beforeAll(async () => {
  signer = await makeSigner();
  verify = supabaseTokenVerifier(SUPABASE_URL, signer.jwks);
});

describe('supabaseTokenVerifier', () => {
  test('accepts a Supabase user token and returns its subject', async () => {
    await expect(verify(await signer.sign())).resolves.toEqual({ sub: OFFICER_SUB });
  });

  test('accepts a project URL with a trailing slash', async () => {
    await expect(supabaseTokenVerifier(`${SUPABASE_URL}/`, signer.jwks)(await signer.sign())).resolves.toEqual({ sub: OFFICER_SUB });
  });

  test.each([
    ['another project', { iss: 'https://other.supabase.co/auth/v1' }],
    ['a different audience', { aud: 'someone-else' }],
    ['the anon key', { role: 'anon' }],
    ['the service role', { role: 'service_role' }],
    ['an anonymous sign-in', { is_anonymous: true }],
    ['no subject', { sub: undefined }],
    ['an empty subject', { sub: '' }],
  ])('rejects a token from %s', async (_, claims) => {
    await expect(verify(await signer.sign(claims))).rejects.toThrow();
  });

  test('rejects an expired token', async () => {
    await expect(verify(await signer.sign({}, { expiresIn: Math.floor(Date.now() / 1000) - 60 }))).rejects.toThrow();
  });

  test('rejects a token signed by a key that is not in the JWKS', async () => {
    const stranger = await makeSigner('test-key');
    await expect(verify(await stranger.sign())).rejects.toThrow();
  });

  test('rejects alg none', async () => {
    const token = unsignedToken({ sub: OFFICER_SUB, role: 'authenticated', aud: 'authenticated', iss: ISSUER, exp: 9999999999 });
    await expect(verify(token)).rejects.toThrow();
  });

  test('rejects an HS256 token, even one signed with the well-known local secret', async () => {
    const secret = new TextEncoder().encode('super-secret-jwt-token-with-at-least-32-characters-long');
    const token = await new SignJWT({ sub: OFFICER_SUB, role: 'authenticated', aud: 'authenticated', iss: ISSUER })
      .setProtectedHeader({ alg: 'HS256', kid: 'test-key' })
      .setExpirationTime('1h')
      .sign(secret);
    await expect(verify(token)).rejects.toThrow();
  });

  test('rejects a token without an expiry', async () => {
    const forever = await makeSigner('test-key');
    const token = await new SignJWT({ sub: OFFICER_SUB, role: 'authenticated', aud: 'authenticated', iss: ISSUER })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .sign((await forever.keyPair()).privateKey);
    await expect(supabaseTokenVerifier(SUPABASE_URL, forever.jwks)(token)).rejects.toThrow();
  });

  test('rejects garbage', async () => {
    await expect(verify('a.b.c')).rejects.toThrow();
  });
});

describe('requireSiteUser', () => {
  const officerIdentity = { user: { id: 'u1', username: 'Brannock', role: { name: 'Officer', position: 20, isOwner: false, capabilities: ['roster.manage', 'gone.away'] } } };

  async function app(verifier: TokenVerifier = verify) {
    const fastify = Fastify();
    await fastify.register(async (scope) => {
      requireSiteUser(scope, verifier);
      scope.get('/secure', async (request) => request.officer);
    });
    fastify.get('/open', async () => ({ ok: true }));
    return fastify;
  }
  const call = async (authorization?: string) =>
    (await app()).inject({ url: '/secure', headers: authorization === undefined ? {} : { authorization } });

  beforeEach(() => {
    resetPrismaMock();
    prismaMock.identity.findUnique.mockResolvedValue(officerIdentity);
  });

  test('lets an officer in and tells the route who they are', async () => {
    const res = await call(`Bearer ${await signer.sign()}`);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      userId: 'u1', username: 'Brannock', role: 'Officer', position: 20, isOwner: false,
      capabilities: ['roster.manage'], // a stale capability name grants nothing
    });
    expect(prismaMock.identity.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { platform_platformUserId: { platform: 'supabase', platformUserId: OFFICER_SUB } },
    }));
  });

  test('accepts the scheme in any case', async () => {
    expect((await call(`bearer ${await signer.sign()}`)).statusCode).toBe(200);
  });

  test.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['a basic auth header', 'Basic dXNlcjpwYXNz'],
    ['a bare token', 'eyJ.eyJ.sig'],
    ['a scheme without token', 'Bearer '],
    ['two tokens', 'Bearer a.b.c d.e.f'],
    ['an invalid token', 'Bearer a.b.c'],
    ['an oversized header', `Bearer ${'a'.repeat(5000)}.b.c`],
  ])('401 for %s, without asking the database', async (_, header) => {
    const res = await call(header);

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Unauthorized' });
    expect(prismaMock.identity.findUnique).not.toHaveBeenCalled();
  });

  test('403 for a valid login that no user row backs', async () => {
    prismaMock.identity.findUnique.mockResolvedValue(null);
    const res = await call(`Bearer ${await signer.sign()}`);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Forbidden' });
  });

  test('403 for a known user without a site role (signing in grants nothing)', async () => {
    prismaMock.identity.findUnique.mockResolvedValue({ user: { id: 'u2', username: 'Rando', role: null } });
    expect((await call(`Bearer ${await signer.sign()}`)).statusCode).toBe(403);
  });

  test('a database outage is not mistaken for a missing officer', async () => {
    prismaMock.identity.findUnique.mockRejectedValue(new Error('db down'));

    // Left to the error handler (500 here, 503 in the app for an unreachable database), never a 403.
    expect((await call(`Bearer ${await signer.sign()}`)).statusCode).toBe(500);
  });

  test('does not protect routes outside its scope', async () => {
    expect((await (await app()).inject('/open')).statusCode).toBe(200);
  });
});

describe('requireCapability / requireOwner', () => {
  async function app(officer: Partial<Officer> | undefined) {
    const fastify = Fastify();
    fastify.addHook('onRequest', async (request) => {
      if (officer) request.officer = { userId: 'u1', username: 'x', role: 'Officer', position: 20, isOwner: false, capabilities: [], ...officer };
    });
    fastify.get('/accounts', { onRequest: requireCapability('accounts.manage') }, async () => ({ ok: true }));
    fastify.get('/owner', { onRequest: requireOwner }, async () => ({ ok: true }));
    return fastify;
  }

  test('lets through a user who has the capability', async () => {
    expect((await (await app({ capabilities: ['accounts.manage'] })).inject('/accounts')).statusCode).toBe(200);
  });

  test('403 for a signed-in user without it', async () => {
    const res = await (await app({ capabilities: ['roster.manage'] })).inject('/accounts');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Forbidden' });
  });

  test('403 when nobody is signed in (never trusts a missing user)', async () => {
    expect((await (await app(undefined)).inject('/accounts')).statusCode).toBe(403);
    expect((await (await app(undefined)).inject('/owner')).statusCode).toBe(403);
  });

  test('declaring a capability on a route makes it known (and a malformed name fails at startup)', () => {
    requireCapability('brand.new');
    expect(knownCapabilities()).toContain('brand.new');
    expect(() => requireCapability('admin')).toThrow(/capability/i);
  });

  test('Owner-only routes refuse everyone else, whatever their capabilities', async () => {
    expect((await (await app({ isOwner: true })).inject('/owner')).statusCode).toBe(200);
    expect((await (await app({ capabilities: ['accounts.manage', 'roster.manage'] })).inject('/owner')).statusCode).toBe(403);
  });
});
