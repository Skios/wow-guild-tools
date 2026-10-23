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
  off every login fails. Confirm email off; minimum password length 16.
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

  The old `VITE_SUPABASE_*` variables are no longer used here: delete them.
- Deployment Protection: **off** (Vercel Authentication disabled). The site's proxy and Telegram must reach the
  API; every API route has its own login or secret.

### `wgt-web` (new)
- Add New → Project → the same repository → **Root Directory `web`**, framework **Next.js**.
- Settings → Git: the pipeline deploys it, so turn off automatic deployments from Git (Ignored Build Step:
  "Don't build anything", or disconnect auto-deploys) and create the Deploy Hooks below.

  | Variable | Value |
  |---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
  | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the project's publishable key (public) |
  | `API_ORIGIN` | the `wgt-api` URL of the same environment, e.g. `https://wgt-api-git-develop-<you>.vercel.app` (no trailing slash) |

  **Never** set `SUPABASE_SECRET_KEY` (or a service_role key) in Vercel: only `npm run officer` uses it, from your machine.
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
  `npm run officer:dev -- create <name> --role owner` (your first account is the Owner)
- Webhook, pointing at the **API** project's domain:
  `curl "https://api.telegram.org/bot<token>/setWebhook" -d url="https://<api domain>/api/webhooks/telegram" -d secret_token=<webhook secret>`
- Supabase → Authentication → URL Configuration: Site URL = the environment's **site** domain.
