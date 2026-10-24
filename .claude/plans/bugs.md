# Bugs to work through together

Collected as reported; fixed in one pass later, not mixed into feature rounds.

## Open
- **Reminder not received on dev (2026-10-24).** Reminder set to go out at 4:30; at 4:35 nothing in the private
  chat with the bot (expected "Reminder: <title> on <date>. Are you coming?"). Cron job `wake-reminders` exists.
  To check, in order:
  1. `cron.job_run_details` (did the job run, errors?) and `net._http_response` (status code of the call:
     401 secret mismatch, 503 REMINDERS_SECRET missing or API not redeployed, 404 wrong URL).
  2. `reminders` row: `sentAt` set or still null; event `startTime` - `minutesBefore` really 4:30 UTC vs local time.
  3. API logs on Vercel for "reminders sent" / "Reminder not delivered".
  4. Recipient rules: only players with an approved character and no answer on any of them, with Telegram linked
     (an officer who already answered gets nothing).
