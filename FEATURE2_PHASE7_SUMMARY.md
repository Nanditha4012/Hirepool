# Feature 2, Phase 7 Summary — Applications, Badges, Shortlisting

Part of `AI_PACKAGES_ATS_BUILD_PLAN.md`, Feature 2, Phase 7. Builds on Phases 5-6 (`FEATURE2_PHASE5_SUMMARY.md`, `FEATURE2_PHASE6_SUMMARY.md`). This is where Feature 1's relevancy batches and Phase 6's external applicants actually converge into one pipeline.

## What was built

**Migration** (`20240123000001-job-applications.js`) — new `job_applications` table, the pipeline itself. A row only exists once a company has committed to a candidate: "Add to Job" (manual, one candidate) and bulk "Shortlist" (from a relevancy batch or the external applicant list) are modeled as **the same operation** — there's no separate "suggested but not yet added" state, since the relevancy batches and external applicant list already serve as that suggestions view via their own existing endpoints. Exactly one of `candidate_id`/`external_applicant_id` is set, enforced by a DB `CHECK` constraint (not just application code). `current_round_id` is a plain nullable UUID with no FK yet — `job_rounds` doesn't exist until Phase 8; the constraint gets added then, not by rewriting this migration. `status` starts minimal (`shortlisted`/`rejected`) and will grow via `ADD VALUE` as rounds/offer/joining phases land, same mechanism already used for `payment_type`/`achievement_type`.

**Endpoints** (`jobApplicationController.ts`, company side, `verifiedCompany`-gated — this touches candidate data, not just a company's own draft):
- `POST /companies/jobs/:jobId/applications` — bulk shortlist, one call serving both "Add to Job" and "Shortlist." Reports **per-item outcomes** (`created`/`already_shortlisted`/`error`) rather than failing the whole batch on one bad id.
- `GET /companies/jobs/:jobId/applications` — the applicant list, showing the Verified/External badge per row. Internal (Verified) candidates' contact info stays behind the **existing Unlock gate** — shortlisting is a pipeline action, not a paid unlock, so it doesn't bypass the monetization boundary `/search` and the relevancy batches already respect. External applicants' contact info is always visible — they gave it directly to this company by applying, no unlock concept applies to them.
- `PATCH /companies/jobs/:jobId/applications/:applicationId` — status update (shortlisted ↔ rejected).

**Candidate-facing**: `GET /candidates/me/applications` (`candidateController.listMyApplications`) — the "My Applications" view the shortlist notification points to. Didn't exist before this phase; added because the spec's own notification text names it.

**Notifications**: Verified candidates get an in-app `Notification` + email (`shortlistedVerifiedEmail`) immediately on shortlist. External applicants get email only (`shortlistedExternalEmail`), with a CTA to complete registration — the conversion path from Phase 6.

## The daily digest — Vercel Cron, per your decision

This is the app's **first genuinely time-based job**. Built as:
- `utils/dailyDigest.ts` — `sendDailyDigests()`, scoped narrowly for now: a candidate with ≥1 `shortlisted` application gets one digest, deduped against a 20-hour window (same pattern `companyController.maybeSendRenewalReminder` already uses). "Pending action" content is thin today by design — it'll grow automatically as rounds/offers add more to that query in later phases, without the cron plumbing needing to change.
- `GET /internal/cron/daily-digest` (`internalController.ts`, `internalRoutes.ts`) — guarded by a new `requireCronSecret` middleware (timing-safe comparison against `CRON_SECRET`, same style as the Razorpay webhook signature check), **not** the JWT/RLS session scheme every other endpoint uses. Deliberately **fails closed** if `CRON_SECRET` is unset — the opposite default from every other "optional external service" var in this app, because an unauthenticated cron endpoint has no legitimate caller the way an unconfigured email send does.
- `backend/vercel.json` — added a `crons` entry (`0 3 * * *`, daily at 03:00 UTC) pointing at that endpoint. **You need to set `CRON_SECRET` as an actual Vercel project env var** (same value as your `.env`) for Vercel to attach it automatically — documented in `.env.example`.

## Another cross-role RLS gap, found and fixed in the same migration

"My Applications" needs a candidate to read the `jobs` row and the `company_profiles` row behind their own applications — neither table has ever had a candidate-facing policy. This is the same class of gap this project has hit repeatedly (companies/verifiers needing to read a `users` row they don't own, across Phases 1/3/4) — added proactively this time (`jobs_select_candidate_applicant`, `company_profiles_select_candidate_applicant`) rather than discovered after shipping.

## Verification done
- `npx tsc --noEmit` — clean, no type errors.
- Not yet run: the migration against a real database, or a live shortlist → notification → digest round-trip, or an actual Vercel Cron invocation. I don't have database or Vercel deployment access from here.

## Checklist for you

- [ ] Run `npm run migrate` — one more migration on top of Phases 5-6.
- [ ] **Set `CRON_SECRET`** as a Vercel project environment variable (and in your local `.env` if testing) — without it, the digest endpoint refuses every request by design.
- [ ] Confirm the "Add to Job" and "Shortlist" being the same underlying action is what you intended — no separate "candidate is suggested but not yet in the pipeline" state exists in this data model.
- [ ] Confirm internal/Verified candidate contact info staying behind the existing Unlock gate on the applicant list (vs. shortlisting itself unlocking it) matches your intent.

## Next

Phase 8 — Coding & MCQ rounds: `job_rounds`, `job_round_results`, `custom_coding_questions` (mirroring the Contest module's schema so `codeRunner.ts` is shared), `mcq_master`. This is also where `job_applications.current_round_id` finally gets its foreign key.

Let me know once you've reviewed this, or say the word and I'll continue to Phase 8.
