# Mathan ERP

Mathan ERP is a unified workspace for focused business applications. The current workspace includes two independent modules:

- **Cash Book** (`/book`) — multi-book cash-in and cash-out tracking with balances, attachments, filters, and CSV export.
- **Payroll** (`/payroll`) — employee salary accruals, raises, payouts, payment history, and payroll reports.

## Web setup

```bash
npm install
npm run lint
npm run dev
```

Copy `.env.example` to `.env.local` and set the Supabase project URL and anon key before starting. Open `http://localhost:3000`, create an email/password account, then create a company workspace.

## Architecture

The root application owns routing and the shared Mathan ERP shell. Cash Book and Payroll are isolated feature modules with separate types and calculations. Their workspace-scoped data is persisted locally in IndexedDB, then synced to Supabase when online.

Supabase migrations live in `../backend/supabase/migrations`. Apply them to a new Supabase project before using authentication or cloud sync. The first signed-in session detects compatible legacy browser data and offers a one-time import into the selected workspace.

## Mobile app

The native Expo application is in [`../mobile`](../mobile/README.md). It uses the same Supabase project, persists offline records in SQLite, and includes Android double-Back exit behavior at launcher and dashboard roots.

```bash
cd mobile
npm install
npm run typecheck
npm run android
```

## Verification

```bash
npm run lint
npm run build
```
