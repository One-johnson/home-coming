# Mountain of the Lord — The Homecoming

Convention website for the Homecoming Convention at Anagkazo Campus, Mampong, Ghana (November 1–4, 2026).

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind CSS
- **Convex** — database, serverless functions, file storage, auth
- **Offline payments** — bank / MoMo with receipt verification for every region
- **Offline payments** for Ghana / West Africa (bank transfer / MoMo, reviewed by finance)

## UI Toolkit

- **shadcn/ui** — component library (`npx shadcn add <component>`)
- **Sonner** — toast notifications (wired in `src/components/providers.tsx`)
- **TanStack React Table** — data tables via `src/components/ui/data-table.tsx`
- **React Hook Form + Zod** — form validation (ready for use with shadcn Form)

### Adding shadcn components

```bash
npx shadcn add <component-name>
```


1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.local.example .env.local
```

3. Set up Convex (creates deployment and fills in `NEXT_PUBLIC_CONVEX_URL`):

```bash
npx convex dev
```

4. In a second terminal, start the Next.js dev server (or use `npm run dev` which runs both):

```bash
npm run dev:next
```

5. Seed default content:

```bash
npm run seed
```

## Pages

| Route | Purpose |
|-------|---------|
| `/` | Landing page with hero, countdown, CTAs, previews |
| `/about` | Convention story and First Lady welcome |
| `/registration` | Retired public form — redirects to `/portal` (registration is rep-only) |
| `/accommodation` | Campus housing portal + preferred hotels |
| `/gallery` | Past convention photo galleries |
| `/messages` | Past convention message links |
| `/faqs` | Frequently asked questions |
| `/portal` | AGC 2026 hub representative portal (Registration \| Accommodation) |
| `/admin` | Role-based admin dashboard |

## AGC 2026 Representative Portal

Hubs (denominations/countries) each get **one representative account**. The
username is the hub name; a Super Admin creates the account and hands over a
one-time temporary password. The rep completes first-time setup (new password
+ profile) at `/portal`, which has two tabs:

- **Registration** — bulk delegate purchase by quantity (no attendee names).
  Every region pays **offline** by bank transfer or MoMo (priced in the
  region's currency) and uploads a receipt for manual finance review.
- **Accommodation** — per-guest booking (name, gender, type) or bulk upload via
  an Excel template. Holds expire at the earlier of 72h or the Oct 13, 2026
  deadline. Substitutions keep the same gender and accommodation type; the
  original data is preserved in a substitution history. EBPV apartments have a
  Bishop Special Rate.

Admin: the **AGC 2026** page in the dashboard mirrors the same two tabs for
review (approve / reject / request correction with a message), booking
management, inventory pool reallocation, hub import, and rep account
management (temp password re-issue, disable). Roles: `admin` (Super),
`finance`, `accommodation`, `registration`. Excel exports for registrations
and bookings (with a per-guest sheet) are on the AGC admin page.

### Setup

1. Seed defaults (settings + inventory pools) from **Admin → AGC 2026 → Hubs →
   Seed defaults**.
2. Import hubs (paste `Name, Region, Country` lines or add individually).
3. Create a rep per hub and hand over the temporary password.
4. Configure bank details + deadline under AGC settings (keys:
   `registration_bank_details`, `accommodation_bank_details`, `deadline`,
   `hold_hours`, `guest_titles` in the `agcSettings` table).

## Admin Setup

1. Open `/admin/register` and create the first admin (email + password). Registration closes after the first user exists.
2. Sign in at `/admin`. Create additional staff from the **Team** tab (name, email, password, role).
3. Passwords are hashed with bcryptjs. Auth uses opaque session tokens stored in the browser (no JWT / Convex Auth).

## Testing before go-live

Another admin can test the entire system on a **staging environment** — a Vercel preview deployment pointing at its own Convex deployment with payment **test keys** — using their own admin account, without touching production or real money.

See **[TESTING.md](TESTING.md)** for the full setup (one-time, ~20 minutes), how to invite the second admin, and the complete go-live test checklist (public pages, rep portal, admin console, test-card payments, emails).

For a stable tester URL, **[STAGING.md](STAGING.md)** sets up `staging.homecomingconvention.com` — branch-based deployments, DNS, env scoping, and day-to-day management.

`cp .env.example .env.local` documents every environment variable the app and its scripts need.

## Payment Integration

### All flows are offline

Stripe and PayPal were removed — every region, registration, accommodation
booking, and tour order is paid by **bank transfer or Mobile Money** in the
region's own currency. The bank / MoMo account details are configured in the
admin console (`registration_bank_details`, `accommodation_bank_details`),
shown directly on every payment form, and receipts are verified manually by
the finance team.

### Offline (GHS)

Ghana / West Africa registrations are paid by bank transfer or mobile money to the account details shown at checkout. Delegates upload a payment receipt, and finance staff approve or reject it from the admin **Payments** review queue.

## Email (Bluehost SMTP)

Confirmation emails for registration, accommodation, and tours are sent **after payment succeeds** (webhook, mock payment, or admin marks paid). Without SMTP configured, emails are logged in stub mode for the admin **Emails** tab.

### Bluehost setup

1. In Bluehost cPanel, create a mailbox (e.g. `noreply@yourdomain.com`).
2. Note SMTP settings from **Email → Connect Devices**:
   - **Host:** `mail.yourdomain.com`
   - **Port:** `587` (TLS) or `465` (SSL)
   - **Username:** full email address
   - **Password:** mailbox password
3. Set these in your Convex deployment (**Settings → Environment Variables** or `npx convex env set`):

| Variable | Example |
|----------|---------|
| `SMTP_HOST` | `mail.yourdomain.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` for port 587, `true` for 465 |
| `SMTP_USER` | `noreply@yourdomain.com` |
| `SMTP_PASS` | your mailbox password |
| `SMTP_FROM` | `"Homecoming" <noreply@yourdomain.com>` |

Public support contact in email footers remains `homecomingisback@gmail.com`; use your Bluehost domain address as the **From** sender.

**Important:** Convex functions do not read Next.js `.env.local` automatically. After editing `.env.local`, sync to your Convex deployment:

```bash
npx convex env set SMTP_HOST mail.yourdomain.com
npx convex env set SMTP_PORT 587
npx convex env set SMTP_SECURE false
npx convex env set SMTP_USER noreply@yourdomain.com
npx convex env set SMTP_PASS your-bluehost-mailbox-password
npx convex env set SMTP_FROM "Homecoming <noreply@yourdomain.com>"
npx convex env set SITE_URL https://your-production-domain.com
```

### Preview email templates (React Email)

Templates live in `emails/` and use the site banner (`/hero/banner.jpeg`) at the top.

```bash
npm run email:dev
```

Open **http://localhost:3001** to preview registration, accommodation, and tour confirmation templates.

## Photo galleries (repo-hosted, zero storage cost)

Curated annual galleries are **static files committed under `public/gallery/<year>/`**, served by the hosting CDN. They never touch Convex file storage — receipts, hero, and tour images still do. The committed manifest `src/data/galleryManifest.json` is the public pages' source of truth, and `npm run build` verifies it against `public/gallery/` so a missing photo fails CI instead of production.

**Public pages:** `/gallery` is an albums index (one cover card per year, newest first) and `/gallery/<year>` shows that album with day tabs and the autoplaying lightbox. Both are statically prerendered from the manifest; the landing preview links to the latest album.

### Adding a new year

One command runs the whole flow (optimize → register → sync → stage):

```bash
npm run gallery:import            # all years in gallery-import/
npm run gallery:import -- 2026    # a single year
git commit && git push            # deploying publishes the album
```

Or step by step:

```bash
# 1. Put full-resolution photos in a year folder (jpg/png/webp/gif):
#    gallery-import/2026/

