# Plan: accounts, configurable roles, characters, contact channels

Status: all steps done (2026-10-23).

## User decisions
1. Configurable roles with capabilities now. Base roles: Guildmaster, Officer, Raidleader, Raider.
   Everyone signs up as Raider. Owner is a role above all of them and is the only one that configures roles.
2. The script only bootstraps the Owner. Everything else happens in the site.
   Anyone can create an account: from a site signup form (username + password) or from a Telegram link.
   Password policy: minimum length + complexity. Forms must let Chrome offer to save username + password.
3. A character a player adds stays OUT of the roster until an officer approves it. Only approved characters
   can answer events.
4. Officer+ can reset someone's password from the site. The user signs in with the temporary password and is
   sent to a page to set a new one.
5. Adding a character uses autocomplete from Raider.IO search, so names and realms are spelled right.
6. Every answer can carry a note (e.g. IN but leaving 30 min early).

## Model
```
User ──1:N── Identity   (login "supabase", "telegram", later discord/push...) + User.preferredChannel
  │    └─N:1─ Role       (roles table: name, position, capabilities[], isOwner)
  └──1:N── Character    (main/alt, spec, offSpecs, nickname, inRoster = approved)
```
Reused: Identity (multi-platform), Character.userId, User.preferredChannel, Response.note (column exists, unused),
chat_drafts, officer.service, RosterService.claim, raiderIoGuild.

## Decision needed: SUPABASE_SECRET_KEY on the API project
Resetting someone else's password needs the Supabase admin API, so the secret key goes on the API's Vercel
project (Sensitive, never on the site). It does not widen what the API can already do: DATABASE_URL already
gives full access to the database, auth schema included. Used only by the account service.
Since the key is there anyway, sign-up also goes through our API (Supabase signup stays closed): our rules
on usernames and passwords are enforced on the server, and nobody can register a real email with the
publishable key.

## 1. Configurable roles
- `roles` table: id, name (unique), position (lower = higher), capabilities text[], isDefault, isOwner.
  Seed: Owner (isOwner, everything), Guildmaster (everything except configuring roles), Officer (roster,
  events, messages, accounts), Raidleader (events, messages), Raider (isDefault, profile only).
- `users.roleId` replaces the `users.role` enum. The migration maps OWNER -> Owner, OFFICER -> Officer,
  everyone else -> Raider. Every account has a role.
- **Capabilities come from the code**: `requireCapability('roster.manage')` registers the name where the route
  declares it. `GET /api/roles/capabilities` returns that list, which the Roles page uses as autocomplete.
  Nobody types a capability by hand. A test lists the expected set, so a new or renamed one is noticed.
