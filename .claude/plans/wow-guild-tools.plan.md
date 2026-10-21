# Plan: Roster Finalizer + MVP stabilization

**Source PRD**: .claude/prds/wow-guild-tools.prd.md
**Selected Milestone**: 3 - Roster Finalizer (includes the fixes that M1/M2 need to compile and run)
**Complexity**: Medium

## Summary
Code for M1-M3 exists but does not compile (`tsc` errors) and the publish/finalize flows are broken. This plan makes the MVP flow work end to end (create -> invite -> respond -> finalize -> publish), then secures it. The Nudge System (M4) stays out of this plan.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Layering | `src/controllers/event.controller.ts`, `src/services/event.service.ts`, `src/repositories/event.repository.ts` | controller -> service -> repository, Prisma only in repo/service |
| Validation | `src/validators/event.validator.ts` | zod schemas + inferred types |
| ESM imports | `src/index.ts:2-5` | relative imports with `.js` suffix, `import type` for types |
| Errors | `src/controllers/event.controller.ts:11-16` | try/catch returning `{ error }` (to be tightened: parse inside try, no raw messages) |
| Tests | none | no existing pattern; introduce vitest (already installed), colocated `*.test.ts` |

## Files to Change
| File | Action | Why |
|---|---|---|
| `package.json`, `package-lock.json` | UPDATE | drop `@esbuild/win32-x64`, `ts-node`; `dev` via tsx; build `--format esm`; add `prisma generate`; `test` -> vitest |
| `tsconfig.json` | UPDATE | `types:["node"]`, `rootDir`, `outDir`, `include`; remove `jsx` |
| `src/**/*.ts` (controllers, services, repos, adapter, client) | UPDATE | add `.js` import suffixes, `import type` |
| `src/repositories/event.repository.ts`, `src/services/profile.service.ts` | UPDATE | fix `exactOptionalPropertyTypes` / implicit any errors |
| `src/services/notification.service.ts` | UPDATE | add `publishFinalRoster` |
| `src/services/event.service.ts` | UPDATE | publish: notify first, then set `isPublished`; idempotent if already published |
| `src/validators/event.validator.ts` | UPDATE | roster `status` -> `z.nativeEnum(ResponseStatus)` |
| `src/config/env.ts` | CREATE | zod-validated env, fail fast; `PORT` |
| `src/config/telegram.ts`, `src/index.ts` | UPDATE | use env module, `server.log`, graceful shutdown |
| `src/controllers/telegram.controller.ts` | UPDATE | `X-Telegram-Bot-Api-Secret-Token` header (timing-safe), validate callback data, `answerCallbackQuery`, catch locked event |
| `src/plugins/auth.ts` | CREATE | shared API-key preHandler for officer routes |
| `src/controllers/*.ts` | UPDATE | auth hook, parse inside try, clamp `limit`, 404 for missing group |
| `src/**/*.test.ts` | CREATE | response lock, roster finalize, publish flow, webhook parsing |
| `.github/workflows/ci.yml` | CREATE | `npm ci`, `tsc --noEmit`, build, test |
| `.env.example` | UPDATE | add `DATABASE_URL`, `PORT` |

## Tasks
### Task 1: Make it compile and run
- **Action**: clean `npm i` on Linux, remove win32 dep, fix `.js` imports, type errors, tsconfig, scripts.
- **Mirror**: `src/index.ts` import style.
- **Validate**: `npx tsc --noEmit && npm run build && node dist/index.js` (health returns ok).

### Task 2: Fix finalize + publish (TDD)
- **Action**: tests first for roster status enum, `publishFinalRoster` on NotificationService, publish ordering and idempotency.
- **Validate**: `npx vitest run`.

### Task 3: Telegram webhook hardening
- **Action**: secret header, callback validation, `answerCallbackQuery`, locked-event handling; add a minimal user-registration path (`/start`), since unknown users are currently rejected.
- **Validate**: unit tests on the handler with a mocked bot.

### Task 4: Config and auth
- **Action**: env validation, API-key hook on officer routes, input clamps.
- **Validate**: tests for 401 without key, startup failure without env.

### Task 5: CI and PRD sync
- **Action**: GitHub Actions workflow; update PRD milestone statuses; (verify-core.ts removed 2026-10-21: unit tests + local end-to-end checks cover it).
- **Validate**: workflow green on a PR.

## Validation
```bash
npx tsc --noEmit
npm run build
npx vitest run --coverage
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Telegram `Markdown` parse breaks on `_`/`*` in names | High | escape names or switch to `HTML` parse mode |
| Telegram rate limits (PRD risk) | Medium | out of scope here; add queue with M4 |
| Event has no invited set or deadline, so response rate and nudges can't be computed | High | schema change (link Event to RosterGroup, add `deadline`) planned before M4 |
| `prisma.config.ts` may be Prisma 6+ only while Prisma 5 is installed | Medium | check in Task 1 |

## Acceptance
- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented

---

# Phase 2: Admin MVP (decided with the user)

Decisions: admin site first (connectivity later); officers compile the roster from the admin section;
roster shown as a table with class colour and role icon (Tank / Healer / Melee DPS / Ranged DPS);
nudges and account linking are later milestones; a member-facing site is possible later;
test coverage is a hard requirement (>= 80% enforced in CI, edge cases included).

## Steps
1. **Backend hardening, tests first**: add DEMONHUNTER and RANGED_DPS; class/role validity map; Prisma error mapping (409/404);
   roster rules (unique characters, confirm only IN, caps); ownership check on main character; 404s; controller tests for events, groups, profiles.
2. **Admin API**: `/meta/wow` (colours, labels, valid roles), `/characters`, event list with response counts, event detail with usernames.
3. **Admin SPA** in `web/` (Vite + React + TS): login with API key, events list + create, event detail with roster table
   (class colour, role icon, status, confirm/bench, add character), publish. Component tests with Testing Library.
4. **CI**: coverage gate for api and web.

## Not in this phase
Nudges (M4), account linking, member login, spec icons (needs a `spec` column; role icon is enough for now).
