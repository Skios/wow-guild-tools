import Fastify, { type FastifyPluginAsync, type FastifyServerOptions } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { adminRoutes } from './controllers/admin.controller.js';
import { eventRoutes } from './controllers/event.controller.js';
import { groupRoutes } from './controllers/group.controller.js';
import { accountRoutes } from './controllers/account.controller.js';
import { linkRoutes } from './controllers/link.controller.js';
import { TelegramClient } from './integrations/telegram/telegram.client.js';
import { linkConfig } from './services/link.service.js';
import { signupRoutes } from './controllers/signup.controller.js';
import { roleRoutes } from './controllers/role.controller.js';
import { profileRoutes } from './controllers/profile.controller.js';
import { rosterRoutes } from './controllers/roster.controller.js';
import { telegramRoutes } from './controllers/telegram.controller.js';
import { getEnv } from './config/env.js';
import { sendError } from './lib/http-error.js';
import { OfficerService, supabaseAuthAdmin } from './services/officer.service.js';
import { requireCapability, requireSiteUser, supabaseTokenVerifier, type TokenVerifier } from './plugins/auth.js';

// What the routes use from OfficerService (tests pass a stand-in).
type AccountService = Pick<OfficerService, 'signup' | 'listAccounts' | 'resetPasswordFor' | 'changeOwnPassword'>;

const BODY_LIMIT_BYTES = 100 * 1024;
const RATE_LIMIT_PER_MINUTE = 300;

export async function buildApp(options: { logger?: FastifyServerOptions['logger']; verifyToken?: TokenVerifier; accounts?: AccountService } = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: BODY_LIMIT_BYTES,
    // Behind a hosting proxy the client IP is in X-Forwarded-For; without this every client shares one rate limit.
    trustProxy: getEnv().TRUST_PROXY ?? false,
  });

  // Fastify's own 4xx (bad JSON, body too large, rate limit) carry safe messages; anything else is hidden.
  app.setErrorHandler((error, request, reply) => {
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: (error as Error).message });
    return sendError(request, reply, error);
  });

  // ponytail: in-memory store, fine for one instance; move to a shared store if the API ever scales out.
  await app.register(rateLimit, { max: RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' });

  // Everything lives under /api: on Vercel the same domain serves the admin site, and only /api reaches us.
  const env = getEnv();
  const verifyToken = options.verifyToken ?? supabaseTokenVerifier(env.SUPABASE_URL);
  // The secret key only creates and manages logins (OfficerService); it never leaves the API.
  const accounts = options.accounts
    ?? (env.SUPABASE_SECRET_KEY ? new OfficerService(supabaseAuthAdmin(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY)) : null);
  await app.register(async (api) => {
    api.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

    // The webhook has its own secret and sign-up needs no login. Everything else needs a Supabase login with a site role,
    // and each group of routes the capability it needs (src/domain/roles.ts).
    await api.register(telegramRoutes);
    await api.register(signupRoutes(accounts));
    await api.register(async (site) => {
      requireSiteUser(site, verifyToken);
      const guarded = (capability: string, routes: FastifyPluginAsync) => site.register(async (scope) => {
        scope.addHook('onRequest', requireCapability(capability));
        await scope.register(routes);
      });
      await site.register(adminRoutes); // who am I, game data: any site user
      await site.register(roleRoutes); // each route checks Owner / accounts.manage itself
      await site.register(accountRoutes(accounts)); // Users page (accounts.manage) and your own password
      const bot = new TelegramClient();
      await site.register(linkRoutes({ config: linkConfig, botUsername: () => bot.getBotUsername() })); // your Telegram link
      await guarded('events.manage', eventRoutes);
      await guarded('roster.manage', rosterRoutes);
      await guarded('roster.manage', profileRoutes);
      await guarded('roster.manage', groupRoutes);
    });
  }, { prefix: '/api' });

  return app;
}
