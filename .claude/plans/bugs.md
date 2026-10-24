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
- [x] **Pending alt doesn't say it's an alt (2026-10-24).** In "Waiting for approval" an alt looks like any character;
  show it next to the name, e.g. "Kerlink (alt)".
- [x] **Roster "Add a character" has no search (2026-10-24).** The Profile's add form searches the character
  (GET /characters/search); the Roster page's form doesn't. Reuse the same search there.
- [x] **Approved alts show under "No answer" (2026-10-24).** A player who answered with the main still has their
  approved alts listed (and counted) as not answered, on the event page's No answer panel and in the no-answer
  counts (events list, dashboard). No answer should be per player: any of their characters answered = answered.
- [x] **Times in bot messages are the server's (2026-10-24).** Invite, reminder, cancel, "back on" and assignment
  texts use `toLocaleString()` on the server (UTC, no zone shown). One shared formatter with the guild's time zone
  (setting or env) and the zone in the text.
- [x] **Home: the character menu didn't colour each character (2026-10-24).** Each option now has its class colour
  (dark chip on light themes); the closed menu shows the picked one's.

## Polish (to do later, not now)
- [x] **Roster: role distribution at the top (2026-10-24).** Count characters by main role (shield, sword, bow, cross),
  e.g. "3 tank, 8 melee, 10 ranged, 6 healer". Off-specs not counted for now (the mixes need thinking).
  Note: the "Roster totals" line already has a per-role count with icons; check whether it shows what's wanted
  (main roles only, readable at a glance) or needs to be more visible.
- [x] **Roster: "New season" inside the table's card (2026-10-24)**, like the totals at the top, not a card of its own.
- [x] **Dashboard: only events not over (2026-10-24).** Keep just the events that haven't ended (the API already
  filters on endTime > now for "Your next events" and the glance table: check what still shows, e.g. cancelled ones).
- [x] **Dashboard: the player's events as a glance table (2026-10-24).** Like "Events at a glance": one row per event,
  an "Action" column with the character dropdown (coloured by class) and, under it, In / Late / Tentative / Out as
  small icon buttons. The note dialog stays as it is.
- [x] **Contacted by an officer: every timestamp (2026-10-24).** For players an officer messaged (No answer panel, DMs
  from the event page), show each time they were contacted. Needs a small log of officer DMs (event, character,
  when); today the results are only shown once after sending.
