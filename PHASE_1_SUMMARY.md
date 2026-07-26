# Hirepool — Phase 1 Complete: Foundation, Design System & Auth

Status: **Code complete, both halves build clean.** Awaiting your approval before starting Phase 2 (Candidate Portal).

## Architecture

Per your correction, this is **not** a unified Next.js app — it's two fully separate projects:

- `backend/` — Express + TypeScript, classic **MVC** structure (`src/models`, `src/controllers`, `src/routes`, `src/middleware`, `src/services`, `src/utils`), Sequelize ORM against Postgres (Supabase-hosted, free tier).
- `frontend/` — Vite + React + TypeScript SPA, Tailwind CSS, talks to the backend only over its REST API (`/api/...`).

## What was built

### Database (`backend/migrations/`, `backend/seeders/`)
- All 13 tables from the spec's Phase 1 schema (users, candidate_profiles, company_profiles, verification_logs, admin_audit_logs, roles_master, platform_badges_master, companies_master, messages, notifications, candidate_platform_badges, candidate_achievements) + one addition, `user_totp_secrets`, needed to actually implement the spec's own "2FA via TOTP" requirement.
- Native Postgres enum types for every finite-value field.
- **Row Level Security** enabled + forced on every table, enforced via Postgres session variables (`app.current_user_id` / `app.current_user_role`) that the Express layer sets per-request — since this app uses its own JWT auth rather than Supabase Auth, this is the Postgres-native equivalent of `auth.uid()`, acting as a second layer of defense behind the app's own authorization checks.
- Seed data: 109 tech roles, 28 platform badges across LeetCode/Codeforces/CodeChef/GeeksforGeeks/HackerRank, 46 companies with MNC/FAANG-MAANG flags.

### Backend (`backend/src/`)
- Sequelize models for every table, with associations wired in `models/index.ts`.
- Auth: email+password (bcrypt) and Google sign-in (ID token verification), JWT access + httpOnly-cookie refresh tokens, mandatory TOTP 2FA enrollment/challenge flow for verifier/admin accounts only.
- Role-gated middleware (`requireAuth`, `requireRole`), rate limiting on signup/login, centralized error handling.
- Public master-data endpoints (`/api/masters/roles`, `/platform-badges`, `/companies`).
- Phase-1 stub endpoints (`/api/candidates/ping`, `/companies/ping`, `/verify/ping`, `/admin/ping`) proving auth + role-gating end-to-end; the real portals are Phases 2–5.
- `APP_NAME` sourced from a single env var, never hardcoded.

### Frontend (`frontend/src/`)
- Design system tokens matching your spec exactly (`#0A66C2` primary, verified/boost/danger colors, Inter font, 12px card radius) + reusable UI primitives (Button, Card, Badge, Input, Select).
- Landing page (hero, 3-step how-it-works, dual CTAs), signup/login pages, candidate category onboarding, TOTP enrollment/verification screen, role-gated stub pages for all four roles.
- Mobile-first responsive layout, PWA manifest + service worker (installable, offline app shell) via `vite-plugin-pwa`.
- `APP_NAME` sourced from a single env var, mirrored on the frontend side.

## Notable decisions made during the build

- **RLS gap caught and fixed**: the `users` table's original RLS policies only allowed a row to be read by its own owner or an admin — which would have made `/auth/login` 401 for every real user, since login has to look up a user by email *before* any session exists. Added a narrowly-scoped `users_select_for_auth` policy that only opens anonymous SELECT when no session role is set at all (mirrors the pattern already used for registration's INSERT policy).
- A few RLS policies were added beyond your six spec bullet points where their absence would've silently broken core flows (company reading its own `company_profiles` row, message participants reading their own threads, a user managing their own TOTP secret). Each is commented in the migration as an "(extension)".
- `CompanyProfile.company_name` is temporarily seeded from the signup email, since the spec's signup body (`{email, password, role}`) doesn't collect a company name yet — real company-name entry is Phase 3 scope.
- Both `backend` and `frontend` were `npm install`ed and **type-checked + production-built successfully** (`tsc --noEmit`, `npm run build`, `vite build`) — a few real issues were caught and fixed in review (an unused-import lint error in 8 files, and one real bug: a login-response type wasn't narrowing correctly, which could have caused a runtime crash right after logging in).

## Verification checklist

Things you (or I, once you confirm) should still check with a live Supabase database before calling Phase 1 fully done:

- [ ] Provision a free Supabase Postgres project, set `DATABASE_URL` in `backend/.env`
- [ ] `npm run migrate` applies all 4 migrations cleanly (extension, enums, tables, RLS policies)
- [ ] `npm run seed` populates roles/platform-badges/companies master tables
- [ ] `npm run dev` (backend) boots and `/health` returns `{status: 'ok', appName: 'Hirepool'}`
- [ ] `npm run dev` (frontend) boots, landing page renders correctly at mobile/tablet/desktop widths
- [ ] Signup as candidate (email/password) → category picker → lands on `/candidate` stub, ping succeeds
- [ ] Signup as company → lands on `/company` stub, ping succeeds
- [ ] Set a user's role to `verifier` or `admin` directly in the DB → login forces TOTP enrollment → scanning the QR + entering a code logs you in → subsequent logins require a valid TOTP code
- [ ] Google sign-in works end-to-end (needs a real `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`)
- [ ] In the Supabase SQL editor, confirm a candidate's session can't read another candidate's `candidate_profiles` row, and a company session only ever sees `status = 'approved'` rows
- [ ] Change `APP_NAME` in `backend/.env` and `VITE_APP_NAME` in `frontend/.env` → confirm it propagates everywhere (title, header, manifest) with no code changes
- [ ] Chrome's install prompt / Lighthouse confirms the PWA manifest is valid

## Not yet done (by design — later phases)
- Real company name/logo/details collection (Phase 3)
- Candidate profile builder, coding-platform badges, achievements module (Phase 2)
- Verification portal, admin portal, payments, full PWA/security hardening (Phases 4–7)

---
**Waiting on your go-ahead to start Phase 2 (Candidate Portal / Profile Builder).**
