# Simple Invoice Generator

A browser-first invoice builder made as a one-week portfolio project. Users can enter issuer and client details, define a work period, add tax and banking information, add line items, see a live preview, keep up to ten local drafts, and export a validated invoice as PDF.

## Stack

- Next.js App Router and strict TypeScript
- React Hook Form with Zod validation
- Tailwind CSS
- jsPDF for client-side PDF generation
- SQLite with `better-sqlite3` for reusable profile and client records
- Vitest for domain tests

## Money model

All monetary values are stored and calculated as integer cents. The price input converts decimal display values at the form boundary, and tax is stored separately as integer basis points. `calculateInvoiceTotals` is the single deterministic calculation path used by both preview and PDF export.

## Run locally

```bash
pnpm install
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Invoice drafts are stored in `localStorage`. Reusable freelancer and client details are stored locally in `data/invoice-studio.sqlite` through validated Next.js Route Handlers.