# 2. Optimize into public/gallery/2026/ (1600px long edge, quality 82)
#    and register rows in Convex (auto-creates the year album;
#    requires IMPORT_SECRET):
npm run upload-gallery

# 3. Extend the committed manifest with the new year:
npm run gallery:sync

# 4. Sanity-check captions, then commit and deploy:
git add public/gallery src/data/galleryManifest.json && git commit
```

### Captions and album details

- **Edit captions in Admin → Galleries** (the database is the curation surface). The manager shows a **Pending publish** badge while edits differ from the committed manifest, and the daily *Gallery caption sync* workflow opens a PR with the merged manifest — merge it (or run `npm run gallery:sync` locally and commit) to publish.
- Direct manifest edits also work: `gallery:sync` never overwrites captions that Convex doesn't provide.
- `npm run gallery:check` (also part of `build`) verifies the manifest matches the committed files.
- The admin GalleryManager registers photos the same way: it records canonical `/gallery/<year>/...` rows and the admin commits the optimized files — it never uploads gallery bytes to Convex.

## Tour packages (repo-hosted manifest, DB-authoritative checkout)

The public `/tours` page renders from `src/data/toursManifest.json` — zero Convex queries for package content. After editing tours in Admin → Tours, run `npm run tours:sync` and commit the manifest to publish. `npm run build` verifies the manifest and checks that any repo-hosted image paths exist.

**Checkout safety:** orders are placed with package *slugs*; the server resolves them against the live database and re-prices before any payment, so the display manifest can never alter pricing.

## Content backups

`npm run backup:content` snapshots galleries (with image rows), FAQs, and messages to `backups/content-<timestamp>.json`. A weekly workflow (`.github/workflows/content-backup.yml`) runs the same snapshot every Sunday and stores it as a year-long CI artifact.

## Support

homecomingisback@gmail.com
