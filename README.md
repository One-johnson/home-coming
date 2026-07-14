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

## Support

homecomingisback@gmail.com
