# WoW Guild Tools

Professional core engine for WoW guild management and notifications.

## Setup
1. `npm install`
2. Start a local PostgreSQL, e.g. with Docker:
   `docker run -d --name wgt-postgres -e POSTGRES_USER=wgt -e POSTGRES_PASSWORD=change_me -e POSTGRES_DB=wow_guild_tools -p 5433:5432 postgres:16-alpine`
3. Copy `.env.example` to `.env` and fill every value (the server refuses to start otherwise)
4. `npx prisma migrate dev`

## Telegram (local)
Telegram needs a public HTTPS URL for the webhook. Expose the port with a tunnel
(`cloudflared tunnel --url http://localhost:3000`), then register it once:
`curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" -d url=<tunnel>/webhooks/telegram -d secret_token=$TELEGRAM_WEBHOOK_SECRET`

Members register their main character by pressing **Register** under an invite (or `/start` in a private chat with the bot).

## Run
- Dev: `npm run dev`
- Prod: `npm run build && npm start`
- Tests: `npm test`

## Admin site
`web/` is the officers' admin (React + Vite). With the API running on port 3000:
`cd web && npm install && npm run dev`, then open http://localhost:5173 and sign in with `API_KEY`.
`npx tsx scripts/seed-dev.ts` loads a demo raid into a local database.

## API
Officer routes (`/events`, `/groups`, `/profiles`) need the header `x-api-key: $API_KEY`.
Telegram webhook: `POST /webhooks/telegram`, registered with `secret_token = TELEGRAM_WEBHOOK_SECRET`.
