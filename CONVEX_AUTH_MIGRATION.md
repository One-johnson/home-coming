# Convex Auth Migration Plan (deferred)

**Decision (2026-09-29): staying with the hand-rolled auth for now.**
The system is tested (42 tests, rep lifecycle suite) and was just hardened
(`ConvexError` in actions, hardened error cleaner, filtered client logger —
commit `1ba15e4`). The rewrite is deferred to the post-event window.

This document preserves the verified design so the migration can start
without re-research. Target library: [@convex-dev/auth](https://labs.convex.dev/auth)
(pre-1.0 — pin the installed version).

## Why switch (when we do)

| Today (hand-rolled)                              | With Convex Auth                                          |
| ------------------------------------------------ | --------------------------------------------------------- |
| `sessionToken` arg threaded through ~30 modules  | `getAuthUserId(ctx)` / `ctx.auth` — no token plumbing      |
| Custom `agcRepSessions` / `userSessions` tables  | `authSessions` + rotating refresh tokens (managed)         |
| Custom per-username lockout (`agcLoginThrottle`) | Built-in `signIn.maxFailedAttempsPerHour` rate limiting    |
| Client `sessionStore` + 2 session providers      | `ConvexAuthProvider` manages tokens in localStorage        |
| Manual `Unauthorized` checks everywhere          | `requireRep`/`requireAdmin` read identity from `ctx.auth`  |

## Non-negotiables (what must keep working)

- Rep temp-password → first-time setup → own password flow
- Emailed password-reset links with expiry (rep + admin)
- Disabled / pending-setup rep statuses enforced at sign-in
- Lockout after repeated failures
- Admin roles (`admin`, `super_admin`, …) and area permissions

## Design

**Identity mapping.** Convex Auth sessions must reference a `users` row.
Reps get a lightweight `users` row (`role: "rep"`, `repId` →
`agcRepresentatives`). Hub data, statuses and the temp-password flow stay
untouched; existing bcrypt hashes are reused — **no credential migration**.

**Providers.** Custom `ConvexCredentials` providers: `rep-password` (verifies
against `agcRepresentatives`, enforces status + lockout via
`beforeSessionCreation`) and `admin-password` (verifies against `users`).

**Schema.** `...authTables` merged into `schema.ts`; `users` extended with
optional `repId` and `role: "rep"`.

**Client.** `ConvexAuthProvider` inside `ConvexClientProvider`;
`useConvexAuth()` gates both shells. `RepSessionProvider` /
`AdminSessionProvider` shrink to profile loaders instead of token stores.

**Server.** `requireRep(ctx)` becomes dual-mode during Phase 1: try
`getAuthUserId(ctx)` → resolve role → load rep profile; fall back to the
legacy `sessionToken` arg. Same for `requireAdmin`.

## Phases

**Phase 0 — keys.** Generate the RSA keypair (docs snippet via `node -e`,
project-local temp file) and `npx convex env set AUTH_JWT_PRIVATE_KEY` /
`AUTH_JWT_PUBLIC_KEY` on all three deployments (dev `helpful-bass-650`,
staging `hidden-spaniel-91`, prod `helpful-anteater-315`). No code changes.

**Phase 1 — dual auth (zero risk, reversible).** Install + pin
`@convex-dev/auth`; merge `authTables`; add `convex/auth.ts` exports + HTTP
routes; write both credentials providers; ship dual-mode
`requireRep`/`requireAdmin`; mount `ConvexAuthProvider`. Old sign-in keeps
working. Verify all tests + manual sign-in on all deployments.

**Phase 2 — cutover (module by module, one commit per slice).** Client forms
call `signIn("rep-password" | "admin-password")`; drop `sessionToken` args
agcPortal → agcBookings → agcAdminData/agcAdmin → agcExcel →
registrations/housing/tourOrders/admin; reset/setup flows call
`invalidateSessions` after credential changes. Old tables stay read-only
so revert works.

**Phase 3 — cleanup.** Delete `agcRepSessions`, `userSessions`,
`agcLoginThrottle`, `sessionStore`, both session providers, `authActions`
session CRUD, legacy helper branches. Rewrite `tests/agcAuth.test.ts`
against the new flows. Purge legacy rows.

## Rollback

Phase 1 is additive — `git revert` + redeploy restores the old path with no
data migration to undo. Phase 2+ only starts after Phase 1 soaks on staging.

## Effort estimate

Phase 1 ~half a day; Phase 2 the bulk (~30 modules, mechanical but wide);
Phase 3 ~half a day. Total ≈ two working days, deployable in slices, each
green on all gates (tsc ×2, lint, vitest, build) before push.
