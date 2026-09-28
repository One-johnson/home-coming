# Pre-Launch Testing Guide

How another admin can test the entire system — in staging, with their own
account — before anything touches live payments or attendees.

---

## 1. Environments at a glance

| | **Local** (your machine) | **Staging** (recommended) | **Production** |
|---|---|---|---|
| Frontend | `npm run dev` (localhost) | Vercel preview URL | Vercel production domain |
| Convex | dev deployment | **second** Convex deployment | prod deployment |
| Stripe | test keys | **test keys** | live keys |
| Gallery/tours content | repo manifests | repo manifests (same branch) | repo manifests (main) |
| Who can break what | anything | staging data only | real attendees |

The Vercel project is already linked (`.vercel/project.json`), so every
git push gets a **preview deployment** automatically — that URL is your
staging frontend for free.

---

## 2. Set up the staging environment (one-time, ~20 minutes)

### 2.1 Second Convex deployment

```bash
npx convex env list                    # confirm which deployment you're on
npx convex deploy --create staging     # creates a separate deployment
```

Then seed it with the required env vars (all fake/test values):

```bash
npx convex env set IMPORT_SECRET <long-random-string>
npx convex env set SITE_URL https://<preview-domain>
npx convex env set SMTP_HOST mail.yourdomain.com
npx convex env set SMTP_PORT 587
npx convex env set SMTP_SECURE false
npx convex env set SMTP_USER noreply@yourdomain.com
npx convex env set SMTP_PASS <mailbox-password>
npx convex env set SMTP_FROM "Homecoming <noreply@yourdomain.com>"
# STRIPE_SECRET_KEY / PAYSTACK_SECRET_KEY: set sk_test_/test values only
```

### 2.2 Vercel preview env vars

In **Vercel → Project → Settings → Environment Variables**, scope these to
the **Preview** environment only (they must differ from Production):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | the staging Convex URL from 2.1 |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | the staging Convex site URL |
| `NEXT_PUBLIC_SITE_URL` / `SITE_URL` | the preview domain |
| `STRIPE_SECRET_KEY` | `sk_test_…` (test mode) |
| `PAYSTACK_SECRET_KEY` | Paystack test secret |

Push a branch (or use Vercel's "Redeploy") — the preview URL now runs
against staging Convex + test payments.

### 2.3 Content for staging

The gallery/tour content is committed in the repo, so the preview site
already shows the real albums. To give staging its own Convex rows (so
admin edits there don't touch production data):

```bash
CONVEX_URL=<staging-url> IMPORT_SECRET=<staging-secret> \
  node scripts/register-static-gallery.mjs
CONVEX_URL=<staging-url> node scripts/tours-manifest.mjs sync
```

Or simply use Admin → Seeding on the staging deployment.

---

## 3. Give the second admin their own account

The admin system bootstraps safely: the **first** admin registers at
`/admin` while the users table is empty; after that registration locks and
new admins are invited by an existing admin.

1. **You** sign in at the staging `/admin` (first-run registration on the
   empty staging deployment — use a password you don't reuse).
2. Go to **Team / admins** and create an account for the tester:
   their email, role `admin` (full access) or a scoped role (`content`,
   `registration`, `accommodation`) if you want to test permissions too.
3. They receive a credentials email (if SMTP is configured) or you set a
   temporary password and share it **out of band** — not in chat, not in a
   ticket. They change it on first sign-in.

Now the tester has their own sign-in, their own audit-trail identity, and
zero access to production.

---

## 4. What to test (the full pass)

### Public site (no sign-in)
- [ ] Home loads; hero, gallery preview, all sections render
- [ ] `/gallery` shows the album index; `/gallery/<year>` opens an album; lightbox autoplays; day tabs switch
- [ ] `/tours` shows both packages with correct prices (from the committed manifest — no Convex needed)
- [ ] `/accommodation`, `/faqs`, `/about`, `/messages` render
- [ ] Registration form: validation, group → denomination cascade, price calculation per region

### Rep portal (the representative flow)
- [ ] Admin creates a hub, then a rep with a temporary password
- [ ] Rep receives credentials email → first sign-in → **setup screen** → new password → auto sign-in
- [ ] Registration form (with receipt upload — PDF and image) → status shows **awaiting review**
- [ ] Accommodation booking + receipt upload
- [ ] Sign out → sign back in with the new password
- [ ] Wrong password ×5 → account locks with a friendly message → unlocks after the window

### Admin console (as the new admin)
- [ ] `/admin` overview: dashboard numbers, storage usage card
- [ ] **Galleries**: album list matches the public site; edit a caption → see the **Pending publish** badge appear; `gallery:sync` locally (or merge the caption-sync PR) → badge returns to **Published ✓**
- [ ] **Tours**: edit a package in staging → `tours:sync` → staging `/tours` reflects it
- [ ] **Registration review**: approve/reject the test rep's receipt; rep sees the result in their portal
- [ ] **Hubs & reps**: roster drill-down, email edit, soft-delete → undo within 7 days
- [ ] **FAQs / announcements / hero / hotels**: create, edit, delete
- [ ] Audit log shows the tester's actions under their identity

### Payments (staging = test keys, zero real money)
- [ ] Tour order end-to-end: select → details → review → **Stripe test card `4242 4242 4242 4242`** → confirmation page + email
- [ ] Declined card (`4000 0000 0000 0002`) shows a friendly error
- [ ] Paystack test flow (if using Paystack gateway regions)
- [ ] Order appears in admin with correct total (server re-priced — try intercepting and tampering with the manifest prices; the order total must NOT change)

### Emails
- [ ] Credentials email, registration confirmation, accommodation confirmation, tour confirmation, admin "awaiting review" notification all arrive and render (banner, no broken images)

### The "go-live" checklist
- [ ] Vercel **Production** env vars point at the prod Convex deployment and **live** payment keys
- [ ] Convex prod deployment has SMTP + `IMPORT_SECRET` + `SITE_URL` set
- [ ] `NEXT_PUBLIC_CONVEX_URL` added as a GitHub repo secret (the sync/backup workflows need it)
- [ ] First production admin account registered (same first-run bootstrap)
- [ ] Rotate any test secrets that were ever shared anywhere
- [ ] Merge or close the gallery caption-sync PR so prod manifest is current

---

## 5. If something breaks

- **Preview shows Convex errors** → the preview env vars are pointing at the wrong deployment; check 2.2.
- **"No admin access" after sign-in** → the account's role isn't an admin role; fix in Team.
- **Payments fail in staging** → confirm `sk_test_` keys are set on *both* the staging Convex deployment and Vercel Preview env.
- **Manifest check fails the build** → someone edited `public/gallery/` or tours without running `gallery:sync` / `tours:sync`; run the sync and commit.
- **Emails not sending** → SMTP must be set on the *Convex deployment* being used, not just `.env.local` (see README's Convex env section).
