# AI Relevancy Packages & ATS — Phase-Wise Build Plan

Source spec: `Hirepool_AI_Packages_and_ATS_Spec (1).md`
Decisions locked in before this plan: Groq for JD parsing, admin-editable seeded price bands, event-triggered relevancy recompute (no new cron), `external_applicants` fully separate from `users` until conversion, Feature 1 ships completely before Feature 2 starts.

Status: **draft plan — nothing built yet.** Per the usual workflow, each phase below gets built, summarized, and approved individually before the next one starts.

---

## Feature 1 — AI Relevancy Packages (4 phases)

### Phase 1 — Schema & Groq foundation
- Migration: `jobs` — lean version for now: `id, company_id, title, description nullable, created_at`. This gets extended with careers-page columns in Phase 5, additive only.
- Migrations: `job_requirements_parsed`, `candidate_relevancy_scores`, `relevancy_packages`, `relevancy_package_price_bands` (admin-editable, seeded with placeholder prices per band).
- `site_settings` seed: `jd_parsing_prompt_template`.
- `env.ts`: `GROQ_API_KEY` optional-default pattern + `isGroqConfigured()`, matching Razorpay/SMTP/DigiLocker.
- `utils/groq.ts` — JD parsing call, structured JSON output, prompt pulled from `site_settings` (not hardcoded).
- Sequelize models: `Job`, `JobRequirementParsed`, `CandidateRelevancyScore`, `RelevancyPackage`, `RelevancyPackagePriceBand`.
- RLS: company owns its own jobs/scores/packages; admin full access; no direct candidate exposure to raw scores.

### Phase 2 — Scoring engine
- `utils/relevancyScoring.ts` — deterministic weighted comparison (skills overlap, role match, experience match, domain match) against eligible (approved) candidates.
- Recompute triggers: (a) synchronously when a candidate's profile is approved by a verifier — hooks into the existing approval controller action; (b) synchronously when a JD is created or edited.
- Batching: group into 100% / 90%+ / 75%+ / 50%+ tiers with live counts.
- Endpoints: `GET /companies/jobs/:jobId/batches` (tier cards + counts), `GET /companies/jobs/:jobId/batches/:tier/candidates` (browse via the existing unlock flow).

### Phase 3 — Package purchase
- New `payment_type` enum value: `relevancy_package`; metadata shape `{jobId, tier, candidateCount, priceBandId}`.
- `POST /companies/jobs/:jobId/batches/:tier/purchase` — separate Razorpay order flow from subscribe/unlock-topup, doesn't touch monthly unlock quota.
- On webhook success: create `relevancy_packages` row, generate downloadable candidate package (reuse the admin CSV-export pattern), track `downloaded_at` on first download.
- Surface `relevancy_package` payments in the existing admin payments ledger and company invoice history.

### Phase 4 — Frontend
- Company: JD paste form, 4-tier batch cards, browse-batch (reuse existing search/unlock components), buy-package flow (reuse existing Razorpay checkout UI), invoice history line items.
- Admin: price-band management (existing master-data CRUD UI style), `jd_parsing_prompt_template` editor via the `site_settings` admin UI.

---

## Feature 2 — End-to-End ATS (7 phases, starts after Feature 1 is fully done)

### Phase 5 — Careers Page & job extension
- Migration (additive to `jobs`): `custom_job_id` (unique per company), `status`, `careers_link_slug` (unique, auto-generated), `form_type` enum (simple/detailed/foreign/custom), `custom_form_schema` jsonb, `closed_at`.
- Migration: `application_forms_master`, seeded with Simple/Detailed/Foreign field templates.
- Public route group (no auth, rate-limited): `GET /careers/:slug` — returns job + form schema.
- Custom form builder: Zod-validated `custom_form_schema` shape on write.

### Phase 6 — External applications
- Migration: `external_applicants` (`form_data` jsonb, `relevancy_percent`, `tier`, `applied_at`, `converted_candidate_id` nullable).
- Public route: `POST /careers/:slug/apply` — rate-limited, no auth, null-context RLS insert (same pattern as registration). Scores the submission using the same engine from Phase 2, generalized to accept form data as well as a real candidate profile.
- Conversion: registration/verification flow checks for a matching external application by email and links `converted_candidate_id` once the person becomes a real verified candidate.

### Phase 7 — Applications, badges, shortlisting
- Migration: `job_applications` (`candidate_id` nullable, `external_applicant_id` nullable, `source`, `verified_badge`, `status`, `current_round_id`, `shortlisted_at`).
- Manual "Add to Job" from company search; AI-batch candidates and external applicants both feed in as suggestions; bulk shortlist endpoint.
- Notifications: shortlist (in-app+email for Verified, email-only+verify-prompt for External).
- **Open item, flagging now rather than deciding silently:** the spec's "daily digest" genuinely needs a time-based trigger — it can't be made event-triggered the way score recompute was. This is different from the Phase 1-3 decision (that was specifically about relevancy recompute). Since this app is Vercel-hosted, Vercel Cron is the natural zero-cost fit and wouldn't require new server infra — I'll bring this back as a specific question when we reach this phase rather than assume it now.
- Frontend: applicant list with Verified/External badges, bulk-select shortlist button.

### Phase 8 — Coding & MCQ rounds
- Migration: `job_rounds`, `job_round_results`, `custom_coding_questions` (mirrors `ContestQuestion`'s content/sample/hidden-test-case shape so `codeRunner.ts` is shared, not duplicated), `mcq_master`.
- Default round template seed (Shortlisted → Coding → Interview → Offer → Joining), fully editable per job.
- SQL questions: sql.js integrated frontend-only for SQL-type custom questions.
- Frontend: company round/question management, candidate round-taking UI (built on top of existing contest-runner components).

### Phase 9 — Interview round
- Migration: `interview_sessions` (`meeting_link`, `scheduled_at`, `status`).
- Jitsi room-link generation (no API key needed), scheduling endpoint.
- Manual Pass/Fail/Hold + score + notes on any round type → triggers next-stage notification.
- Frontend: scheduling UI (company), join-meeting UI (both sides, embedded Jitsi iframe).

### Phase 10 — Offer & joining
- Migration: `offers`, `joining_formalities` (`documents` jsonb, `bgv_status` enum, `bgv_agency_name`, `bgv_updated_at`).
- Offer upload/generate, candidate accept/decline, joining-formalities document checklist, manual BGV status field (no live API).
- Frontend: candidate offer view + accept/decline, company BGV status updater.

### Phase 11 — Analytics
- Read-only aggregation layer over `job_applications`/`job_round_results`/`offers`/`joining_formalities` timestamps — no new tables needed.
- Full funnel with drop-off rate per stage split Verified vs External, average score per round, average time-in-stage, time-to-hire.
- Frontend: per-job analytics dashboard, persists indefinitely (no purge path, even on reopened/closed jobs).

---

**Total: 11 phases** (4 for Feature 1, 7 for Feature 2) — roughly comparable in scope to the original 7-phase full-platform build, which tracks given this is genuinely two large feature sets.

**Next step:** confirm this breakdown, then Phase 1 starts — schema migrations, Groq wrapper, and the base models. I'll stop after Phase 1 with a summary + checklist for review before Phase 2, per the usual process.
