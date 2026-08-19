# Feature 2, Phase 8 Summary — Coding & MCQ Rounds

Part of `AI_PACKAGES_ATS_BUILD_PLAN.md`, Feature 2, Phase 8. Builds on Phases 5-7. Backend only — this is the largest single phase so far, comparable in scope to the original Contest module; round/question management UI, candidate round-taking UI, and the sql.js in-browser SQL grading are frontend work, explicitly not built here.

## Filling in what the spec's schema left implicit

The spec's own DB list for this phase (`job_rounds`, `job_round_results`, `custom_coding_questions`, `mcq_master`) undersp ecifies a few things a working system needs. Rather than guess silently, here's what I resolved and why:

- **"Hirepool's master coding question dataset"** isn't a new table — it's the **existing `contest_questions` table**, reused as-is (type='coding'). The spec's schema list only adds `custom_coding_questions` (private), which only makes sense if the public bank already exists — it does, from the Contest module. This is also why `custom_coding_questions` mirrors `ContestQuestion`'s content shape closely: `codeRunner.ts` and `executeAgainstCases` are shared, not duplicated.
- **`mcq_master` serves both the public bank and a company's custom MCQs** via nullable `company_id`/`job_id` columns, rather than two tables — the spec lists only one new MCQ table.
- **A new link table, `job_round_questions`**, not in the spec's list but required — a round can't function without knowing which questions (from any of the three sources) belong to it, in what order, worth how many points. Polymorphic (`question_source`/`question_id`, no FK), same pattern already used by `verification_logs.target_type`/`target_id`.
- **`job_round_results.submission_detail` (jsonb)** folds what would otherwise be a full parallel `ContestAttempt`/`ContestQuestionResponse`-style relational system into one column — per-question responses, pass/fail, points, for whichever attempt a candidate submitted. This is a real scope simplification versus a fully relational per-question response table; flagged for your awareness, not hidden.
- **Default round template**: only "Coding Round" and "Interview Round" get seeded as actual `job_rounds` rows. "Shortlisted" and "Offer"/"Joining" are pipeline bookends (`job_applications.status`, and the not-yet-built `offers`/`joining_formalities` tables) — the spec's own `round_type` enum (coding/mcq/interview/custom) has no slot for them, which is the tell that they were never meant to be round rows.
- **`job_applications.current_round_id`** finally gets its FK constraint (deferred from Phase 7, since `job_rounds` didn't exist yet).

## SQL questions — a real, spec-driven trust boundary

Per spec, SQL custom questions grade via sql.js **in the candidate's browser**, zero server cost. `codeRunner.ts` has no SQL provider at all — so a submission for an `is_sql` question carries a **client-reported** pass count, not a server-executed one. This is not an oversight: it's what the spec's "free in-browser SQLite engine" approach means. Worth knowing plainly: **a candidate's browser can misreport its own SQL grading result**, unlike every other language here, which runs server-side via Judge0/Piston and is trustworthy. If that's an unacceptable risk for a real hiring decision, the alternative is running SQL server-side too (a real SQLite binary/library call), which is a bigger change than this phase's scope.

## What was built

**Migration** (`20240124000001-job-rounds.js`) — 5 new tables (`job_rounds`, `custom_coding_questions`, `mcq_master`, `job_round_questions`, `job_round_results`) with RLS on all of them, plus `job_applications`' deferred FK.

**Company-side** (`jobRoundController.ts`): round CRUD + default-template seed; attach/detach questions to a round (validates ownership/existence per source, not just trusting a client-supplied id); CRUD for the company's own coding-question and MCQ banks; `listRoundResults`/`decideRound` — the manual pass/fail/hold + score + notes decision, which is what actually **triggers the candidate notification** (in-app + email for Verified, email-only for External — same split established in Phase 7), not the candidate's own submission.

**Admin-side**: CRUD for the public MCQ bank (`company_id IS NULL` rows only), same pattern as every other admin master-data screen.

**Candidate-side** (`candidateRoundController.ts`) — the trust boundary file, same discipline as `contestController.toCandidateQuestion`: `getRound` resolves a round's questions with hidden test cases reduced to a count and MCQ `correctAnswer` never included at all; `submitRoundAttempt` auto-grades (codeRunner for coding, exact-match for MCQ, client-trusted for SQL) and writes **only** `score`/`submissionDetail` to `job_round_results` — `result`/`notes`/`updatedBy` are the company's decision alone. RLS can't enforce that column-level split (row-level only, same recurring caveat as `hiddenTestCases`/`post_reports.user_id` elsewhere in this schema) — the controller is the actual guard here, and it's worth a second pair of eyes given how much rides on it.

**Round advancement is manual, not automatic**: submitting a round attempt does not move `job_applications.current_round_id` forward, and neither does a company's pass/fail/hold decision. Advancing a candidate to the next round is left as a company action via the existing `updateJobApplication` endpoint (Phase 7) — not built out further here, since Phase 9 (interview scheduling) will have more to say about what "next round" actually means in practice.

## Verification done
- `npx tsc --noEmit` — clean, no type errors.
- Not yet run: the migration against a real database, or a live round end-to-end (create round → attach questions → candidate submits → company decides → notification fires). I don't have database or code-runner (Judge0/Piston) credentials to test against from here.

## Checklist for you

- [ ] Run `npm run migrate` — one more migration on top of Phases 5-7.
- [ ] **Read the `candidateRoundController.ts` trust-boundary claims yourself** before relying on them — this is the file responsible for never leaking hidden test cases or MCQ answers, and I'd rather you verify than just take my word for it on something security-relevant.
- [ ] Decide if the SQL client-trust tradeoff above is acceptable as-is, or if you want server-side SQL execution added later.
- [ ] Confirm round advancement staying fully manual (no auto-progression) matches your intent.
- [ ] With real Judge0/Piston access, sanity-check that a coding submission actually scores correctly end-to-end.

## Next

Phase 9 — Interview round: `interview_sessions`, Jitsi room-link generation (no API key needed), scheduling. This is also where "what does the company do with a candidate who passed the coding round" gets a concrete next step.

Let me know once you've reviewed this, or say the word and I'll continue to Phase 9.
