# Hirepool

Reverse job board — candidates build verified profiles, companies unlock contact info. See `Hirepool_Full_Architecture-1.md` for the full build spec.

## Architecture

- `backend/` — Express + TypeScript, classic MVC (`src/models`, `src/controllers`, `src/routes`, `src/middleware`), Sequelize ORM against Postgres (Supabase-hosted, free tier), Row Level Security enabled as a defense-in-depth layer behind the app's own JWT auth + role checks.
- `frontend/` — Vite + React + TypeScript SPA, Tailwind CSS, calls the backend over `/api`.

The two are fully separate: the frontend never imports backend code, only calls its REST API.

## Phase 1 scope (current)

Foundation, design system, database schema + RLS, and auth (email/password, Google sign-in, TOTP 2FA for verifier/admin).

## Local setup

### 1. Database
Create a free Supabase project, copy its Postgres connection string.

### 2. Backend
```
cd backend
cp .env.example .env   # fill in DATABASE_URL, JWT secrets, Google OAuth client id/secret
npm install
npm run migrate
npm run seed
npm run dev             # http://localhost:4000
```

### 3. Frontend
```
cd frontend
cp .env.example .env    # VITE_API_BASE_URL=/api is fine for local dev (proxied to :4000)
npm install
npm run dev              # http://localhost:5173
```

## App name / branding

`APP_NAME` (backend `.env`) and `VITE_APP_NAME` (frontend `.env`) are the single source of the product name — used in the API's `/health` response, JWT/email context, page `<title>`, PWA manifest, and header/footer. Change both env values to rebrand; no code changes needed.
