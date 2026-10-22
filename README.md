# WoW Guild Tools

Raid coordination for a WoW guild: a Telegram bot, a Fastify API and an admin site for officers.

- Officers keep **one standing raid roster** in the admin site (name, realm, class, spec). Names can be unclaimed.
- Players press **/start** in the bot and pick a free roster name (or register a new character).
- Every event invites the whole roster. The event board splits answers like a Raid-Helper embed:
  accepted by role (Tank / Healer / Melee / Ranged), Late (with arrival time), Bench, Tentative, Out, and **No answer**.
- From the board officers can message people who haven't answered (and tentative ones), with a default or custom text.

## Setup
1. `npm install`
2. Start Supabase locally (needs Docker): `npm run supabase:keys` once, then `npx supabase start`
   (database on :54322, auth on :54321, Studio on http://127.0.0.1:54323, test mailbox on :54324)
3. Copy `.env.example` to `.env` and fill the values (the server refuses to start otherwise)
4. `npx prisma migrate deploy` (use `npx prisma migrate dev` locally to create a new migration)

Prisma owns the schema; Supabase's own migrations are off. Every table must have RLS enabled in a
migration (enforced by a test), because Supabase would otherwise serve it through its Data API.
`scripts/seed-dev.ts` only writes to a database on this machine (override with `ALLOW_SEED=1`).

## Run
- API dev: `npm run dev` (http://127.0.0.1:3000)
- Prod: `npm run build && npm start`
- Tests: `npm test` (coverage threshold 80%)

## Admin site
`web/` is the officers' admin (React + Vite). With the API running:
`cd web && npm install && npm run dev`, then open http://127.0.0.1:5173.

- Pages: **Events** (list, create, board) and **Roster** (add / edit / remove / release names).
- **Appearance** menu: four themes (Midnight, Parchment, Void, Daylight) and three icon styles (game, line, none).
- Tests: `cd web && npm test`.
- `npx tsx scripts/seed-dev.ts` loads a demo roster and raid into a local database.
- **Roster import (one-time)**: `npm run roster:import:dev -- roster.csv` previews, `--apply` adds. Header row with
  `Nome;Classe;Spec;Offspec;Reame;Nickname` (or the English names, `;` or `,`); Offspec in order, e.g. `Fury/Arms`.
  A missing realm is taken from the guild (Blaze of Glory, Nemesis) on Raider.IO; ambiguous or unknown names are
  reported, never guessed. Characters already in the roster are skipped.
- Characters have a main spec, ordered offspecs (2nd, 3rd...) and an optional nickname (groups a player's characters).
- Class / spec icons live in `web/public/icons` (Blizzard assets); re-download with `scripts/fetch-icons.sh`.

## Authentication
Officers sign in with a **nickname and a password** (Supabase Auth). No email or personal data is stored:
the nickname becomes `<name>@wgt.invalid`, an address that can never receive mail. Signup is closed;
accounts are managed with a script that needs `SUPABASE_SECRET_KEY` (never give that key to the app):

- `npm run officer -- create <name> [--role owner|officer]` (prints the password once), `role <name> <owner|officer>`,
  `reset <name>`, `revoke <name>`, `list`
- roles: **Owner** (everything, admin) above **Officer** (roster, events, messages, accounts); the last Owner
  cannot be revoked or demoted. Capabilities per role live in `src/domain/roles.ts`.

Every route needs `Authorization: Bearer <Supabase access token>` of a user with a role, and the capability
its route group asks for. The role is read on every request, so a revoke or demotion takes effect immediately.

## Telegram (local)
Telegram needs a public HTTPS URL for the webhook. Expose the port with a tunnel
(`cloudflared tunnel --url http://localhost:3000`), then register it once:
`curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" -d url=<tunnel>/api/webhooks/telegram -d secret_token=$TELEGRAM_WEBHOOK_SECRET`

The webhook is checked with `TELEGRAM_WEBHOOK_SECRET` (header `x-telegram-bot-api-secret-token`).
Players answer with the IN / LATE / TENTATIVE / OUT buttons; LATE asks for the minutes in a private chat.

## API
Every route is under `/api` (the same domain serves the admin site on Vercel). Main routes: `GET/POST /roster`, `PUT/DELETE /roster/:id`, `POST /roster/:id/release`,
`GET/POST /events`, `GET /events/:id`, `PATCH /events/:id/roster`, `POST /events/:id/publish`,
`POST /events/:id/message`, `GET /meta/wow`, `GET /auth/me`, `POST /webhooks/telegram` (own secret).

## Deploy (Vercel + Supabase, free tiers)
One Vercel project serves both: `api/index.ts` is a single function that hands every `/api/*` request to
Fastify (rewrite in `vercel.json`), and the admin site is the static build of `web/`. Region `fra1`;
only `main` (production) and `develop` (preview = dev environment) are deployed. Security headers (CSP,
HSTS, nosniff) are set in `vercel.json`. Bot conversations in progress are stored in `chat_drafts`,
because serverless instances share no memory.

## Status
Milestones 1–3 (core, bot, admin site) are in place; reminders/nudges (M4), account linking across
platforms and a member-facing login are next. Hosting is undecided. See `.claude/prds` and `.claude/plans`.
