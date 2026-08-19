# Feature 2, Phase 5 Summary — Careers Page & Job Extension

Part of `AI_PACKAGES_ATS_BUILD_PLAN.md`, Feature 2 (the ATS), Phase 5 — the first phase of Feature 2, now that Feature 1 is fully complete (`FEATURE1_PHASE1_SUMMARY.md` through `FEATURE1_PHASE3_4_SUMMARY.md`). Backend-only, no frontend — per the build plan, the public apply page and application flow are Phase 6.

## What was built

**Migration** (`20240121000001-careers-page-job-extension.js`) — additive to the `jobs` table from Feature 1 Phase 1, nothing altered or dropped:
- `custom_job_id` (nullable, unique per company — a plain `UNIQUE(company_id, custom_job_id)` constraint, since Postgres allows unlimited NULLs under a regular unique constraint, so Feature-1-only jobs that never set one aren't affected).
- `status` (`open`/`closed`), `closed_at`.
- `careers_link_slug` (nullable, globally unique) — set by a **separate action** from job creation, not at creation time. The spec has the company choose the application form "when generating the Careers Page link," which reads as its own step.
- `form_type` (`simple`/`detailed`/`foreign`/`custom`), `custom_form_schema` (jsonb, only populated for `custom`).
- New table `application_forms_master`, seeded with field templates for Simple/Detailed/Foreign (public read, admin write — same shape as every other master table). Field shape (`key`/`label`/`type`/`required`/`options`/`sortOrder`) is shared between this table and a custom job's `customFormSchema`, so a future renderer treats both identically.

**One RLS addition worth flagging**: the public careers page reads a job with *no session at all* — genuinely anonymous, unlike every other read in this app which at minimum has a signed-in role. Neither of `jobs`' existing policies (`jobs_owner`, `jobs_admin`) match a NULL session role, so without a new policy the endpoint would read zero rows. Added `jobs_select_public_careers_link`, scoped to `careers_link_slug IS NOT NULL` — once a company generates a careers link for a job, that job's own fields become publicly readable at that link (not the fact that unlinked jobs exist, and not any other company's jobs). Same pattern as `contests_select_published`.

**Company endpoints** (`jdController.ts`, extended):
- `createJob` now accepts an optional `customJobId`, with a friendly 409 on a duplicate within the same company (via `UniqueConstraintError` handling) rather than a raw DB error leaking through.
- `POST /companies/jobs/:jobId/careers-link` — sets `formType` (+`customFormSchema` if `custom`, Zod-validated per field), and generates a slug (`crypto.randomBytes(8)`, base64url, retried on the rare collision) **only if one doesn't already exist** — calling this again to change the form type doesn't reissue the slug, so a link already shared or embedded keeps working.
- `POST /companies/jobs/:jobId/close` / `.../reopen` — simple lifecycle actions.

**Public endpoints**:
- `GET /careers/:slug` (`careersController.ts`, new `careersRoutes.ts`, mounted at `/careers`, rate-limited at 200/15min/IP — no `requireAuth` anywhere in the file) — returns the job plus its resolved field list (preset lookup from `application_forms_master`, or the job's own `customFormSchema` if custom).
- `GET /masters/application-forms?formType=simple|detailed|foreign` — lets a company's future careers-link setup UI preview a preset before choosing it.

## A scope decision worth confirming

The public careers page endpoint deliberately does **not** include the company's name or branding. `company_profiles` has no public-read RLS policy anywhere in this app today — every existing policy on it requires a signed-in role — and adding one is a bigger decision (how much of a company's profile should be visible to a completely anonymous visitor?) than this phase's scope. Right now the public response is just the job's own title/description/form fields. If you want company branding on the careers page, that's worth deciding deliberately before Phase 6 builds the actual public page around this data.

## Verification done
- `npx tsc --noEmit` — clean, no type errors.
- Not yet run: the migration against a real database, or a live request to `/careers/:slug` end-to-end. I don't have database access from here.

## Checklist for you

- [ ] Run `npm run migrate` — one more migration on top of Feature 1's four.
- [ ] Confirm the company-branding scope decision above.
- [ ] Confirm the seeded Simple/Detailed/Foreign field lists (in the migration file) match what you actually want asked — I wrote them faithfully to the spec's descriptions but they're my interpretation of "the minimum required fields" / "full work history" / "passport/visa status" etc., not literal spec text.
- [ ] Sanity-check `status: 'open'/'closed'` as the only two lifecycle states — the spec doesn't specify job status values explicitly; I kept it to the two states the spec's own "Analytics... even on reopened jobs" line implies exist.

## Next

Phase 6 — External applications: `external_applicants` table, the public `POST /careers/:slug/apply` endpoint, and the conversion-to-real-candidate flow. That's where the data this phase exposes actually gets written to, and where the public apply page itself would get built if/when frontend work resumes for this feature.

Let me know once you've reviewed this, or say the word and I'll continue to Phase 6.
