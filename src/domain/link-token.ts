import { createHmac, timingSafeEqual } from 'node:crypto';

// One-time links between a Telegram account and a site account, both directions:
// the bot sends /link?t=<token> (kind telegram), the site opens t.me/<bot>?start=l<token> (kind account).
// Signed, no table: [kind 1][id 16][expiry 4] + 16-byte HMAC = 50 base64url chars, under Telegram's 64.
// Not single-use: linking never replaces an existing link (see linkTelegram), which bounds a leaked token.
export type LinkTarget = { kind: 'account' | 'telegram'; id: string };

// The bot's link travels through a chat; the site's link is made on a click and opened right away.
const TTL_MS = { telegram: 15 * 60_000, account: 5 * 60_000 } as const;
const BODY = 21;
const MAC = 16;
const KINDS = ['account', 'telegram'] as const;

/** A key just for these links, derived from the API's Supabase secret key. */
export const linkKey = (secret: string): Buffer => createHmac('sha256', secret).update('wgt-link-token-v1').digest();

const mac = (key: Buffer, body: Buffer) => createHmac('sha256', key).update(body).digest().subarray(0, MAC);

export function signLinkToken(target: LinkTarget, key: Buffer, now = Date.now()): string {
  const body = Buffer.alloc(BODY);
  body[0] = KINDS.indexOf(target.kind);
  if (target.kind === 'account') Buffer.from(target.id.replace(/-/g, ''), 'hex').copy(body, 1);
  else body.writeBigUInt64BE(BigInt(target.id), 1);
  body.writeUInt32BE(Math.floor((now + TTL_MS[target.kind]) / 1000), 17);
  return Buffer.concat([body, mac(key, body)]).toString('base64url');
}

/** The target, or null when the token is malformed, forged or expired. */
export function verifyLinkToken(token: string, key: Buffer, now = Date.now()): LinkTarget | null {
  if (!/^[A-Za-z0-9_-]{50}$/.test(token)) return null;
  const raw = Buffer.from(token, 'base64url');
  const body = raw.subarray(0, BODY);
  if (raw.length !== BODY + MAC || !timingSafeEqual(raw.subarray(BODY), mac(key, body))) return null;
  if (body.readUInt32BE(17) * 1000 < now) return null;
  const kind = KINDS[body[0]!];
  if (!kind) return null;
  if (kind === 'telegram') return { kind, id: body.readBigUInt64BE(1).toString() };
  const hex = body.subarray(1, 17).toString('hex');
  return { kind, id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` };
}
