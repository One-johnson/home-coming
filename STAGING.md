# Staging Environment & Custom Domain Runbook

`staging.homecomingconvention.com` gives the test admin a stable, production-like
URL for the full pre-launch test pass (see **TESTING.md** for the test checklist).

State at a glance:

| Piece | Status |
|---|---|
| `staging` git branch | ✅ pushed (`origin/staging`) — deploys itself on push |
| `staging.homecomingconvention.com` | ✅ added to the Vercel project |
| DNS record at registrar | ⬜ one record you must add (below) |
| Preview env vars → staging Convex | ⬜ dashboard step (TESTING.md §2.2) |
| Staging Convex deployment | ⬜ `npx convex deploy --create staging` (TESTING.md §2.1) |

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
deploys automatically. Once DNS verifies, that deployment is served at
`https://staging.homecomingconvention.com` (the branch's *newest* deployment
always wins).

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

1. Create the deployment + note its URL:
   ```bash
   npx convex deploy --create staging
   ```
2. Seed its env vars with test values (full list in TESTING.md §2.1) — the
   two that matter most:
   ```bash
   npx convex env set IMPORT_SECRET <long-random-string>
   npx convex env set SITE_URL https://staging.homecomingconvention.com
   ```
3. In **Vercel → home-coming → Settings → Environment Variables**, set for
   the **Preview** environment (NOT Production):
   - `NEXT_PUBLIC_CONVEX_URL` / `NEXT_PUBLIC_CONVEX_SITE_URL` → staging URLs
   - `NEXT_PUBLIC_SITE_URL` / `SITE_URL` → `https://staging.homecomingconvention.com`
   - `STRIPE_SECRET_KEY` → `sk_test_…`
   Then **Deployments → latest → ⋯ → Redeploy** so they take effect.
4. Register the first staging admin at `https://staging.homecomingconvention.com/admin`
   (open only while the users table is empty), then invite the tester from
   **Team** (TESTING.md §3).

> Note: because the Vercel CLI session can deploy Production, treat any
> `vercel` CLI command that changes domains/env carefully — the dashboard
> is the safer surface for env scoping.

---

## 4. Managing the domain day to day

```bash
npx vercel domains inspect staging.homecomingconvention.com  # status + DNS advice
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

- Test keys only: `sk_test_…` Stripe / Paystack test secret. Live keys never enter staging — that's the entire point.
- The staging `IMPORT_SECRET` must differ from production's.
- `NEXT_PUBLIC_*` values are public by design; only the SMTP password and
  payment secret keys are sensitive, and those live in the staging Convex
  deployment + Vercel, never in git or chat.
- Rotate anything that was ever pasted into a chat or ticket.

---

## 6. Testing the domain itself (before handing it to the tester)

1. `curl -I https://staging.homecomingconvention.com` → expect `HTTP/2 200` (after DNS + deploy).
2. Register the tester's account and confirm the credentials email links point at `staging.homecomingconvention.com` — that's the proof `SITE_URL` is scoped correctly.
3. Book a tour with Stripe test card `4242 4242 4242 4242`; the Stripe Checkout URL should open, and returning should land back on the staging domain.
