# Mathan ERP Workspace

This workspace is split by runtime responsibility:

| Folder | Purpose |
| --- | --- |
| `frontend/` | Vite + React web application |
| `backend/` | Supabase database migrations and security policies |
| `mobile/` | Expo React Native Android/iOS application |
| `legacy/` | Original standalone Cash Book and Payroll reference apps |

## Start the web app

```bash
cd frontend
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:3000`.

## Configure cloud storage

1. Start local Supabase or create a hosted Supabase project; see [`backend/README.md`](backend/README.md).
2. Put the project URL and anon key in `frontend/.env`.
3. Restart the web app.

## Start Android mobile development

```bash
cd mobile
npm run android
```

Use the same Supabase URL and anon key in `mobile/.env`.

