# Ticketing Backend

NestJS + Prisma + PostgreSQL API for the ticketing app. Mirrors the modules,
constraints, and RBAC rules already implemented in the frontend
(`../ticketing-app`).

## Modules

`OrganizationModule` · `RoleModule` · `TagModule` · `MemberModule` ·
`TicketModule` · `TicketRequestModule` · `ActivityLogModule` — one Nest
module each under `src/modules/`, each with its own controller, service,
and DTOs (validated with `class-validator`).

## Setup

```bash
npm install
createdb ticketing_dev          # or whatever DB name you put in .env
cp .env.example .env            # if starting fresh — otherwise edit .env directly
npx prisma migrate dev          # applies prisma/migrations/
npx prisma db seed              # rule categories, rules, default role/tag templates
npm run start:dev
```

The server listens on `PORT` (default `3001`).

## Seeding

Two separate seed scripts, run in order:

- **`npx prisma db seed`** — essential reference data only: rule
  categories, the ~28 rules from the Authorization Rules list, and the four
  global role templates (Superadmin/Client/Member/Admin) + default tag
  templates. Idempotent (upserts) — safe to rerun.
- **`npm run db:seed:load`** — bulk load-testing data: 5,000 users (500
  owners, 200 seeded as Client-role members, the rest general staff),
  6,000 organizations (each with its own cloned roles/tags, ~6 members),
  100,000 tickets, 100,000 ticket requests, 10,000 comments, plus a custom
  role + tag on 1-in-10 orgs. **Not idempotent** — every run adds more
  rows. Took ~48s locally. Counts are constants at the top of
  `prisma/seed-load.ts` if you want to dial them up or down.

Both scripts assume PostgreSQL is reachable at `DATABASE_URL` and that
migrations are already applied.

## Design decisions worth knowing about

- **Auth is not implemented yet, by design.** No route has an auth guard.
  `PermissionsGuard` (`src/common/guards/permissions.guard.ts`) and the
  `@RequirePermissions()` / `@Public()` decorators exist and are fully
  functional, but aren't registered anywhere — wiring them in without an
  auth layer to populate `request.user` would just lock every route. See
  the guard's own header comment for the exact steps to turn it on later.
- **CORS is wide open** (`origin: true` in `main.ts`) for the same reason
  — there's no session/token to scope an origin check against yet.
- **Errors never crash the process.** `AllExceptionsFilter`
  (`src/common/filters/all-exceptions.filter.ts`) is registered globally
  and catches everything — thrown `HttpException`s, raw Prisma errors
  (unique constraint, FK violation, not found), and anything else — and
  turns it into a consistent `{ statusCode, error, message }` JSON body.
  `main.ts` also installs `process.on('unhandledRejection'/'uncaughtException')`
  handlers that log and keep the server alive rather than exit.
- **`ActivityLogEntry` has no foreign keys, on purpose.** It's a
  standalone, append-only audit log: `orgId`, `entityId`, `actorId`, and
  `involvedUserIds` are plain copies captured at write time, not
  relations. It keeps reading correctly even if the ticket/member/etc. it
  describes is later changed or deleted. See the model's comment in
  `prisma/schema.prisma`.
- **Soft-delete-and-revive, not hard uniqueness constraints.** Tag names
  and role names are unique per organization *among non-deleted rows*, and
  creating one with a name that matches an existing soft-deleted row
  revives that row instead of inserting a new one. This is service-layer
  logic (see `TagService.add` / `RoleService.create`), not a DB constraint,
  because a plain unique index can't express "unique, but soft-deleted
  rows don't count."
- **The Prisma client generator output lives under `src/generated/prisma`**
  (not the project-root `generated/` Prisma's `init` suggests by default)
  specifically so `tsc`'s inferred `rootDir` stays `src/` and
  `dist/main.js` lands where `start:prod` expects it.
- **Two known gaps, left for follow-up:** the ticket "client masking" rule
  (non-owner/non-client callers should see `{ firstName: "client", lastName:
  "client" }`) needs to know who's calling, which auth doesn't exist yet to
  provide — noted inline in `TicketService.list`. And activity-log writes
  aren't wired into the other six modules' mutations yet; `ActivityLogService`
  is ready to be called from them once that's prioritized.
