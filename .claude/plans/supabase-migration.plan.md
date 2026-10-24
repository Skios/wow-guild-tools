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
  Supabase signup closed; sign-up goes through our API (POST /api/signup) with the secret key, which lives only in the
  API project (user decision 2026-10-23: DATABASE_URL already gives the API full DB access). Never in the site.
- API verifies Supabase JWTs (jose, ES256/RS256 pinned, issuer, audience, role, not anonymous) and reads the user's role per request (roles table: see accounts.plan.md).
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
- [ ] Hosted Supabase settings per project: signup off, anonymous sign-ins off, min password 12, email provider ON,
      auth rate limits; SUPABASE_SECRET_KEY only in the API Vercel project (Sensitive)
### 0f Free pipeline (GitHub Actions) — done
- [x] Push to develop/main: checks -> `prisma migrate deploy` -> Vercel Deploy Hook (Vercel never auto-deploys)
- [x] Prod: GitHub Environment `prod` with required reviewer; actions pinned to commit SHAs
### 0g Handover
- [x] docs/deploy.md: Supabase, Telegram, Vercel, GitHub settings and variables (user does these)
- [x] First Owner on dev (`npm run officer:dev -- create <name> --role owner`)

## After the first deploy + test
### Migrate the admin site to Next.js — done, live on dev (2026-10-23)
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
- Done: Next 16.4.2 (16.4.0 had a critical advisory), wgt-web project (root web, Next.js, Node 22, protection off),
  API project protection off, pipeline deploys only what changed, actions on Node 24.
- Note: the very first deploy of a new Vercel project lands in Production even from develop (no env there -> fails);
  re-run once, later deploys of develop are Preview.
- [ ] Delete VITE_SUPABASE_* from the API project (no longer read).
- [ ] Supabase dev: Site URL = https://wgt-web-git-develop-acme-c35a.vercel.app
- [ ] Verify the API sees the real client IP through the site's rewrite (rate limiting).

## Done: accounts, characters, contact channels (2026-10-23)
See .claude/plans/accounts.plan.md (all 8 steps: roles, sign-up, Users page + password resets, Telegram link,
profile and characters, roster approval + new season, notes on answers, Roles page).

## Parked
- [x] Telegram on dev works (2026-10-23): the webhook had never been set; `npm run telegram:webhook:dev` fixed it,
  /start and "Link Telegram" both link. [ ] Rotate the dev bot token (pasted in chat), then re-run the script.

## Later
- Check that the API sees the real client IP through the site's rewrite (rate limits per IP), before the alpha.
- Alpha preview with a group of testers, then the prod environment: wgt-prod Supabase settings, Production env
  vars in both Vercel projects, prod bot, prod hooks.
- M4 reminders as scheduled jobs per event (officers pick the times); Supabase pg_cron every few minutes sends the
  due ones to whoever hasn't answered (accounts.plan.md "Later").
- [x] In-game invite macros on the Roster page (2026-10-24).
- Homepage for everyone: next events with quick answers and a note dialog.
- Discord bot for players who don't use Telegram (Identity already multi-platform)
- Officer management page in the admin site (optional)
- Tests: DB integration tests on a real Postgres in CI (migrate deploy, then services without mocks) and a few
  Playwright E2E flows (login, approve, answer with a note). Parked by the user 2026-10-24: features first.
