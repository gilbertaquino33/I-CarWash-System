# I-CarWash Website

Public marketing site + review platform + admin/staff login portal for
I-CarWash, built with Next.js (App Router) and the same Supabase project the
mobile app uses.

## What's here

- **`/`** — marketing landing page: hero, services, "why choose us", live
  customer testimonials, collapsible FAQ, and a "get a free quote" form.
- **`/services`** — overview of the 3 real app services (Walk-In Wash, Online
  Reservation, Home Service), each with its own detail page (What's Included,
  Why Choose Us, process steps, service-specific FAQ, and a quote form).
- **`/shops`** — searchable directory of every registered shop.
- **`/shops/[id]`** — a shop's public page: its reviews + a review form
  (name + email required, no account needed). Reviews are published
  immediately — there is no approval step, and the shop's admin can't hide,
  edit or remove them (Dashboard → Reviews is read-only), so there's no bias.
- **`/login`** — sign-in for **admin and staff accounts only** (mirrors the
  mobile app's rule: customer accounts are rejected here).
- **`/dashboard`** — authenticated portal:
  - Overview: shop stats (bays in use, staff count, rating, new messages).
  - Today's Schedule (admin + staff): a live monitor board of the cars booked
    today, sorted by urgency and colour-labelled — Washing now / Up next
    (≤30 min) / Coming soon (≤2 h) / Later today / Late / Done. Refreshes
    itself every minute, so it can be left open on a screen in the shop.
  - Reports (admin only): earnings, expenses and net income with a trend chart,
    a net income chart, and a breakdown of where the money came from.
    Filter by Today / Last 7 days / This month / This year, or pick exact
    dates (pick the same day twice for a single specific date).
  - Staff (admin only): the shop's staff list, plus **Register staff** — the
    admin creates each staff login here (name, email, mobile, temporary
    password). Staff no longer sign themselves up. On their first login (website
    or mobile app) they are sent to a "Set your password" page and can't reach
    the dashboard until they choose their own password.
  - Reviews (admin only): read-only list of every customer review.
  - Messages (admin only): quote requests from the website's forms.
  - My Account: the signed-in account's details.

### Where the reports get their numbers

Reports read the same tables the Expo app uses, scoped to the admin's shop:
`walkin_transactions` (price + `reservation_date`), `home_service`
(price + `scheduled_date`, counted only when `status = 'Completed'`), and
`expenses` (amount + `expense_date`). Walk-in vs app bookings are split using
`reservation.source`. If any of those queries is blocked by RLS, the page
shows a warning instead of silently reporting ₱0.

Staff accounts are registered by the shop admin at `/dashboard/staff`. This
needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (see `.env.local.example`);
it's a server-only secret used by a Server Action that first re-checks the
caller is a signed-in admin and always assigns the new staff to the admin's
own shop. There is no self sign-up for staff or admin any more (the app's
staff/admin portal is login-only), so admin accounts are created directly in
Supabase (Authentication -> Add user, then a `profiles` row with `role = 'admin'`
and a `shop_profile_setup` row whose `owner_id` is that user).

### Where to edit the text

| What you want to change | File |
|---|---|
| Agent email / contact details | `lib/site-config.ts` |
| Homepage: headline, services, why-us, steps, FAQ, agent section | `app/page.tsx` (the arrays at the top: `services`, `whyUs`, `steps`, `homeFaq`) |
| Menu links, top bar | `components/Navbar.tsx` |
| Footer links and text | `components/Footer.tsx` |
| Walk-In Wash page | `app/services/walk-in-wash/page.tsx` |
| Book a Slot page | `app/services/online-reservation/page.tsx` |
| Home Service page | `app/services/home-service/page.tsx` |
| Services list page | `app/services/page.tsx` |
| Shop list page | `app/shops/page.tsx` |
| One shop's page | `app/shops/[id]/page.tsx` |
| Review form | `components/ReviewForm.tsx` |
| "Ask for a Price" form | `components/QuoteForm.tsx` |
| Login page | `app/login/page.tsx` |
| Dashboard pages | `app/dashboard/**/page.tsx` |
| Colors and fonts | `tailwind.config.ts` + `app/globals.css` |

Most text sits in plain arrays or JSX near the top of each file — change the
words in quotes and save; the dev server reloads on its own.

### Design & content

- Palette is strictly White / Blue / Black (`brand-*` = blue, `ink-*` =
  black/gray scale) — see `tailwind.config.ts`.
- Typography: **Sora** for headings (`font-display`) and **Inter** for body
  text, self-hosted through `next/font` — no external font requests at runtime.
- Icons are real SVG icons from `lucide-react` (no emoji anywhere in the UI).
- Wording is deliberately plain and everyday ("Ask for a Price", "We watch
  every bay") instead of jargon, so ordinary customers
  can understand it. Keep this tone when adding new copy.
- Interactive controls carry `suppressHydrationWarning` because browser
  extensions (grammar checkers, form fillers) inject attributes like
  `fdprocessedid` before React hydrates, which otherwise logs a hydration
  mismatch error in the console.
- Reusable style primitives live in `app/globals.css` (`.btn-primary`,
  `.btn-outline`, `.field`, `.eyebrow`, `.section-title`) and dashboard
  primitives in `components/dashboard/ui.tsx` (`StatCard`, `Badge`,
  `EmptyState`, `PageHeader`, `Card`).
- All service/feature copy is based on real app behavior (CV bay tracking,
  QR check-in, email reminders 1h/30m before a reservation, self-cancel +
  voucher credit, no-show auto-cancel, no-refund policy) — nothing invented.
- Testimonials on the homepage are the newest real reviews pulled live from
  `shop_reviews` (anything the admin hasn't hidden); if there are none yet it shows an honest empty state
  instead of fake names/quotes.
- Photos are real, licensed-for-reuse photography hotlinked from Unsplash.

### Security features

- All forms (reviews, quote requests) write through Supabase with Postgres
  Row-Level-Security policies and column `check` constraints — inserts are
  parameterized (no SQL injection surface). Reviews go live at once (the
  policy only accepts `status = 'approved'` from visitors, and no one but the
  database owner can edit or delete a review) and quote requests land as `new`.
- The quote form includes a hidden honeypot field: bots that fill it are
  silently dropped without touching the database.
- `next.config.js` sets `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, and HSTS headers on every response.
- HTTPS/SSL is provided automatically by the host (e.g. Vercel) once deployed.

## Setup

1. Apply the new database migrations in the Supabase SQL editor (in order):
   - `../supabase/sql/2026-09_shop_reviews.sql` — `shop_reviews` table, RLS,
     and the `shop_review_stats` view. **Re-run it if you set this up before
     reviews went live automatically**: it changes the insert policy (without
     that, the review form's insert is rejected) and publishes old `pending` reviews.
   - `../supabase/sql/2026-09_quote_requests.sql` — `quote_requests` table
     and RLS for the website's quote/booking form + dashboard Inquiries tab.
2. Copy the env example and fill in your Supabase project's URL/anon key
   (same values as the Expo app's `EXPO_PUBLIC_SUPABASE_URL` /
   `EXPO_PUBLIC_SUPABASE_ANON_KEY`):
   ```
   cp .env.local.example .env.local
   ```
3. Install dependencies and run the dev server:
   ```
   npm install
   npm run dev
   ```
4. Open http://localhost:3000

## Deploying

This is a standard Next.js app — deploy it to Vercel (recommended) or any
Node host. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
as environment variables on the host.

## Notes

- `npm audit` reports a high-severity advisory in `postcss`, pulled in
  transitively by Next.js's own build tooling (not a runtime/user-facing
  dependency). Fixing it requires a major Next.js upgrade (`next@16`); left
  as-is for now since it only affects the build toolchain.
