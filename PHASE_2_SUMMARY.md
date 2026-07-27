# Hirepool — Phase 2 Complete: Candidate Portal (Profile Builder)

Status: **Code complete, migrated + seeded against the live Supabase DB, both halves build clean.** Awaiting your approval before starting Phase 3 (Company Portal).

## What was built

### Database (`backend/migrations/20240102000001-phase2-candidate-profile.js`, `20240102000002-phase2-rls-policies.js`)
- Two new master tables: `skills_master` (94 seeded skills), `domains_master` (15 seeded domains) — required by the spec's own data-consistency rule ("skills and domain must be dropdowns backed by a master table"), which Phase 1's schema hadn't covered yet.
- Two join tables: `candidate_skills`, `candidate_secondary_roles` (composite primary keys, no surrogate `id`).
- `company_requests` — candidate's "my company isn't listed" request, routed to Admin (the approval UI itself is Phase 5, as the spec already scopes it there).
- `users.full_name` and 13 new columns on `candidate_profiles` covering every Fresher/Experienced/Executive field from the spec (primary/secondary role, domain, resume/portfolio links, years of experience, current company, designation, offer-letter-or-LinkedIn link, company type, team size managed, budget owned, title level, actively-looking toggle).
- `candidate_platform_badges.total_questions_solved` — numeric filter field only, per the spec's explicit "no platform-assigned tier system" rule.
- RLS extended to every new/altered table using the same session-variable pattern as Phase 1.
- Applied and verified directly against your live Supabase DB — all 5 new tables confirmed present, seed counts confirmed (94 skills, 15 domains).

### Backend (`backend/src/`)
- `candidateController.ts` extended: `getMyProfile` / `upsertMyProfile` (partial draft-autosave) / `submitMyProfile` (category-aware mandatory-field validation, including the "≥3 project achievements" Fresher requirement) / `setLookingStatus`.
- New `platformBadgeController.ts` and `achievementController.ts`: full CRUD, both enforcing the spec's "editing resets verification back to pending" rule, achievements additionally blocking delete once verified (protects the audit trail).
- New `messageController.ts` — candidate-side Inbox (list threads, reply) against the `messages` table Phase 1 already created; the company-side send UI is Phase 3.
- `masterController.ts` extended: `listSkills`, `listDomains`, `requestCompany`.
- All new routes mounted under the existing `/api/candidates` and `/api/masters` routers.

### Frontend (`frontend/src/`)
- Two new UI primitives the spec explicitly called for: `Combobox.tsx` (searchable type-ahead single-select) and `ChipMultiSelect.tsx` (type-ahead + removable chips) — Phase 1's plain `Select.tsx` had deliberately deferred this.
- `components/candidate/ProfileCard.tsx` — the reusable profile card (platform chips that only show a badge/rank once verified, role/skill/domain chips, achievements summary, verified checkmark, MNC/FAANG tags). Built once here; Phase 3's company search and Phase 4's verifier review will reuse it unchanged.
- `pages/candidate/ProfileBuilderPage.tsx` — category-aware form with a status banner (surfaces the rejection/needs-info reason), Save Draft / Submit for Review actions.
- `pages/candidate/sections/PlatformBadgesSection.tsx` and `AchievementsSection.tsx` — add/edit/delete sub-forms for coding platforms and Projects/Research/Achievements.
- `pages/candidate/DashboardPage.tsx` — post-approval view: live `ProfileCard` preview, Actively Looking toggle, Inbox, and placeholders for Boost/unlock-log (see below).
- `/candidate` now routes to the builder or the dashboard depending on profile status; the Phase 1 `CandidateStub` placeholder is deleted.

## Bugs caught and fixed after the initial build
- **Real concurrency bug**: two spots in `candidateController.ts` ran multiple DB queries via `Promise.all` while sharing the same transaction. A transaction pins to one Postgres connection, which can only run one query at a time — this was silently relying on undefined behavior and surfaced as a `pg` deprecation warning at runtime (`client.query() when the client is already executing a query`), which becomes a hard error in a future `pg` version. Fixed by running those queries sequentially.
- **`tsconfig.json` fragility**: removed the `ignoreDeprecations` flag entirely after it broke the Vercel build — its valid value differs across TypeScript versions, so a value that worked locally failed on Vercel's resolved version. The two underlying warnings it was suppressing are harmless soft notices, not real errors.

## Explicit scope decisions (carried over from the approved plan)
- **Edit-after-approval** resets the whole profile to `submitted` rather than doing true field-level re-verification — the latter is more naturally built once Phase 4's verifier UI exists to consume it.
- **"Boost my profile"** — disabled placeholder button; real implementation is Phase 6 (Razorpay).
- **"Companies who unlocked you" log** — empty-state placeholder; needs the unlock/credits table Phase 3 defines.
- **Offer/experience letter "upload"** — implemented as a URL field, matching how the spec itself treats the resume link; no file-storage service exists in this zero-cost stack.
- **Inbox** is fully wired but will show no messages until Phase 3 builds the company-side send flow — this is expected, not a bug.

## Verification checklist

- [x] Migration applied cleanly against the live Supabase DB (confirmed via direct query — all 5 new tables + seed counts present)
- [x] Backend (`npx tsc --noEmit`, `npm run build`) and frontend (`npx tsc -b`, `vite build`) both compile/build with zero errors
- [ ] Fresher signup → profile builder shows Fresher-only fields; Submit is rejected with a clear missing-fields message until ≥3 projects + all mandatory fields are filled
- [ ] Experienced/Executive signup → correct field set shown; typing an unlisted company offers a "request it" action that reaches `company_requests`
- [ ] Save Draft persists partial data and reloads correctly on refresh
- [ ] Adding a coding platform badge stores it as `pending`; editing it after a (simulated) rejection resets it back to `pending`
- [ ] Achievements tab: Fresher's Projects sub-section is available pre-approval (required for submission); Research/Achievements and the full section for Experienced/Executive stay locked until `status === 'approved'`
- [ ] `ProfileCard` never shows a badge/achievement whose status isn't `verified`
- [ ] Actively Looking toggle persists across reloads
- [ ] Inbox loads without error (empty is correct for now)

## Not yet done (by design — later phases)
- Company search/browse, unlock flow, company-side messaging (Phase 3)
- Verifier portal actually acting on the Track 1 / Track 2 review queues (Phase 4)
- Admin portal, including approving/rejecting `company_requests` (Phase 5)
- Payments — Boost my profile, subscriptions (Phase 6)
- Full PWA/security hardening pass (Phase 7)

---
**Waiting on your go-ahead to start Phase 3 (Company Portal).**
