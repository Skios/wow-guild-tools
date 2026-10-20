import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHANNEL_ID: z.string().min(1),
  // Telegram's secret_token only allows A-Z a-z 0-9 _ - and 1-256 chars.
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/),
  // Optional while the admin has no login: without it the server only listens on localhost.
  API_KEY: z.preprocess(value => (value === '' ? undefined : value), z.string().min(16).optional()),
  HOST: z.string().min(1).optional(),
  // Only behind a proxy that overwrites X-Forwarded-For (e.g. Fly); otherwise clients could spoof their IP.
  TRUST_PROXY: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
}).transform(env => ({ ...env, HOST: env.HOST ?? (env.API_KEY ? '0.0.0.0' : '127.0.0.1') }));

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
