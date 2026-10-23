# Plan: accounts, configurable roles, characters, contact channels

Status: reviewed by ponytail + user feedback 2026-10-23, waiting for go.

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
6. LATE gets a note too (like TENTATIVE).

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
- Rules (server-side, tested): only the Owner creates/edits/deletes roles; the Owner role is fixed and always
  has everything; at least one Owner. Anyone with `accounts.manage` assigns roles **equal to or below
  their own**, only to users below them, never to themselves. Role read from the DB on every request.
- API: GET/POST/PUT/DELETE /api/roles (Owner), PUT /api/users/:id/role.

## 2. Accounts, sign-up, password reset
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
  the site sends the user to /account/password (new password + confirm, `autocomplete="new-password"`).
  The same page lets anyone change their own password.

## 3. Telegram link
- One signed token (HMAC with a server secret, contains the id + expiry 15 min, no table), both directions:
  - bot -> site: `/start` replies with `/signup?link=<token>`; signing up or signing in with it attaches the
    Telegram identity to the account;
  - site -> bot: Profile "Link Telegram" opens `t.me/<bot>?start=link_<token>`; the bot attaches it.
- The bot's old registration flow (name, realm, class, spec) is removed: characters are added in the site.
  The bot keeps `/start`, event answers and the LATE / TENTATIVE follow-up.
- No merge of old bot users: dev data is test data, prod has none.

## 4. Profile
- /profile: my characters, my linked channels, my next events and my answer (read-only; answers stay in the bot).
- Add a character: autocomplete while typing. Our API searches the guild members first (raiderIoGuild),
  then Raider.IO search (`raider.io/api/search?term=`), filtered to EU characters: name, realm and class come
  back spelled right. The player then picks spec, offspecs, nickname. Created with inRoster = false.
  Raider.IO search is not an official API: if it fails, the form still accepts a manual entry.
- Claim a free roster name.
- preferredChannel stays Telegram; a channel picker comes with the second channel (Discord).

## 5. Roster approval and event answers
- Roster page: "Pending" list (characters with inRoster = false and an owner) with Approve / Reject.
- Event answers only for characters with inRoster = true, enforced in ResponseService for every path.

## 6. LATE and TENTATIVE notes
- LATE: the bot's question becomes "Minutes late, and a note if you want (e.g. `15 traffic`)". One message:
  the number is the minutes, the rest is the note.
- TENTATIVE: the bot asks "Why? (optional, send /skip)"; the reply is the note.
- Both use the existing chat_drafts follow-up and `Response.note` (max 200 chars). Any other answer clears
  the note. The board shows it next to the name.

## Order (each: tests first, review agents, commit)
1. roles table + migration + capabilities from the code + rules + API (+ script reduced to --owner)
2. secret key decision -> signup API + password policy + /signup and /login (Chrome-friendly)
3. Users page: role assignment + password reset + mustChangePassword + /account/password
4. Telegram link token (both directions) + removal of the bot registration flow
5. /profile + Raider.IO autocomplete + claim
6. roster approval + answers only for approved characters
7. LATE / TENTATIVE notes
8. Roles page (Owner)
