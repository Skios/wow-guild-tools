import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload } from 'jose';

export const SUPABASE_URL = 'http://127.0.0.1:54321';
export const ISSUER = `${SUPABASE_URL}/auth/v1`;
export const OFFICER_SUB = '0b6e1c1e-1111-4c55-9d7e-0000000000aa';

/** A Supabase-like ES256 signing key, its public JWKS, and a signer for access tokens. */
export async function makeSigner(kid = 'test-key') {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid, alg: 'ES256', use: 'sig' }] });

  // undefined drops a claim (JSON.stringify skips it), e.g. { sub: undefined } for "no subject".
  const sign = (claims: Record<string, unknown> = {}, options: { expiresIn?: string | number } = {}) =>
    new SignJWT({ sub: OFFICER_SUB, role: 'authenticated', aud: 'authenticated', iss: ISSUER, ...claims })
      .setProtectedHeader({ alg: 'ES256', kid })
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? '1h')
      .sign(privateKey);

  return { jwks, sign, keyPair: async () => ({ privateKey, publicKey }) };
}

/** A token with `alg: none` and no signature: must never be accepted. */
export function unsignedToken(claims: JWTPayload) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.`;
}
