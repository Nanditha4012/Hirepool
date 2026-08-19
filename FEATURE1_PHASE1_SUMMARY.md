# Phase 1 Summary — AI Relevancy Packages: Schema & Groq Foundation

Part of `AI_PACKAGES_ATS_BUILD_PLAN.md`, Feature 1, Phase 1. Backend-only — no frontend work this phase.

## What was built

**Migration** (`20240118000001-relevancy-packages-foundation.js`):
- 5 new tables: `jobs` (lean — id/company_id/title/description only, extended additively in Feature 2), `job_requirements_parsed`, `candidate_relevancy_scores`, `relevancy_packages`, `relevancy_package_price_bands`.
- 2 new enums: `relevancy_tier` (100_percent/90_plus/75_plus/50_plus), `job_requirement_parse_status` (pending/success/failed/unavailable — not in the spec's literal column list, added so the app can distinguish "not parsed because Groq isn't configured" from "parsed and genuinely returned nothing" from "the call failed").
- RLS on all 5 tables, following the session-variable pattern used everywhere else in this codebase. One deliberate scope decision, flagged in the migration's header comment: `candidate_relevancy_scores` writes are verifier + admin only for now (company gets SELECT-only on their own jobs' scores) — Phase 2 will need to revisit this if JD-edit-triggered recompute ends up running inside the company's own request context rather than a verifier/admin-triggered path.
- Seeded: `jd_parsing_prompt_template` into `site_settings` (admin-editable via the existing `PATCH /admin/site-settings` — no new endpoint needed), and 4 placeholder price bands (₹999 / ₹3,999 / ₹12,999 / contact-sales) into `relevancy_package_price_bands`, per your "seed defaults, admin-editable" decision.

**Groq integration** (`utils/groq.ts`, `config/env.ts`, `.env.example`):
- `GROQ_API_KEY` / `GROQ_MODEL` (default `llama-3.3-70b-versatile`), optional-empty-default pattern — matches how Razorpay/SMTP/DigiLocker are configured, so the app never crashes at boot if unset.
- `isGroqConfigured()` guard + `parseJobDescription()`, calling Groq's OpenAI-compatible chat completions endpoint via native `fetch` (no new HTTP dependency) with `response_format: json_object` and zod validation on the reply.

**Models**: `Job`, `JobRequirementParsed`, `CandidateRelevancyScore`, `RelevancyPackage`, `RelevancyPackagePriceBand` — wired into `models/index.ts` with associations (company owns jobs; job owns one parsed-requirements row, many scores, many packages).

**Endpoints**:
- `POST /companies/jobs`, `GET /companies/jobs`, `GET /companies/jobs/:jobId`, `PUT /companies/jobs/:jobId` (`jdController.ts`, mounted in `companyRoutes.ts` under `companyOnly` — a job can exist with just a title, per spec, and an unverified company can still draft one). Creating or editing a job with a description triggers a Groq parse; the external call runs **outside** any Postgres transaction (short transaction to load prerequisites → untransacted Groq call → short transaction to save), same pattern `verificationController.ts` already uses for OCR, so a slow/flaky Groq call can't hold a pooled DB connection open.
- `GET /masters/relevancy-price-bands` (public) + `POST`/`PATCH`/`DELETE /admin/masters/relevancy-price-bands` (admin-only) — mirrors the existing `plans_master` public-read/admin-write pattern exactly.

## Verification done
- `npx tsc --noEmit` — clean, no type errors.
- Not yet run: the actual migration against a database, or a live Groq call (needs a real `GROQ_API_KEY` and `DATABASE_URL` in your environment — I don't have either).

## Checklist for you to verify before I move to Phase 2

- [ ] Run `npm run migrate` against your dev database and confirm it applies cleanly (and that `npm run migrate:undo` cleanly reverses it, if you want to test that).
- [ ] Set `GROQ_API_KEY` in your `.env` and confirm `llama-3.3-70b-versatile` is a model your Groq account actually has access to — if not, override `GROQ_MODEL`. I have no way to verify this from here.
- [ ] Sanity-check the 4 seeded price bands and the seeded prompt template text (in the migration file) — real launch prices still need to be set via the admin UI later, but if the placeholders are wildly off you may want different placeholders now.
- [ ] Confirm you're fine with the `candidate_relevancy_scores` RLS scope decision above (verifier/admin write, company read-only) — this is the one place I made a call Phase 2 might need to unwind.

## What's deliberately NOT in this phase (comes in Phase 2/3/4 per the build plan)
- No scoring engine yet — `candidate_relevancy_scores` and `relevancy_packages` are schema-only, nothing writes to them.
- No batch cards, no browse-batch, no purchase flow, no frontend.

Let me know once you've checked the above (or tell me to just proceed) and I'll start Phase 2 — the scoring engine.
