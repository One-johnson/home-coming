# Staging Environment & Custom Domain Runbook

`staging.homecomingconvention.com` gives the test admin a stable, production-like
URL for the full pre-launch test pass (see **TESTING.md** for the test checklist).

State at a glance:

| Piece | Status |
|---|---|
| `staging` git branch | ✅ pushed (`origin/staging`) — deploys itself on push |
| `staging.homecomingconvention.com` | ✅ DNS verified (Bluehost A record), TLS issued, live |
| Staging Convex deployment | ✅ `hidden-spaniel-91` (prod-type) — functions pushed, env vars seeded |
| Vercel Preview env vars | ✅ all 8 app vars scoped to the `staging` git branch |
| Domain ↔ deployment | ⚠️ manual alias per staging build (see §3 step 5) |

---

## 1. One DNS record at your registrar (Bluehost or wherever DNS lives)

Add this at the DNS zone for **homecomingconvention.com**:

| Type | Host | Value | TTL |
|---|---|---|---|
| `A` | `staging` | `76.76.21.21` | default |

- Bluehost path: **Domains → My Domains → homecomingconvention.com → DNS Zone Editor → Add Record**.
- The apex `homecomingconvention.com` (and `www`) must keep pointing at Vercel/your current host — add the record, change nothing else.
- DNS can take minutes to a few hours to propagate.
- Done? Vercel verifies automatically and issues a TLS cert. Check with:
  `npx vercel domains inspect staging.homecomingconvention.com`
  or just open `https://staging.homecomingconvention.com` once the rest of this runbook is done.

Why a stable domain matters: email links and payment redirects use
`SITE_URL`; shifting `*.vercel.app` preview URLs would break them and look
phishy in mail clients.

---

## 2. How staging deployments work

Two ways to publish to staging — pick per change:

**A. Stable branch (recommended for the tester):** every push to `staging`
deploys automatically with the staging env vars. Serving it at
`https://staging.homecomingconvention.com` needs the newest staging
deployment aliased to the domain — automatic if you did the dashboard
"assign domain to git branch" step in §3.5, otherwise one CLI command
(§3.5) after each push.

**B. Preview URLs:** any pull request targeting `staging` gets its own
`*-prince-johnson-s-projects.vercel.app` URL — handy when the tester wants
to check an isolated change before you merge it to `staging`.

Deploy something right now:

```bash
git checkout staging
git merge master            # or cherry-pick / commit directly
git push origin staging
```

Return to master:

```bash
git checkout master
```

---

## 3. Point staging at its own Convex deployment (do once)

The staging site must never touch production data.

1. Create a separate prod-type deployment + note the printed name/URL:
   ```bash
   npx convex deployment create staging --type prod
   # → e.g. hidden-spaniel-91 / https://hidden-spaniel-91.convex.cloud
   ```
2. Push functions to it. `convex deploy` always targets the project's
   default production deployment, so route around it with an env file:
   ```bash
   printf 'CONVEX_DEPLOYMENT=<name>\n' > .env.convex-staging.tmp
   npx convex dev --once --env-file .env.convex-staging.tmp
   rm .env.convex-staging.tmp
   ```
3. Seed its env vars with test values (full list in TESTING.md §2.1) — every
   `env` command accepts `--deployment staging`:
   ```bash
   npx convex env set IMPORT_SECRET <long-random-string> --deployment staging
   npx convex env set SITE_URL https://staging.homecomingconvention.com --deployment staging
   npx convex env set SMTP_HOST <host> --deployment staging
   # ... SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS / SMTP_FROM
   # ... PAYSTACK_SECRET_KEY / publishable keys
   ```
   Done state: staging currently holds IMPORT_SECRET, SITE_URL, the SMTP
   block, and test payment keys (12 vars).
4. **Vercel Preview env vars (already set via CLI):** all 8 app vars exist
   scoped to the `staging` git branch, and the four payment keys also exist
   unscoped (apply to every preview). Inspect with `npx vercel env list preview`.
   CLI form, if you ever need to change one:
   ```bash
   npx vercel env add <NAME> preview staging --value <v> --force --yes < /dev/null
   # pass "" instead of staging to cover all Preview branches
   ```
5. **Point the domain at the newest staging build — per deploy, or fix once
   in the dashboard:**
   ```bash
   npx vercel alias set <staging-deployment-url> staging.homecomingconvention.com
   ```
   Custom domains do not follow new branch deployments automatically.
   The dashboard alternative — **Project → Domains → staging.… → assign to
   the `staging` git branch** — re-aliases every future staging push by
   itself; do that once and this step becomes unnecessary.
6. Register the first staging admin at `https://staging.homecomingconvention.com/admin`
   (open only while the users table is empty — staging already has its own
   admin, separate from production), then invite the tester from
   **Team** (TESTING.md §3).

> Note: because the Vercel CLI session can deploy Production, treat any
> `vercel` CLI command that changes domains/env carefully — the dashboard
> is the safer surface for env scoping.

---

## 4. Managing the domain day to day

```bash
npx vercel domains inspect staging.homecomingconvention.com  # status + DNS advice
npx vercel alias set <staging-deployment-url> staging.homecomingconvention.com  # serve a build
npx vercel logs <deployment-url>                             # runtime logs
npx vercel ls                                                # all deployments
npx vercel rollback home-coming                              # instant revert
```

Dashboard equivalents: **Project → Domains** (cert/DNS status), **Deployments**
(all staging + prod builds), **Settings → Domains** (remove/redirect).

Common operations:

- **Give the tester a fresh build:** merge/push to `staging` — nothing else.
- **A change looks wrong:** `npx vercel rollback home-coming` picks the previous deployment; fixes land as a new push.
- **Take staging down temporarily:** Project → Domains → remove `staging.…` (DNS record can stay).
- **Decommission after launch:** remove the domain in the dashboard, delete the DNS record, delete the `staging` branch.

---

## 5. Secrets hygiene on staging

- Test keys only: `sk_test_…` Paystack test secret. Live keys never enter staging — that's the entire point.
- The staging `IMPORT_SECRET` must differ from production's.
- `NEXT_PUBLIC_*` values are public by design; only the SMTP password and
  payment secret keys are sensitive, and those live in the staging Convex
  deployment + Vercel, never in git or chat.
- Rotate anything that was ever pasted into a chat or ticket.

---

## 6. Testing the domain itself (before handing it to the tester)

1. `curl -I https://staging.homecomingconvention.com` → expect `HTTP/2 200` (after DNS + deploy).
2. Register the tester's account and confirm the credentials email links point at `staging.homecomingconvention.com` — that's the proof `SITE_URL` is scoped correctly.
3. Submit a tour order; the offline bank-instructions confirmation should appear, and returning should land back on the staging domain.
