# Mountain of the Lord — The Homecoming

Convention website for the Homecoming Convention at Anagkazo Campus, Mampong, Ghana (November 1–4, 2026).

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind CSS
- **Convex** — database, serverless functions, file storage, auth
- **Paystack** (Africa) + **PayPal** (Western countries) — stub mode until merchant credentials are configured

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
| `/registration` | Individual & group registration with country routing |
| `/accommodation` | Campus housing portal + preferred hotels |
| `/gallery` | Past convention photo galleries |
| `/messages` | Past convention message links |
| `/faqs` | Frequently asked questions |
| `/admin` | Role-based admin dashboard |

## Admin Setup

1. Open `/admin/register` and create the first admin (email + password). Registration closes after the first user exists.
2. Sign in at `/admin`. Create additional staff from the **Team** tab (name, email, password, role).
3. Passwords are hashed with bcryptjs. Auth uses opaque session tokens stored in the browser (no JWT / Convex Auth).

## Payment Integration (Phase 2)

When Paystack and PayPal merchant accounts are ready, update `.env.local` with real credentials. Webhook endpoints:

- Paystack: `https://<your-convex-site>/webhooks/paystack`
- PayPal: `https://<your-convex-site>/webhooks/paypal`

Until then, payments run in **stub mode** and registrations/bookings are stored with `mock_paid` status.

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
