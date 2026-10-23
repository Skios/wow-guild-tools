# Deploy: Vercel + Supabase (free tiers)

Two Vercel projects from the same repository:
- **`wgt-api`**: root directory `./`, the Fastify API and the Telegram webhook (`api/index.ts`, `vercel.json`).
- **`wgt-web`**: root directory `web`, the Next.js admin site. It forwards `/api/*` to the API of its
  environment (`API_ORIGIN`), so the browser only ever talks to the site's own domain.

| Environment | Branch | Vercel (both projects) | Supabase | Telegram bot |
|---|---|---|---|---|
| dev | `develop` | Preview (branch `develop`) | `wgt-dev` (London) | dev bot |
| prod | `main` | Production | `wgt-prod` (Frankfurt) | guild bot |

Flow on every push to `develop` / `main` (`.github/workflows/ci.yml`): checks → `prisma migrate deploy`
on that environment's database → API Deploy Hook → site Deploy Hook. Vercel never deploys on its own
(`git.deploymentEnabled: false`), so code never runs against an older schema. `main` waits for your
approval in the `prod` GitHub Environment.

## 1. Supabase (each project)
- Project Settings → Data API: **off**.
- Project Settings → JWT Keys: an asymmetric key (ES256 or RS256) must be the active one.
- Authentication → Sign In / Providers: **Allow new users to sign up: off**; anonymous sign-ins off.
- Authentication → Sign In / Providers → **Email → "Enable Email provider": ON** (a different switch from
  "Allow new users to sign up"!). Officers type a nickname, but the login runs on the email provider: with it
  off every login fails. Confirm email off; **minimum password length 12** (same as `MIN_LENGTH` in
  `src/domain/password.ts`: Supabase refuses shorter passwords even from our API); password requirements: none
  (the API checks 3 of lowercase / uppercase / digits / symbols).
- Authentication → Rate Limits: as low as you can live with.
- Connect: copy the **Transaction pooler** string (port 6543) and the **Session pooler** string (port 5432).

## 2. Telegram
- One bot per environment (BotFather), each with its own random webhook secret (16+ chars, `A-Z a-z 0-9 _ -`).

## 3. Vercel
In both projects, Environment Variables: Production → tick **Production** only. Dev → tick **Preview** and pick
the custom branch **`develop`** (not "All Preview branches"). Mark secrets as Sensitive.

### `wgt-api` (the project you already have)
- Root directory `./` (repo root); `vercel.json` sets the rest.

  | Variable | Value |
  |---|---|
  | `DATABASE_URL` | Transaction pooler + `?pgbouncer=true&connection_limit=3` |
  | `DIRECT_URL` | Session pooler (port 5432) |
  | `SUPABASE_URL` | `https://<ref>.supabase.co` |
  | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `TELEGRAM_WEBHOOK_SECRET` | that environment's bot |
  | `TRUST_PROXY` | `true` |
  | `SITE_URL` | the site of the same environment, e.g. `https://wgt-web-git-develop-<you>.vercel.app` (the bot links to it) |
  | `SUPABASE_SECRET_KEY` | that project's secret key, marked **Sensitive** (sign-up, password resets). Without it sign-up answers 503 |

  The old `VITE_SUPABASE_*` variables are no longer used here: delete them.
- Deployment Protection: **off** (Vercel Authentication disabled). The site's proxy and Telegram must reach the
  API; every API route has its own login or secret.

### `wgt-web` (new)
- Add New → Project → the same repository → **Root Directory `web`**, framework **Next.js**.
- `web/vercel.json` already turns off deploys on every push (the pipeline uses the Deploy Hooks) and sets region fra1.

  | Variable | Value |
  |---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
  | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the project's publishable key (public) |
  | `API_ORIGIN` | the `wgt-api` URL of the same environment, e.g. `https://wgt-api-git-develop-<you>.vercel.app` (no trailing slash) |

  **Never** put `SUPABASE_SECRET_KEY` (or a service_role key) in the **site** project: everything there can end up
  in the browser. It belongs only to the API project (below).
- In **each** project, Settings → Git → Deploy Hooks: one for branch `main`, one for `develop`.
- Firewall: add a rate-limit rule on paths starting with `/api/` (e.g. 100 requests/min per IP). The API's own
  limit counts per instance only.

## 4. GitHub
- Settings → Environments: `dev` and `prod`. On `prod`: **Required reviewers** = you, deployment branches = `main`.
- Secrets in each environment: `DIRECT_URL` (Session pooler), `VERCEL_DEPLOY_HOOK` (the API project's hook for that
  branch) and `VERCEL_DEPLOY_HOOK_WEB` (the site project's hook for that branch).
- Branch protection on `main` and `develop`: pull requests required, no force pushes.

## 5. After the first deploy of each environment
- `GET https://<site domain>/api/health` must answer `{"status":"ok"}` (it goes through the site's proxy to the API).
- First officer, from your machine with that environment's values:
  fill `.env.dev` (session pooler, project URL, secret key; ignored by git), then
  `npm run officer:dev -- create <name>` (creates the Owner)
- Webhook, pointing at the **API** project's domain (without it the bot receives messages but never forwards them):
  add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` (same values as on Vercel) to `.env.dev`, then
  `npm run telegram:webhook:dev -- https://<api domain>`. It checks `/api/health` first and drops old pending updates.
  Run it again after changing the bot token or the secret.
- Supabase → Authentication → URL Configuration: Site URL = the environment's **site** domain.
