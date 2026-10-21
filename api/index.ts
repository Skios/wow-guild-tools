// Vercel entry point: one function for every /api/* request (see the rewrite in vercel.json).
// Fastify never listens here; Vercel hands us the raw request and we feed it to Fastify's router.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../src/app.js';
import { getEnv } from '../src/config/env.js';

getEnv(); // fail fast on missing configuration, as src/index.ts does locally
// Fastify doesn't log headers by default; the redaction keeps it that way if that ever changes.
const app = await buildApp({
  logger: { redact: ['req.headers.authorization', 'req.headers["x-telegram-bot-api-secret-token"]'] },
});
await app.ready();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  app.server.emit('request', req, res);
}
