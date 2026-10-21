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
- API verifies Supabase JWTs (jose, ES256/RS256 pinned, issuer, audience, role, not anonymous) and reads `User.isOfficer` per request.
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
### 0d Admin site login
- [ ] @supabase/supabase-js, login page (name + password), sign out, officer name in the top bar
- [ ] Bearer token on every call; 401 -> back to login; 403 -> "not an officer"
- [ ] Tests: expired session, wrong password, network down, sign-out in another tab
### 0e Vercel adaptation
- [ ] Bot drafts (registration, late minutes) from memory to a DB table with expiry + RLS
- [ ] API routes under /api; admin site built as static files in the same project (one origin, no CORS)
- [ ] Prisma for serverless: transaction pooler (6543, pgbouncer=true) + directUrl, Vercel binary target
- [ ] vercel.json: region fra1, build only main/develop; local build check with the Vercel CLI
- [ ] Rate limiting on Vercel (security review HIGH): TRUST_PROXY=true behind Vercel; in-memory counters are per instance,
      so add a free layer (Vercel Firewall rule if Hobby allows, else accept + stricter limit on 401/403)
- [ ] Hosted Supabase settings per project: signup off, anonymous sign-ins off, min password 16, email provider ON,
      auth rate limits; never set SUPABASE_SECRET_KEY in Vercel
### 0f Free pipeline (GitHub Actions)
- [ ] Push to develop: tests, then `prisma migrate deploy` on dev
- [ ] Prod: migrations behind manual approval; actions pinned to commit SHAs
### 0g Handover
- [ ] Exact variable list for Vercel (Production / Preview-develop) and GitHub; import steps for the user
- [ ] Create the first officer on dev with `npm run officer`

## Later
- M4 reminders: Supabase pg_cron -> protected endpoint
- Discord bot for players who don't use Telegram (Identity already multi-platform)
- Officer management page in the admin site (optional)