- Renaming a capability ships with a migration that updates the roles holding it
  (`UPDATE roles SET capabilities = array_replace(capabilities, 'old', 'new')`). A test checks that
  after all migrations every capability stored in `roles` exists in the code, so a rename without its
  migration fails CI (a test replays the migrations' seeds, array_replace and array_remove on "roles").
- Rules (server-side, tested): only the Owner creates/edits/deletes roles; the Owner role is fixed and always
  has everything; at least one Owner. Anyone with `accounts.manage` assigns roles **equal to or below
  their own** whose capabilities they all have, only to users below them, never to themselves. Role read from the DB on every request.
- API: GET/POST/PUT/DELETE /api/roles (Owner), PUT /api/users/:id/role.

## 2. Accounts, sign-up, password reset
- `GET /api/characters` (character search, open to any site user today) must need roster.manage or events.manage
  before sign-up opens: Raiders must not list everyone.
- Script: `npm run officer -- create <name> --owner` only (bootstrap, or recover the Owner).
- POST /api/signup { username, password, link? }: validates, creates the Supabase login with the admin API
  and the User with the default role (Raider). Rate-limited.
- Username: 3-24, a-z 0-9 . _ -, unique. Password: min 12, at least 3 of lowercase / uppercase / digit / symbol,
  not containing the username. Same check in the form (shared module).
- Site: /signup and /login with a real `<form method="post">`, `autocomplete="username"` and
  `new-password` / `current-password`, and a page change after success: Chrome offers to save the credentials.
- Password reset (needs `accounts.manage`, only for users below you): "Users" page lists accounts (name, role,
  characters) with "Reset password". It shows a temporary password once and sets `users.mustChangePassword`.
- While `mustChangePassword` is set, the API refuses every route except /auth/me and POST /api/auth/password;
  the site shows only the change-password form (current/temporary password + new + repeat).
  The account page (/account, your name in the top bar) lets anyone change their own password.
- Changing a password needs the current one (checked with Supabase) and a different new one; 5 tries / 15 min.

## 3. Telegram link
- Sign-up refuses a nickname any User already has (no look-alikes of Telegram-only players). Signing up through the
  bot's link must let that Telegram user take their own existing name.
- One signed token, no table: [kind][id][expiry 15 min] + HMAC, 50 chars (fits Telegram's 64-char start
  parameter). Key derived from SUPABASE_SECRET_KEY. Both directions:
  - bot -> site: `/start` replies with `<SITE_URL>/link?t=<token>` (15 min); sign-up from it links the new account;
    after sign-in the account page asks to confirm (never automatic: a crafted link can't swap your Telegram);
  - site -> bot: account page "Link Telegram" makes `t.me/<bot>?start=l<token>` on the click (5 min); the bot links it.
- A link never replaces another: an account with a Telegram, or a Telegram owned by another account, is refused;
  unlink first (account page). Links are logged.
- The bot's old registration flow (name, realm, class, spec) is removed: characters are added in the site.
  Event buttons only read (never create users or rename an account); unlinked Telegram -> "link first".
- No merge of old bot users: dev data is test data, prod has none.
- Needs SITE_URL on the API project.

## 4. Profile and characters
- Username (login, private) and nickname (what the guild calls you) are separate: `users.nickname`, set on the
  profile, editable by officers. Characters inherit it in roster and attendance (Character.nickname goes away;
  the CSV import's Nickname column sets the account's nickname when the character has an owner).
- Two ways a character gets an owner, both needed:
  - the player, on /profile: claim a free roster name, or add a new character (below);
  - an officer (roster.manage), on the Roster or Users page: assign a character to an account (or release it).
- /profile: my characters, my linked channels, my next events and my answer (read-only; answers stay in the bot).
- Add a character: autocomplete while typing. Our API searches the guild members first (raiderIoGuild),
  then Raider.IO search (`raider.io/api/search?term=`), filtered to EU characters: name, realm and class come
  back spelled right. The player then picks spec, offspecs, nickname. Created with inRoster = false.
  Raider.IO search is not an official API: if it fails, the form still accepts a manual entry.
- Claim a free roster name.
- preferredChannel stays Telegram; a channel picker comes with the second channel (Discord).

## 5. Roster approval, which character answers, new season (steps 6+4, user decisions 2026-10-23)
- Only approved characters (inRoster = true) answer events, enforced in ResponseService for every path (bot, board,
  officers' bulk edit). The event page's "Add a character" lists only approved characters.
- Roster page: "Pending" list (characters with an owner and inRoster = false) with Approve / Reject, plus the
  assign menu (fixes a name someone took that isn't theirs). Approve = inRoster true. Reject = the character leaves
  the account (same as the player removing it: deleted if it never answered).
- Claiming a name that is already on the roster needs no approval (as today).
- Revoke approval: officers and raid leaders take a character off the roster (existing "Remove", which keeps it
  on the player's account, now shown as pending again). Approve/revoke get their own capability `roster.approve`
  (Guildmaster, Officer, Raidleader); editing the roster stays `roster.manage`.
- Which character answers from the bot: the answer is saved on the main (or the first approved character if the
  main isn't approved). If the player has more than one approved character, the bot's DM after the tap lists them
  as buttons (callback `as_<index>_<eventId>`: the index in a fixed order fits Telegram's 64 bytes): a tap moves that event's answer to the chosen character (status kept). A later tap on the channel
  keeps the character already answering for that event.
- New season: a button on the Roster page (`roster.manage`, typed confirmation; one transaction). Every character
  leaves the roster (owned ones go back to pending, empty unclaimed slots without answers are deleted). Accounts,
  characters and past events stay. Officers re-approve.
- Future: how to sign up with an alt when a player has several valid characters (homepage, see below).

## UI fixes (user feedback 2026-10-23)
- Profile, characters table: pencil icon = edit (opens a dialog with specs + "Make main"), x icon = remove.
  Icons as inline SVG copied from Lucide (ISC licence, no new dependency).
- Roster page: characters sorted by player, alts as indented rows under the main (no toggle).
- Alts added to the roster don't show the account's nickname: bug. Likely cause: the roster form sends an empty
  nickname for a claimed character and it overwrites the account's. Fix: claimed characters don't show or send a
  nickname from the roster form (the account's nickname is edited on the profile or the Users page).
- Names: show only the nickname when there is one (no "@username" next to it); the username only when there is no nickname.
- Event page "Add a character": alts and players already on the list showed up (fixed by the approved-only list above).

## 6. Notes on every answer
- Telegram can't put a text field in a channel message: the note is asked in the private chat after the tap.
- Later: a homepage for everyone with my next events and quick answers (In / Out / Tentative / Note; Note opens a
  small dialog with the 3 buttons + a text field). How officers use it: to discuss.
- After any answer the bot says "Noted. Reply with a note if you want (e.g. leaving 30 min early)"; the next
  private message (not a command) becomes the note.
- LATE: "Minutes late, and a note if you want (e.g. `15 traffic`)". One message: the number is the minutes,
  the rest is the note.
- Same chat_drafts follow-up as today's late question (one draft kind for all answers), stored in
  `Response.note` (max 200 chars). Changing the answer clears the note. The board shows it next to the name.

## UI polish (user feedback 2026-10-23)
- Done: the account page became "Profile" (your name in the top bar): characters first; Telegram on one line (status +
  Link/Unlink); "Change password" closed behind a button, the form opens only on click (forced change stays open).
- Password fields show the rules as a checklist that ticks while typing (sign-up and change password).
- Users table: aligned columns, nicer look.

## Order (each: tests first, review agents, commit)
1. [x] roles table + migration + capabilities from the code + rules + API (+ script creates only Owners)
2. [x] signup API + password policy + /signup and /login (Chrome-friendly), /characters closed to Raiders
3. [x] Users page: role assignment + password reset + mustChangePassword + account page
4. [x] Telegram link token (both directions) + removal of the bot registration flow
4b. [x] password checklist + Users table polish
5. [x] nickname on the account + Profile page (claim, add with Raider.IO autocomplete; Telegram line; password in a
   dialog + reset link on Telegram, bot /reset, /reset page) + officer assigns characters (Roster page)
6. [x] roster approval + answers only for approved characters + which character answers (bot) + new season + UI fixes
   (also: event page "Add a character" removed, the no-answer panel's "Mark as" covers it; spec icons load eagerly)
7. [x] notes on every answer (bot follow-up after every tap, `15 traffic` for LATE, shown on the board)
8. [x] Roles page (Owner): list by rank, create / edit / delete, capabilities as checkboxes from GET /roles/capabilities

## Later (user decisions 2026-10-23)
- [x] (done 2026-10-24 as "X before the start", see README "Reminders") Reminders as scheduled jobs per event: officers set times (e.g. Sunday 20:00, Monday 13:00); at each time the
  people who haven't answered get a DM. A table of reminders (event, time, sent); Supabase pg_cron runs every few
  minutes and sends the due ones (Vercel Hobby cron runs only once a day).
- In-game invite string: `/invite Name-Realm` lines for the approved roster, kept up to date, with a copy button.
- Preferred channel picker: stays (shown with the second channel).
- Production: after an alpha preview with a group of testers.
- Discord: later; the proof of concept stays on Telegram.
