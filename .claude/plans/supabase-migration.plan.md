# Plan: migration to Supabase (DB + Auth), 2 environments + local

Status: in progress (2026-10-21). Sources: ECC architect, database-reviewer, security-reviewer, docs research.

## Target
| | DB + Auth | API + bot | Web |
|---|---|---|---|
| local | Supabase CLI (`npx supabase start`, DB :54322, API :54321) | `npm run dev` | `vite` (proxy) |
| dev | Supabase project `wgt-dev` | Fly app `wgt-dev` | served by the API (same origin) |
| prod | Supabase project `wgt-prod` | Fly app `wgt-prod` | served by the API (same origin) |

Free plan: exactly 2 projects; pause after 7 days idle; no backups -> own pg_dump cron.

## Decisions
- Prisma stays the only migration tool (`migrate dev` only locally, `migrate deploy` in CI). Tables stay in `public`.
- Connection: Supabase **session pooler** (port 5432, IPv4) as the single `DATABASE_URL` (long-running Node process). No `directUrl` needed.
- Data API lock-down: migration enabling RLS (no policies) on every table + revoke from anon/authenticated (guarded for plain Postgres); disable Data API in dashboard.
- Auth: Supabase Auth (Discord in hosted envs, email locally). Web uses supabase-js with `flowType: 'pkce'` (hash router). API verifies the bearer JWT with `jose` (`createRemoteJWKSet`, pinned ES256/RS256, issuer `${SUPABASE_URL}/auth/v1`, audience `authenticated`), maps `sub` -> `Identity('supabase', sub)` -> `User`, requires `User.isOfficer` from the DB on every request. 401/403 uniform.
- Officer bootstrap: `scripts/grant-officer.ts <sub|discord id>` per environment; signing in grants nothing.
- API_KEY and the 127.0.0.1 fallback are removed; auth is mandatory (no fail-open).
- Web served by Fastify (`@fastify/static`), officer routes under `/api`: one origin, no CORS.
- Local signing key: `supabase gen signing-key --algorithm ES256` -> `supabase/signing_keys.json` (gitignored) so the local JWKS behaves like prod.
- Per environment: own Supabase project, Discord OAuth app, Telegram bot + webhook secret, Fly app + deploy token, GitHub Environment (prod needs approval, `main` only).
- n8n: not in the core path; maybe later as an external API client for non-critical automations.

## Phases
### 0a. Hardening (no accounts) — done (18b2c78)
- `@fastify/rate-limit`, explicit `bodyLimit`, `trustProxy` setting, global error handler, generic 500 message (`src/lib/http-error.ts`).
- Webhook secret check in `onRequest`.
- `coverage/` untracked + gitignored.
### 0b. Supabase local — done
- `supabase` CLI as devDependency, `supabase init`, config.toml (email auth, site_url, redirect urls, signing_keys_path).
- RLS lock-down migration; seed guard (refuse on supabase hosts without `ALLOW_SEED=1`).
- README/.env.example for local Supabase.
### 0c. API auth
- `jose`; `requireOfficer` plugin + tests (wrong alg, none, wrong iss/aud, expired, anon role, missing sub, unknown user, non-officer).
- `User.isOfficer` migration; `/auth/me`; `createdBy` from the officer; `grant-officer` script; drop API_KEY.
### 0d. Web login
- supabase-js (PKCE), auth gate, sign in/out, bearer token per request, 401 -> sign out, 403 -> "not an officer".
- API serves `web/dist`, officer routes under `/api`.
### 0e. Delivery
- Dockerfile, fly.toml, `.github/workflows/deploy.yml` (migrate deploy -> fly deploy -> set Telegram webhook), backup cron (pg_dump), actions pinned.
### 1. dev environment (needs accounts: Supabase, Fly, Discord app, dev bot)
### 2. prod environment behind approval
### 3. (optional) officer management UI
