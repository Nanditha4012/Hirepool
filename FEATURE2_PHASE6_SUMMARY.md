# Feature 2, Phase 6 Summary — External Applications

Part of `AI_PACKAGES_ATS_BUILD_PLAN.md`, Feature 2, Phase 6. Builds on `FEATURE2_PHASE5_SUMMARY.md`. Backend-only, matching Phase 5's scope.

## What was built

**Migration** (`20240122000001-external-applicants.js`) — new `external_applicants` table: `job_id`, `form_data` (jsonb, the complete raw submission), denormalized `full_name`/`email` (for querying and conversion matching — same rationale as `feed_posts.author_name`), `relevancy_percent`/`tier` (directly on the row, not a separate scores table, since an external applicant only ever belongs to one job), `applied_at`, `converted_candidate_id`. Unique on `(job_id, lower(email))` — a second submission from the same email to the same job is rejected, not duplicated.

**Scoring generalized** (`utils/relevancyScoring.ts`): a new `scoreExternalApplication()` builds the same internal snapshot shape real candidates use, straight from the raw form submission (`skills` comma-split, `role` as free text, `years_of_experience` parsed), then runs it through the identical `computeRelevancyPercent` real candidates use — one scoring code path, not two. One deliberate adjustment: none of the seeded application forms collect a "domain" field (matching the spec's own description of the Simple form as covering only "skills, role, experience"), so `computeRelevancyPercent` gained an `includeDomain` flag — external applicants always get full credit on that dimension rather than being structurally capped below an otherwise-identical real candidate for a field they were never asked to provide.

**Public apply endpoint** — `POST /careers/:slug/apply` (`careersController.applyToJob`, rate-limited at 10/15min/IP, no auth): validates the submission against the job's resolved field list (shared with `getJobBySlug` via a new `resolveJobFields` helper), rejects on missing required fields, and enforces a valid `email` **unconditionally** — regardless of whether the form itself marked that field required — since it's the only way a company can contact an applicant and the sole key `converted_candidate_id` matching runs against. Scores against the job's parsed requirements if any exist; stays `null`/`null` if the job was never successfully parsed (mirrors the spec's own "without required structured fields, an external application can't be placed into a relevancy batch," generalized to the job's side of that same requirement).

**Conversion** — added to `authController.signup`'s existing candidate-signup branch (not a new endpoint): right after a new candidate account is created, any `external_applicants` rows matching that email with `converted_candidate_id IS NULL` get linked, in the same transaction. Runs for every candidate signup, not just ones that came from a careers link — the `UPDATE ... WHERE email = ... AND converted_candidate_id IS NULL` is simply a no-op when there's nothing to link.

**One constraint added to Phase 5's endpoint**: `generateCareersLink`'s Zod validation now requires a `custom` form to include fields keyed exactly `email` and `full_name`. This wasn't needed until Phase 6 introduced the thing that depends on it (conversion matching, contact) — a custom form with no guaranteed way to identify or reach the applicant would have been a dead end.

## RLS, and a pattern repeating for the third time

`external_applicants` needs a genuinely anonymous INSERT (the apply endpoint) and a genuinely anonymous UPDATE (conversion, at signup — also no session). Both added as null-context policies (`current_setting(...) IS NULL`), same shape as `payments_update_for_webhook` (Phase 6 payments) and `relevancy_packages_update_for_webhook` (Feature 1 Phase 3) before it. Company gets **SELECT-only** on applicants to its own jobs — deliberately not UPDATE, because this phase scores an applicant once, at apply time, against whatever the job's requirements were then; it does **not** rescore existing applicants if the JD is edited afterward (unlike `candidate_relevancy_scores`, which does get rescored on JD edit). If you want that later, it's the same lesson as Feature 1 Phase 1→2's RLS widening — flagged now, before it's discovered as a gap.

## Verification done
- `npx tsc --noEmit` — clean, no type errors.
- Not yet run: the migration against a real database, or a live apply → conversion round-trip. I don't have database access from here.

## Checklist for you

- [ ] Run `npm run migrate` — one more migration on top of Feature 2's Phase 5 one.
- [ ] Confirm the conversion trigger point (registration, not verification) matches your intent — the spec's "once they verify/register" phrasing could be read either way; I went with registration since that's the point a `candidate_id` first exists.
- [ ] Confirm forcing `email`/`full_name` keys on custom forms is acceptable — it's a real constraint on what a company can build, driven by the platform's own needs (contact + conversion), not the company's.
- [ ] Decide whether external applicants should get rescored when a JD is edited (see the RLS note above) — not built in this phase.

## Next

Phase 7 — Applications, badges, shortlisting: `job_applications` (unifying Verified and External candidates into one pipeline), the Verified/External badge, manual "Add to Job," bulk shortlist, and the shortlist notifications (including the daily-digest question flagged back in the original build plan, still unresolved). This is where the two candidate sources — Feature 1's relevancy batches and this phase's external applicants — actually converge into one applicant list a company works from.

Let me know once you've reviewed this, or say the word and I'll continue to Phase 7.
