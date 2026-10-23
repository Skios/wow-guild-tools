import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';
// Rewrites are fixed at build time: on Vercel a missing API_ORIGIN would silently proxy to localhost.
if (process.env.VERCEL && !process.env.API_ORIGIN) throw new Error('Set API_ORIGIN (the wgt-api URL of this environment)');
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';

// ponytail: Next's client runtime needs inline scripts, so script-src keeps 'unsafe-inline'.
// Nonces (middleware + dynamic rendering) are the upgrade path once auth moves server-side.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`, // React dev tooling uses eval
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co${dev ? ' http://127.0.0.1:54321' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const config: NextConfig = {
  // web/ is its own app inside the repo (the root holds the API): don't let Turbopack pick the root lockfile.
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
  redirects: async () => [{ source: '/', destination: '/events', permanent: false }],
  // The API lives elsewhere; the browser only ever sees one origin (no CORS).
  rewrites: async () => [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }],
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      ],
    },
  ],
};

export default config;
