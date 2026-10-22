# Plan: roles and capabilities (RBAC)

Status 2026-10-22: **step 0 done** (user's choice: start simple). `users.role` enum OWNER/OFFICER, capabilities
mapped in code (src/domain/roles.ts), routes guarded by capability, script `--role` / `role`, last Owner protected.
The full design below (configurable roles table, audit log, admin panel, accounts from the site) is the next step,
simplified per the ponytail review (step 0 ships only roster.manage, events.manage, messages.send, admin;
add events.override / accounts.manage with their routes), Owner-only role configuration, no role delete, Studio for the
global view until the Next.js UI. Routes already ask for capabilities, so moving the map to a table changes no route.

## Goal
Guild-style text roles (Owner, Officer, RaidLeader, Raider, ...) each with a configurable set of
capabilities. Owner is the admin: sees everything, can do everything, configures roles.
Login stays Supabase nickname + password (no API key); TOTP required for Owner.

## Capabilities (fixed list in code)
| Capability | Allows |
|---|---|
| `roster.manage` | roster CRUD, release names |
| `events.create` | create events |
| `events.manage` | finalize roster, mark responses, publish |
| `events.override` | change events that are published / closed to sign-ups |
| `messages.send` | message players from the board |
| `accounts.manage` | create / reset / revoke site accounts |
| `roles.assign` | give users a role |
| `roles.configure` | create roles, edit their capabilities and order |
| `admin.view` | global view: users, characters, identities, bot drafts |
| `admin.tools` | test tools (message to channel/bot, simulated answer, health) |
| `audit.view` | action log |

## Data
- `roles`: id, name (unique), position (int, lower = higher rank), capabilities text[], isOwner bool.
  Seeded: Owner (isOwner, all), Officer (all except roles.configure, admin.*, audit.view), RaidLeader
  (events.*, messages.send), Raider (none: players use the bot for now).
- `users.roleId` nullable FK -> roles (null = no site access). Migration: isOfficer=true -> Officer; drop isOfficer.
- `audit_log`: id, actorUserId, action, target, details jsonb, createdAt. RLS on, anon/authenticated revoked.

## Rules (enforced server-side, covered by tests)
- Owner role: always all capabilities, cannot be edited or deleted; at least one Owner must exist.
- Assign only roles below your own, only to users below you; never change your own role.
- Edit only roles below your own, only with `roles.configure`, never granting a capability you lack.
- Login and data validation are never bypassed.
- Role and capabilities read from the DB on every request (revocation is immediate).

## API
- `requireOfficer` becomes `requireSiteUser` (valid login + a role) and routes declare
  `requireCapability('events.manage')` etc.
- `/auth/me` returns { userId, username, role, capabilities }.
- New: `/api/roles` (list, create, update, delete), `/api/accounts` (create, reset, revoke, set role),
  `/api/admin/*` (global view, tools), `/api/audit`. Every mutation writes the audit log.
- Account creation from the site needs `SUPABASE_SECRET_KEY` on Vercel (Sensitive), used only by the
  account service; strict rate limit; rotatable.

## Script
`npm run officer -- create <name> --role <RoleName>` (default Officer); `role <name> <RoleName>`.

## Web
Hide what the user can't do (from `/auth/me` capabilities). Admin panel UI (Roles, Accounts, Global
view, Tools, Audit) is built during the Next.js migration, not in Vite.

## Order
1. roles + audit_log tables, migration from isOfficer, seed
2. capability checks on existing routes, /auth/me, hierarchy rules
3. script --role, then account/role/audit/admin API with the secret key
4. UI in Next.js
