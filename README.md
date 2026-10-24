# WoW Guild Tools

Raid coordination for a WoW guild: a Telegram bot, a Fastify API and an admin site for officers.

- Officers keep **one standing raid roster** in the admin site (name, realm, class, spec). Names can be unclaimed.
- Players create an account on the site (or from the bot: **/start** sends a link) and link their Telegram.
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
`web/` is the officers' admin (Next.js App Router, client rendering). With the API running on :3000:
`cd web && npm install && npm run dev`, then open http://127.0.0.1:5173 (`/api/*` is proxied to `API_ORIGIN`).

- **Home** (`/`, every account): your next events with In / Late / Tentative / Out, a note dialog (Late asks the
  minutes) and which approved character answers; published events say where you are. Officers (`events.manage`)
  also see the open events against their role target, a to-do list (approvals, events to publish within a day,
  players without Telegram) and attendance per player (played / late / bench / out / tentative / no answer) over the
  last 5, 10 or 20 published events or the whole season (since the last New season).
- Pages: **Events** (list, create, board; a **role target** per event (guild default, or the event's own): flex =
  tanks + healers per 5 + a melee/ranged slider, growing with the confirmed players; fixed = raid size, tanks, healers
  and a melee/ranged split that always adds up. The summary shows each count with the target in brackets, and on a
  gap marks who can cover it with an off-spec; on the board an officer sets the spec a character plays that night among its
  off-specs, which moves it to that role's column, and switches a player to another of their approved characters; **Publish** opens a last check: answers with a note with their confirm
  tick, and where the unconfirmed IN/LATE go (Bench or Out); unsaved edits are saved with it; **In-game invites**: `/invite Name-Realm` macros of up to 255 bytes for
  the confirmed IN/LATE characters, with a Copy button), **Roster** (each player's characters together, alts under the main;
  add / edit / remove / release names, assign a name to an account; approve, reject or revoke characters players
  added; **New season** empties the roster after typing NEW SEASON), **Users** (roles, password resets), **Roles**
  (Owner only: create, edit and delete roles, ticking capabilities from the list the code registers), and your
  **Profile** (click your name). The menu shows what your role can open: raid leaders (`roster.approve`) see the
  Roster to approve and revoke, without editing it.
- **Profile**: nickname; your characters (pencil: specs and "Make main" in a dialog; x: remove); claim a free roster
  name (no approval needed) or add a new character with name suggestions (guild members first, then Raider.IO EU).
  New characters wait for an officer or raid leader before joining the roster. Only approved characters answer events. Channels (Telegram, the preferred one) and password (in a dialog, with a reset link on Telegram).
- **Appearance** menu: four themes (Midnight, Parchment, Void, Daylight) and three icon styles (game, line, none).
- Tests: `cd web && npm test`.
- `npx tsx scripts/seed-dev.ts` loads a demo roster and raid into a local database.
- **Roster import (one-time)**: `npm run roster:import:dev -- roster.csv` previews, `--apply` adds. Header row with
  `Nome;Classe;Spec;Offspec;Reame;Nickname` (or the English names, `;` or `,`); Offspec in order, e.g. `Fury/Arms`.
  A missing realm is taken from the guild (Blaze of Glory, Nemesis) on Raider.IO; ambiguous or unknown names are
  reported, never guessed. Characters already in the roster are skipped.
- Characters have a main spec and ordered offspecs (2nd, 3rd...). The nickname belongs to the account and its characters
  show it; an unclaimed roster name can carry its own (e.g. from the CSV) until someone claims it.
- Class / spec icons live in `web/public/icons` (Blizzard assets); re-download with `scripts/fetch-icons.sh`.

## Authentication
Officers sign in with a **nickname and a password** (Supabase Auth). No email or personal data is stored:
the nickname becomes `<name>@wgt.invalid`, an address that can never receive mail. Anyone can create an account
on `/signup` (nickname + password: at least 12 characters, 3 of lowercase / uppercase / digits / symbols, not
containing the nickname; the form ticks each rule while you type; a nickname any player already uses, or a staff-looking one like `admin`, is refused)
and starts as a Raider. Sign-up goes through our API (`POST /api/signup`, 10 per hour per
IP and 30 per hour in total), which creates the login with `SUPABASE_SECRET_KEY`; Supabase's own sign-up stays closed. The key lives only in
the API (never in the site). The Owner is bootstrapped with a script:

- `npm run officer -- create <name>` creates an **Owner** (prints the password once); also `reset <name>`,
  `revoke <name>`, `list`. Everyone else gets their role in the site.
- **Users** page (`accounts.manage`): every account with its role and characters; give a role, or reset a password.
  A reset shows a temporary password once; with it the account can only open the change-password page until it
  picks its own (the API refuses everything else). Anyone changes their own password by clicking their name in the
  top bar. `npm run officer -- reset` gives a temporary password the same way.
- Roles live in the `roles` table, configured by the Owner: **Owner** (everything, configures roles) above
  Guildmaster, Officer, Raidleader and **Raider** (the default). Whoever has `accounts.manage` gives roles equal to
  or below their own (and only with capabilities they have), to people below them, never to themselves. The last Owner cannot be revoked.
- Capabilities come from the code: `requireCapability('x.y')` on a route registers it, and
  `GET /api/roles/capabilities` lists them. Renaming one needs a migration with
  `array_replace("capabilities", 'old', 'new')` on `roles` (a test fails otherwise). See `src/domain/roles.ts`.

Every route needs `Authorization: Bearer <Supabase access token>` of a user with a role, and the capability
its route group asks for. The role is read on every request, so a revoke or demotion takes effect immediately.

## Telegram link
`/start` in the bot replies with a site link (`<SITE_URL>/link?t=...`, valid 15 minutes). Signing up from it creates
the account already linked; signing in keeps the link, and the account page asks to confirm it (never automatic, so
a link someone else made can't swap your Telegram). From the site, the account page's **Link Telegram** opens the
bot with a link made on the click (valid 5 minutes). A link never replaces another one: unlink first (account page).
The links are signed (key derived from `SUPABASE_SECRET_KEY`), so there is nothing to store. Event buttons only work
for a linked Telegram whose account has a main character.

**Forgot your password?** Send `/reset` to the bot (or use "Send me a reset link" in the profile's password dialog):
it replies with `<SITE_URL>/reset?t=...` (15 minutes), where you choose a new password without the old one.

## Telegram (local)
Telegram needs a public HTTPS URL for the webhook. Expose the port with a tunnel
(`cloudflared tunnel --url http://localhost:3000`), then register it once:
`curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" -d url=<tunnel>/api/webhooks/telegram -d secret_token=$TELEGRAM_WEBHOOK_SECRET`

The webhook is checked with `TELEGRAM_WEBHOOK_SECRET` (header `x-telegram-bot-api-secret-token`).
Players answer with the IN / LATE / TENTATIVE / OUT buttons. In the private chat the bot then asks for an optional
note (e.g. "leaving 30 min early"; LATE asks for the minutes and the note in one message: `15 traffic`); the note shows
under the name on the event board, and a different answer clears it. The answer
goes to the player's main (or the character already answering for that event); with more than one approved character
the bot's private message has a button for each of the others, to answer with it instead.
Set `SITE_URL` (the site's address) so `/start` can send the sign-up link.

## Reminders
Each event has reminders, "X before the start" (new events: 1 day and 8 hours; officers change them on the event page).
At each time, every player with no answer on any approved character gets one private message with the answer buttons.
The database wakes the API: pg_cron checks every 5 minutes inside Postgres (no traffic, no API call when nothing is
due) and only then calls `POST /api/reminders/run` through pg_net. Each reminder is sent once; one for an event that
is published or already started is used up unsent. Set up once per environment (local, dev, prod):
1. A secret: `openssl rand -hex 32`. Put it in the API's `REMINDERS_SECRET` (Vercel: API project, Sensitive).
2. In the Supabase SQL editor (local: Studio, :54323), with your values:
   `select vault.create_secret('https://<api-domain>/api/reminders/run', 'reminders_url');`
   `select vault.create_secret('<the secret>', 'reminders_secret');`
   (local API: `http://host.docker.internal:3000/api/reminders/run`). The job itself comes with the migrations.
3. Check: `select * from cron.job where jobname = 'wake-reminders';` (one row), `select * from cron.job_run_details order by start_time desc limit 5;` and `select * from net._http_response order by created desc limit 5;`.
Without the secrets nothing is called; without `REMINDERS_SECRET` the route answers 503 (and the job keeps knocking
every 5 minutes until it's set). The URL must be https (plain http only for a local API). Each reminder is sent at
most once; if every message for it fails (Telegram down) it is given back for the next run. The secret also sits in
pg_net's request log for a while: whoever can read the database's `net` schema can see it.

## API
Every route is under `/api` (the same domain serves the admin site on Vercel). Main routes: `GET/POST /roster`, `PUT/DELETE /roster/:id`, `POST /roster/:id/release`,
`GET /roster/pending`, `POST /roster/:id/approve`, `POST /roster/:id/revoke`, `DELETE /roster/:id/pending`, `POST /roster/new-season`,
`GET/POST /events`, `GET /events/:id`, `PATCH /events/:id/roster`, `POST /events/:id/publish`,
`POST /events/:id/message`, `PUT /events/:id/reminders`, `POST /events/:id/responses/:characterId/switch`, `PUT /events/:id/role-target`, `PUT /role-target/default`, `GET /meta/wow`, `GET /auth/me`, `GET/POST /roles`, `PUT/DELETE /roles/:id`,
`GET /roles/capabilities`, `PUT /users/:id/role`, `GET /users`, `POST /users/:id/password-reset`,
`POST /auth/password`, `GET/POST/DELETE /me/telegram`, `POST /me/telegram/bot-link`, `POST /me/password-reset-link`, `GET/PUT /me/profile`,
`GET /me/claimable`, `POST /me/characters`, `POST /me/characters/:id/claim`, `PUT/DELETE /me/characters/:id`,
`PUT /me/characters/:id/main`, `GET /characters/search`, `GET /roster/accounts`, `PUT /roster/:id/owner`,
`POST /auth/reset` (no login), `POST /signup` (no login), `POST /webhooks/telegram` (own secret),
`POST /reminders/run` (pg_cron, own secret), `GET /dashboard?span=10|season`, `PUT /me/events/:id/answer`.

## Deploy (Vercel + Supabase, free tiers)
Two Vercel projects, each with Production (`main`) and Preview `develop` (the dev environment):
- **API** (repo root): `api/index.ts` is one function that hands every `/api/*` request to Fastify
  (`vercel.json`, region `fra1`). Bot conversations in progress live in `chat_drafts` (no shared memory).
- **Site** (`web/`): Next.js; `/api/*` is rewritten to the API of the same environment (`API_ORIGIN`).
The pipeline deploys only what a push changed (site, API + migrations, or both). Details: `docs/deploy.md`.

## Status
Milestones 1–3 (core, bot, admin site) are live on Vercel + Supabase (dev). Accounts are in progress: roles,
sign-up, Users page, Telegram linking, profile and characters, roster approval, new season, notes on every answer and
the Roles page, in-game invite macros, reminders (M4), the event composition round and the Home dashboard are done. Then an alpha with testers and production.
See `.claude/plans`.
