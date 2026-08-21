# Feature 2, Phase 11 Summary — Analytics

Part of `AI_PACKAGES_ATS_BUILD_PLAN.md`, Feature 2, Phase 11 — **the last phase in the build plan.** Backend only, matching every ATS phase since Phase 5.

## What the plan said, and what was built

- **"Read-only aggregation layer over `job_applications`/`job_round_results`/`offers`/`joining_formalities` timestamps — no new tables needed."** No migration this phase. One endpoint, `GET /companies/jobs/:jobId/analytics` (`jobAnalyticsController.getJobAnalytics`), reads existing tables only.
- **"Full funnel with drop-off rate per stage split Verified vs External."** Funnel stages: Shortlisted → each of the job's own rounds, in order → Offer → Joined. Each stage reports total/Verified/External counts and a drop-off rate relative to the previous stage (Joined's drop-off is relative to Offer, not the last round, since not every offer is followed by acceptance).
- **"Average score per round."** Mean of `job_round_results.score` per round, null-safe (a round with no scored results yet reports `null`, not `0`).
- **"Average time-in-stage."** See the flagged approximation below.
- **"Time-to-hire."** Mean of (offer `responded_at` − application `shortlisted_at`), in days, across accepted offers only.
- **"Persists forever, even on reopened jobs."** Needed no code — nothing in this app has ever purged `job_applications`/`job_round_results`/`offers`, so history is already permanent by construction. Confirmed, not built.
- **Frontend: per-job analytics dashboard.** Not built — consistent with every ATS phase since Phase 5.

## A necessary approximation, flagged rather than glossed over

"Average time-in-stage" implies a per-round **entry** timestamp — when did this candidate start this round — which doesn't exist anywhere in the schema. `job_applications.current_round_id` is a pointer, not a history, and no earlier phase added a "candidate entered this round at time X" column (adding one now would have meant a new column, which the plan's own "no new tables needed" line rules out for this phase).

The proxy used instead: for each round, the average time from **the application being shortlisted** to **that round's result being decided** (`job_round_results.updated_at − job_applications.shortlisted_at`). That's "time from shortlist to this round's decision," not "time spent specifically inside this round" — for a candidate's 3rd round, this number includes however long rounds 1 and 2 also took. Worth knowing before reading these numbers as precise per-round durations. If you want the literal metric, it needs a new "entered round" timestamp added somewhere upstream (naturally, whenever `current_round_id` is set) — flagging as a real gap, not fixing it silently here.

## Verification done
- `npx tsc --noEmit` — clean, no type errors.
- Not yet run: against real data — every number here is a fresh aggregation with no data to sanity-check yet.

## Checklist for you

- [ ] Confirm the "time-in-stage" approximation above is acceptable, or whether you want a real per-round-entry timestamp added (a small follow-up, not part of this phase as scoped).
- [ ] Confirm "Joined" being defined as `offer.status === 'accepted'` matches your intent — there's no separate "onboarding complete" signal in `joining_formalities` beyond BGV status, which is agency-side and not itself a joining-complete flag.

## This closes out the AI_PACKAGES_ATS_BUILD_PLAN.md build plan

All 11 phases are now backend-complete: Feature 1 (AI Relevancy Packages, Phases 1-4, including frontend) and Feature 2 (the ATS, Phases 5-11, backend only per the pattern that emerged starting Phase 5). What's left across the whole plan, gathered in one place:

- **Frontend** for every Feature 2 phase (5 through 11) — careers page, external application form, applicant list with badges, round-taking UI, interview scheduling/join screen, offer/joining UI, analytics dashboard.
- **sql.js** in-browser SQL grading (Phase 8, frontend-only piece).
- **Real per-round-entry timestamp** if precise time-in-stage is wanted (Phase 11 follow-up, noted above).
- **The pre-existing webhook RLS gap** on `company_profiles`/`candidate_profiles` found during Feature 1 Phase 3 — still unpatched, your call.
- Every migration from Phase 1 through Phase 11 needs to actually run (`npm run migrate`) against a real database — none of this has been exercised against live data yet.
- Real credentials needed to test end-to-end: Groq (JD parsing), Razorpay (package purchase), Judge0/Piston (coding rounds), `CRON_SECRET` set as a Vercel env var (daily digest).

Let me know what you'd like next — a specific frontend phase, the webhook RLS fix, or something else entirely.
