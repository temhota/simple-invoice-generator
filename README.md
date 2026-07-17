# Simple Invoice Generator

A browser-first invoice builder made as a one-week portfolio project. Users can enter issuer and client details, define a work period, add tax and banking information, add line items, see a live preview, keep up to ten local drafts, and export a validated invoice as PDF.

## Stack

- Next.js App Router and strict TypeScript
- React Hook Form with Zod validation
- Tailwind CSS
- jsPDF for client-side PDF generation
- PostgreSQL with the `postgres` driver for profiles, clients, and invoices
- Vitest for domain tests

## Money model

All monetary values are stored and calculated as integer cents. The price input converts decimal display values at the form boundary, and tax is stored separately as integer basis points. `calculateInvoiceTotals` is the single deterministic calculation path used by both preview and PDF export.

## Run locally

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

Set `DATABASE_URL` in `.env.local` to a PostgreSQL connection string before running the migration. Cloud providers such as Supabase require TLS, which is enabled by default. For a trusted local PostgreSQL server without TLS, set `DATABASE_SSL=disable`.

For Supabase Auth, also set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The utilities in `lib/supabase/client.ts` and `lib/supabase/server.ts` create browser and cookie-aware server clients respectively. `DATABASE_URL` remains server-only and must never be exposed to browser code.

Set `NEXT_PUBLIC_SITE_URL` to the application origin (`http://localhost:3000` locally and the HTTPS deployment URL in production). Add both origins to Supabase Authentication → URL Configuration. The session proxy refreshes auth cookies, `/login` provides email/password sign-in and sign-up, and `/auth/confirm` handles email confirmation callbacks.

Then open [http://localhost:3000](http://localhost:3000).

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Invoice drafts are stored in `localStorage`. Profiles, clients, and saved invoices are stored in PostgreSQL through validated Next.js Route Handlers. Database integration tests run when `TEST_DATABASE_URL` points to a disposable PostgreSQL database.
