import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHANNEL_ID: z.string().min(1),
  // Telegram's secret_token only allows A-Z a-z 0-9 _ - and 1-256 chars.
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/),
  // The Supabase project whose logins the admin site uses (its JWKS verifies the access tokens).
  SUPABASE_URL: z.url({ protocol: /^https?$/ }).refine(isSecureOrLocal, 'must be https (http only for localhost)'),
  // Supabase admin API key: sign-up and password resets. API only (Vercel: Sensitive), never the site.
  // Without it the API runs, and sign-up answers 503.
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  // The site's address (e.g. https://wgt-web-....vercel.app): the bot links to it for sign-up and linking.
  SITE_URL: z.url({ protocol: /^https?$/ }).refine(isSecureOrLocal, 'must be https (http only for localhost)').optional(),
  HOST: z.string().min(1).default('0.0.0.0'),
  // Only behind a proxy that overwrites X-Forwarded-For (e.g. Fly); otherwise clients could spoof their IP.
  TRUST_PROXY: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

function isSecureOrLocal(url: string) {
  if (!URL.canParse(url)) return false; // zod still runs refinements after a failed format check
  const { protocol, hostname } = new URL(url);
  return protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1';
}

export function parseEnv(source: Record<string, string | undefined>) {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const keys = result.error.issues.map(i => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${keys}`);
  }
  return result.data;
}

let cached: ReturnType<typeof parseEnv> | undefined;

/** Validated process.env, parsed once. Call at startup to fail fast. */
export function getEnv() {
  return (cached ??= parseEnv(process.env));
}
