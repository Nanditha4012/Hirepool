# Feature 1, Phase 2 Summary — Relevancy Scoring Engine

Part of `AI_PACKAGES_ATS_BUILD_PLAN.md`, Feature 1, Phase 2. Backend-only — no frontend work this phase. Builds directly on `FEATURE1_PHASE1_SUMMARY.md`.

## What was built

**Scoring engine** (`utils/relevancyScoring.ts`):
- `computeRelevancyPercent()` — deterministic, rule-based (per spec: "not the AI guessing"), four weighted signals: skills overlap (40), role match (30), experience match (15), domain match (15). An unstated requirement (e.g. no domain extracted) gives full credit on that signal rather than penalizing; experience gives partial credit proportional to how close a candidate is rather than an all-or-nothing cliff; a secondary-role match gets partial role credit, primary-role match gets full.
- `tierForPercent()` — buckets that single percent into the spec's four tiers (100%/90%+/75%+/50%+), floor at 50. **One spec ambiguity I resolved and want to flag**: the spec's tier bullet describes 100% as "near-exact match on skills, role, and experience" (no domain mentioned), but its scoring/schema section lists domain as a fourth weighted factor in the same score. I went with one weighted percent (domain included) and loosened the top-tier cutoff to ≥95 rather than literally 100, so a minor domain mismatch alone doesn't knock an otherwise-perfect candidate out of the top tier. If you intended domain to be excluded from the top-tier calculation specifically, this needs adjusting.
- `recomputeScoresForJob()` / `recomputeScoresForCandidate()` — the two event-triggered recompute paths (no scheduler, per your Phase 1 decision), each capped at 500 candidates/jobs per call with the cap surfaced in the result (`capped: boolean`), not silently truncated.

**RLS migration** (`20240119000001-relevancy-scores-company-write.js`): Phase 1 scoped the company's `candidate_relevancy_scores` policy to SELECT-only and flagged it'd need revisiting once recompute logic existed. It does now — JD-edit-triggered recompute runs inside the company's own request context, so this migration replaces that policy with a `FOR ALL` one scoped to jobs the company owns (needed DELETE too, since a recompute removes a score that's dropped below the 50% floor).

**Recompute hooks**:
- `jdController.ts` — `createJob`/`updateJob` now call `recomputeScoresForJob` right after a successful parse, and the response includes a `relevancyRecompute: { scored, eligible, capped }` field so it's visible rather than an invisible side effect.
- `verifierController.ts` — `decideProfile` calls `recomputeScoresForCandidate` after the approval transaction commits, only on `decision === 'approved'` (skips the extra transaction entirely for rejections/needs-info/flags). Runs after commit so a slow or failing recompute can never roll back or block the verifier's actual decision — same placement discipline this file already uses for the status-change email.

**Batch endpoints** (`relevancyController.ts`, mounted under `verifiedCompany` — same gate as `/search` and unlock):
- `GET /companies/jobs/:jobId/batches` — the four tier cards with live counts.
- `GET /companies/jobs/:jobId/batches/:tier/candidates` — paginated, unlock-gated candidate cards (contact fields withheld until unlocked, same rule as `/search`), sorted by relevancy percent descending. This is the "browse a batch on-platform using the normal unlock flow" requirement — no new unlock mechanism, it reads through the existing `Unlock` table.

## Verification done
- `npx tsc --noEmit` — clean, no type errors.
- Not yet run: the actual migration, or a live end-to-end test (job creation → Groq parse → recompute → batch browse) against a real database with candidates in it. I don't have a database or Groq key to test against from here.

## Checklist for you to verify before Phase 3

- [ ] Run `npm run migrate` — this phase adds one more migration on top of Phase 1's.
- [ ] Decide if you're fine with the scoring weights (skills 40/role 30/experience 15/domain 15) and the tier-cutoff resolution above (95+ for the top tier, domain included in the weighted score) — these are the two judgment calls most likely to need a second look.
- [ ] Once you have real candidates + a parsed job in a dev environment, sanity-check that `GET /companies/jobs/:jobId/batches` counts look right and that browsing a tier returns candidates sorted sensibly.

## What's deliberately NOT in this phase (Phase 3/4 per the build plan)
- No package purchase — `relevancy_packages` still isn't written to anywhere.
- No frontend — batch cards and browse UI don't exist yet.

Let me know once you've checked the above (or tell me to just proceed) and I'll start Phase 3 — package purchase via Razorpay.
