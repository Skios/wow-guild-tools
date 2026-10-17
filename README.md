# WoW Guild Tools

Raid coordination for a WoW guild: a Telegram bot, a Fastify API and an admin site for officers.

- Officers keep **one standing raid roster** in the admin site (name, realm, class, spec). Names can be unclaimed.
- Players press **/start** in the bot and pick a free roster name (or register a new character).
- Every event invites the whole roster. The event board splits answers like a Raid-Helper embed:
  accepted by role (Tank / Healer / Melee / Ranged), Late (with arrival time), Bench, Tentative, Out, and **No answer**.
- From the board officers can message people who haven't answered (and tentative ones), with a default or custom text.

## Setup
1. `npm install`
2. Start a local PostgreSQL, e.g. with Docker:
   `docker run -d --name wgt-postgres -e POSTGRES_USER=wgt -e POSTGRES_PASSWORD=change_me -e POSTGRES_DB=wow_guild_tools -p 5433:5432 postgres:16-alpine`
3. Copy `.env.example` to `.env` and fill the values (the server refuses to start otherwise)
4. `npx prisma migrate dev`

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
- Class / spec icons live in `web/public/icons` (Blizzard assets); re-download with `scripts/fetch-icons.sh`.

## Authentication
There is **no login** for now. Without `API_KEY` the API listens only on `127.0.0.1` and logs a warning.
If `API_KEY` is set (min 16 chars) the officer routes require the header `x-api-key`, and `HOST` can be changed.

## Telegram (local)
Telegram needs a public HTTPS URL for the webhook. Expose the port with a tunnel
(`cloudflared tunnel --url http://localhost:3000`), then register it once:
`curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" -d url=<tunnel>/webhooks/telegram -d secret_token=$TELEGRAM_WEBHOOK_SECRET`

The webhook is checked with `TELEGRAM_WEBHOOK_SECRET` (header `x-telegram-bot-api-secret-token`).
Players answer with the IN / LATE / TENTATIVE / OUT buttons; LATE asks for the minutes in a private chat.

## API
Main routes: `GET/POST /roster`, `PUT/DELETE /roster/:id`, `POST /roster/:id/release`,
`GET/POST /events`, `GET /events/:id`, `PATCH /events/:id/roster`, `POST /events/:id/publish`,
`POST /events/:id/message`, `GET /meta/wow`, `POST /webhooks/telegram`.

## Status
Milestones 1–3 (core, bot, admin site) are in place; reminders/nudges (M4), account linking across
platforms and a member-facing login are next. Hosting is undecided. See `.claude/prds` and `.claude/plans`.
