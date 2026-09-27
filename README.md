# Mountain of the Lord — The Homecoming

Convention website for the Homecoming Convention at Anagkazo Campus, Mampong, Ghana (November 1–4, 2026).

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind CSS
- **Convex** — database, serverless functions, file storage, auth
- **Stripe** + **PayPal** (online payments) — stub mode until merchant credentials are configured
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
  Ghana / West Africa hubs (GHS 30) pay **offline** by bank transfer or MoMo
  and upload a receipt for manual finance review; other regions pay online via
  **Stripe or PayPal**.
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

## Payment Integration

### Registration

| Region | Price | Gateway |
|--------|-------|---------|
| Ghana, West Africa | 30 GHS | **Offline** — bank transfer / MoMo, receipt reviewed by finance |
| Rest of Africa | $10 USD | Stripe or PayPal |
| USA / Rest of World | $20 USD | Stripe or PayPal |
| Switzerland | 20 CHF | Stripe or PayPal |
| England | 20 GBP | Stripe or PayPal |
| Rest of Europe | 20 EUR | Stripe or PayPal |

Do **not** convert ₵30 → $30 for Stripe — that would overcharge. GHS regions are offline only (no gateway checkout).

### Accommodation & Tours

Users choose **Stripe** or **PayPal** at payment (priced in USD).

### Stripe

Keys live in Convex environment variables:

| Variable | Where |
|----------|--------|
| `STRIPE_SECRET_KEY` | Convex (dev + prod) |
| `STRIPE_PUBLISHABLE_KEY` | Convex (optional) |
| `STRIPE_WEBHOOK_SECRET` | Convex (dev + prod) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Next.js `.env.local` / Vercel |

Webhook: `https://<your-convex-site>.convex.site/webhooks/stripe`  
Events: `checkout.session.completed`, `checkout.session.expired`

Success paths: `/registration/success`, `/accommodation/success`, `/tours/success`

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

## Support

homecomingisback@gmail.com
