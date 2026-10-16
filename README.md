# WoW Guild Tools

Professional core engine for WoW guild management and notifications.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill every value (the server refuses to start otherwise)
3. `npx prisma migrate dev`

## Run
- Dev: `npm run dev`
- Prod: `npm run build && npm start`
- Tests: `npm test`

## API
Officer routes (`/events`, `/groups`, `/profiles`) need the header `x-api-key: $API_KEY`.
Telegram webhook: `POST /webhooks/telegram`, registered with `secret_token = TELEGRAM_WEBHOOK_SECRET`.
