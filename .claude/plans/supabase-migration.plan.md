# Backlog: Vercel + Supabase, 2 environments + local

Updated 2026-10-21. Rule 0: zero cost (free tiers only). Process per phase (ECC + ponytail):
failing tests -> minimal code -> ecc:code-reviewer + ecc:security-reviewer -> fix CRITICAL/HIGH -> commit.

## Target
| | DB + Auth | API + bot + admin site |
|---|---|---|
| local | Supabase CLI (`npx supabase start`: DB :54322, Auth :54321, Studio :54323) | `npm run dev` + `vite` |
| dev | Supabase `wgt-dev` (London) | Vercel Preview, branch `develop` |
| prod | Supabase `wgt-prod` (Frankfurt) | Vercel Production, branch `main` |

## Decisions
- Prisma stays (schema, migrations, transactions). Tables in `public`, RLS on every table (test-enforced), Data API off.
- Hosting: Vercel Hobby (Fastify zero-config, one function, region fra1). Hobby cron is daily only -> reminders via Supabase pg_cron.
- Officer login: nickname + password on Supabase Auth, mapped to `<name>@wgt.invalid`. No real emails, no personal data.
  Signup closed; accounts created/reset/revoked only by `npm run officer` (secret key, scripts only). Last officer can't be revoked.
- API verifies Supabase JWTs (jose, ES256/RS256 pinned, issuer, audience, role, not anonymous) and reads the user's role per request (see roles.plan.md).
- Players are reached only via chat platforms (Telegram now, Discord bot later).
- Repo public; secrets only in Vercel / GitHub settings. Prod migrations need manual approval (GitHub Environments).
- n8n, Graphify: not now.

## Done
- 0a Hardening (18b2c78): rate limit, body limit, TRUST_PROXY, global error handler, webhook secret in onRequest.
- 0b Local Supabase (9d8f172): CLI + config, ES256 key, RLS lock-down migration + test, seed guard.

## In progress
### 0c API login — done (review: no CRITICAL/HIGH; fixes applied)
- [x] jose verifier + requireOfficer (tests: alg none/HS256, other project, expired, anon/service role, non-officer)
- [x] SUPABASE_URL (https unless localhost), API_KEY removed, HOST 0.0.0.0, /auth/me, creator = signed-in officer
- [x] User.isOfficer migration; officer service + `npm run officer` (create/reset/revoke/list)
- [x] Signup closed, email provider on (password logins), min password length 16
- [x] End-to-end check on local Supabase: login -> token -> /auth/me 200, non-officer 403, no token 401, anon key 401
- [x] Docs, verify-core.ts removed, ecc:security-reviewer + ecc:code-reviewer, fixes, commit

## Next
### 0d Admin site login — done (1a4a4ef)
- [x] @supabase/supabase-js, login page (name + password), sign out, officer name in the top bar
- [x] Bearer token on every call; 401 -> back to login; 403 -> "not an officer"
- [x] Tests: expired session, wrong password, network down, sign-out in another tab (react + security review)
### 0e Vercel adaptation — done (code + security review applied)
- [x] Bot drafts (registration, late minutes) from memory to a DB table with expiry + RLS
- [x] API routes under /api; api/index.ts handler + rewrite; admin site = web/dist (one origin, no CORS)
- [x] Prisma for serverless: transaction pooler (6543, pgbouncer=true, connection_limit=3) + directUrl
- [x] vercel.json: region fra1, deploy only main/develop, CSP/HSTS headers; handler checked with a local HTTP server
- [x] First real deploy (dev, 2026-10-22): /api routing and Prisma engine confirmed by a real Owner login
- [x] TRUST_PROXY=true documented; Vercel Firewall rate rule in docs/deploy.md. Rate limiting on Vercel (security review HIGH): TRUST_PROXY=true behind Vercel; in-memory counters are per instance,
      so add a free layer (Vercel Firewall rule if Hobby allows, else accept + stricter limit on 401/403)
- [ ] Hosted Supabase settings per project: signup off, anonymous sign-ins off, min password 16, email provider ON,
      auth rate limits; never set SUPABASE_SECRET_KEY in Vercel
### 0f Free pipeline (GitHub Actions) — done
- [x] Push to develop/main: checks -> `prisma migrate deploy` -> Vercel Deploy Hook (Vercel never auto-deploys)
- [x] Prod: GitHub Environment `prod` with required reviewer; actions pinned to commit SHAs
### 0g Handover
- [x] docs/deploy.md: Supabase, Telegram, Vercel, GitHub settings and variables (user does these)
- [x] First Owner on dev (`npm run officer:dev -- create <name> --role owner`)

## After the first deploy + test
### Migrate the admin site to Next.js — in progress (decided 2026-10-23)
- Why: the site opens to the whole guild later and will grow with many features.
- **Two Vercel projects** (user choice): `wgt-api` = today's project (Fastify in api/index.ts, unchanged), root `./`;
  `wgt-web` = Next.js in web/, root `web`. Next rewrites `/api/:path*` to the API of its environment
  (`API_ORIGIN`), so the browser keeps one origin, no CORS.
- **Client rendering first** (user choice): App Router, client components, supabase-js login as today (localStorage).
  SSR with @supabase/ssr cookies later, for public pages.
- Routes: /login, /events, /events/[id], /roster (hash routes -> real routes). Components and pure modules reused.
- Env (web): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, API_ORIGIN. CSP/security headers move to next.config.
- API project: vercel.json no longer builds web/; serves only api/ (+ a placeholder index).
- Pipeline: deploys only what changed (web/ -> site; server files -> migrations + API; docs -> nothing).
- After the first two-project deploy: verify the API sees the real client IP through the site's rewrite
  (rate limiting); temporary echo of req.ip / x-forwarded-for, then remove it.
- API changes stay backward compatible (add fields, never remove): site and API deploy separately.
- Tests: vitest + Testing Library kept (next/navigation mocked); coverage bar unchanged.
- Phone app: PWA (installable, free) first; native app only if really needed (React Native/Expo, separate).

## Later
- M4 reminders: Supabase pg_cron -> protected endpoint
- Discord bot for players who don't use Telegram (Identity already multi-platform)
- Officer management page in the admin site (optional)
