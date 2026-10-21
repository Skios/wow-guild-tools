# Deploy: Vercel + Supabase (free tiers)

| Environment | Branch | Vercel | Supabase | Telegram bot |
|---|---|---|---|---|
| dev | `develop` | Preview (branch `develop`) | `wgt-dev` (London) | dev bot |
| prod | `main` | Production | `wgt-prod` (Frankfurt) | guild bot |

Flow on every push to `develop` / `main` (`.github/workflows/ci.yml`): checks → `prisma migrate deploy`
on that environment's database → Vercel Deploy Hook. Vercel never deploys on its own
(`git.deploymentEnabled: false`), so code never runs against an older schema. `main` waits for your
approval in the `prod` GitHub Environment.

## 1. Supabase (each project)
- Project Settings → Data API: **off**.
- Project Settings → JWT Keys: an asymmetric key (ES256 or RS256) must be the active one.
- Authentication → Sign In / Providers: **Allow new users to sign up: off**; anonymous sign-ins off;
  Email provider **on** (password logins); confirm email off; minimum password length 16.
- Authentication → Rate Limits: as low as you can live with.
- Connect: copy the **Transaction pooler** string (port 6543) and the **Session pooler** string (port 5432).

## 2. Telegram
- One bot per environment (BotFather), each with its own random webhook secret (16+ chars, `A-Z a-z 0-9 _ -`).

## 3. Vercel
- Add New → Project → import the repository (root directory = repo root; `vercel.json` sets the rest).
- Settings → Environment Variables. Production: tick **Production** only. Dev: tick **Preview** and pick
  the custom branch **`develop`** (not "All Preview branches"). Mark secrets as Sensitive.

  | Variable | Value |
  |---|---|
  | `DATABASE_URL` | Transaction pooler + `?pgbouncer=true&connection_limit=3` |
  | `DIRECT_URL` | Session pooler (port 5432) |
  | `SUPABASE_URL` | `https://<ref>.supabase.co` |
  | `VITE_SUPABASE_URL` | same as `SUPABASE_URL` |
  | `VITE_SUPABASE_PUBLISHABLE_KEY` | the project's publishable key (public) |
  | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `TELEGRAM_WEBHOOK_SECRET` | that environment's bot |
  | `TRUST_PROXY` | `true` |

  **Never** set `SUPABASE_SECRET_KEY` (or a service_role key) in Vercel: only `npm run officer` uses it, from your machine.
- Settings → Deploy Hooks: create one for branch `main` and one for `develop`.
- Deployment Protection: keep Vercel Authentication on previews (the dev site is only for you), and create a
  **Protection Bypass for Automation** secret so the dev bot's webhook can get through (step 5).
- Firewall: add a rate-limit rule on paths starting with `/api/` (e.g. 100 requests/min per IP). The API's own
  limit counts per instance only.

## 4. GitHub
- Settings → Environments: `dev` and `prod`. On `prod`: **Required reviewers** = you, deployment branches = `main`.
- Secrets in each environment: `DIRECT_URL` (Session pooler) and `VERCEL_DEPLOY_HOOK` (that branch's hook).
- Branch protection on `main` and `develop`: pull requests required, no force pushes.

## 5. After the first deploy of each environment
- `GET https://<domain>/api/health` must answer `{"status":"ok"}`.
- First officer, from your machine with that environment's values:
  `DATABASE_URL=<session pooler> DIRECT_URL=<session pooler> SUPABASE_URL=<url> SUPABASE_SECRET_KEY=<secret> npm run officer -- create <name>`
- Webhook (dev adds the bypass query parameter):
  `curl "https://api.telegram.org/bot<token>/setWebhook" -d url="https://<domain>/api/webhooks/telegram?x-vercel-protection-bypass=<bypass>" -d secret_token=<webhook secret>`
- Supabase → Authentication → URL Configuration: Site URL = the environment's domain.
