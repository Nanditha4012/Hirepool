# Hirepool — Phase 3 Complete: Company Portal

Status: **Code complete, migrated + seeded against the live Supabase DB, both halves build clean.** Awaiting your approval before starting Phase 4 (Verification Portal).

## What was built

### Database (`backend/migrations/20240103000001-phase3-company-portal.js`, `...002-phase3-rls-policies.js`)
- `plans_master` — the spec's 5 tiers (Free/Starter/Growth/Pay-per-unlock/Enterprise) with unlock/messaging caps, seeded.
- `unlocks` — permanent unlock records (unique per company+candidate, so re-unlocking never double-charges).
- `company_blocks` — candidate-initiated block/report, feeding Phase 5's future fraud dashboard.
- `candidate_profiles.location` / `.notice_period` and 8 new `company_profiles` columns (logo, website, industry, size, GST, plan, unlock/message quotas) — two real gaps caught while re-reading the spec: Phase 3's own filter bar requires location/notice-period, but Phase 2 never collected them.
- Every existing company backfilled onto the Free plan with a small dev-friendly starter allotment (3 unlocks) so unlocking is testable before Phase 6 payments exist.

### Backend (`backend/src/`)
- `companyController.searchCandidates` — the filter/search engine: tier, role, skills, domain, experience range, location, notice period, verified platform badge + questions-solved range, MNC/Startup/FAANG-MAANG chips, research/hackathon-win filters, sort, pagination. Contact fields only ever populated when the requesting company has actually unlocked that candidate.
- `unlockController` — unlock-for-credit flow (idempotent, decrements quota, blocks unverified companies), "My Unlocked Candidates" list with private notes.
- `companyMessageController` — company-side messaging mirroring Phase 2's candidate Inbox, enforcing the Free-plan monthly new-conversation cap, a daily rate limit, and respecting candidate blocks.
- `candidateBlockController` — candidates can block a company from their Inbox.
- `candidateController.listWhoUnlockedMe` — closes out a Phase 2 placeholder ("companies who unlocked you") with real data.

### Frontend (`frontend/src/`)
- `pages/company/{CompanySetupPage, SearchPage, UnlockedCandidatesPage, MessagesPage, DashboardPage, CompanyEntryPoint}.tsx` — full company portal, replacing the Phase 1 `CompanyStub`. Search results reuse Phase 2's `ProfileCard` unchanged.
- Companies can message a candidate directly from search results without unlocking first — a "Message" action on every result card (see bug notes below).
- Candidate-side follow-ups: Location/Notice Period fields added to the profile builder, a real "companies who unlocked you" list, and a "Block this company" action in the Inbox.

## Bugs caught and fixed during review
This phase had more review findings than Phase 1/2 combined — all fixed before migrating:

1. **Missing `id`/`platformProfileLink` on platform badges** in the search and unlocked-candidates API responses — `ProfileCard` needs both (for React keys and the clickable link); would have rendered broken/unclickable badge chips.
2. **Missing candidate cross-role read policy**: the `users` table's RLS (Phase 1) only ever let a user read their *own* row. No policy let a company read a candidate's name/contact — meaning search results, unlock responses, and company-side messaging would have silently returned `null` names and contact info for every candidate, even after a legitimate unlock. Added a scoped policy (approved candidates, or anyone the company has already unlocked — so contact info survives a candidate later editing their profile back to `submitted`).
3. **Missing company cross-role read policy**: symmetric gap — candidates had no way to read a company's name, so Phase 2's Inbox would have shown "Unknown company" for every real message. Fixed (company names aren't sensitive, unlike candidate contact info).
4. **A genuinely critical, pre-existing Phase 1 bug, found only now**: `candidate_profiles` and `company_profiles` had no RLS policy permitting the null-context `INSERT` that happens during signup (unlike `users`, which explicitly handles this). Every signup would have failed at the profile-creation step once the earlier `full_name` schema bug was fixed — this was never caught because no signup attempt had gotten past that earlier bug yet. Fixed by adding registration-context INSERT policies, since the original Phase 1 migration is already applied and can't be edited retroactively.
5. **Missing endpoint**: the plan called for a candidate-side "who unlocked me" endpoint but it was never built by the backend pass — added `GET /candidates/me/unlocked-by`.
6. **Missing feature relative to spec intent**: `SearchPage` initially only had an Unlock button — no way to message a candidate without unlocking first, despite the spec explicitly emphasizing messaging is "distinct from unlock... so companies can reach out before committing a credit." Added a Message action wired to the already-built message composer.
7. **Missing page**: the plan called for a company dashboard hub (unlocks-used-vs-quota, plan, nav into Search/Unlocked/Messages) that neither build agent produced — built directly.

All fixes verified against the live Supabase DB after migrating (policy list, seed counts, and backfill all confirmed via direct query).

## Explicit scope decisions
- Skill filtering uses ANY-of-selected-skills semantics, not ALL — simpler, still useful for browsing.
- `sort=relevance` and `sort=boosted` both fall back to recency ordering — no real relevance scoring or boost data exists yet (Boost is Phase 6).
- Messaging cap/rate-limit tracking uses simple counters rather than a scheduled monthly reset job (no cron infrastructure yet) — acceptable for this phase, revisit if it matters before Phase 6.
- Invoice history and Enterprise team-seat management are explicit placeholders — out of a zero-cost MVP's Phase 3 scope, Phase 6/later.

## Verification checklist

- [x] Migration + RLS applied cleanly against the live Supabase DB; `plans_master` has 5 rows; existing company backfilled to Free plan
- [x] Backend and frontend both compile and production-build with zero errors
- [ ] Company signup → setup form → dashboard; unverified company sees a blocked unlock action in search
- [ ] (Simulate verifying a company in the DB) search/filter candidates, unlock one — quota decrements, contact appears, candidate appears permanently in "My Unlocked Candidates"
- [ ] Re-unlocking the same candidate doesn't double-decrement
- [ ] Message a candidate directly from search without unlocking first
- [ ] Free-plan company hits its monthly messaging cap and gets a clear error, not a silent failure
- [ ] Candidate's Inbox shows a real incoming company message with a real company name (not "Unknown company")
- [ ] Candidate can block a company; that company's next message attempt is rejected
- [ ] Candidate's dashboard "companies who unlocked you" section shows real data
- [ ] Filters (tier, skills, domain, experience, location, notice period, MNC/Startup/FAANG chips) narrow results correctly

## Not yet done (by design — later phases)
- Verifier portal actually processing the Track 1 / Track 2 review queues (Phase 4)
- Admin portal, including approving `company_requests` and company verification itself (Phase 5)
- Payments — Boost, plan upgrades, real unlock/message quota top-ups (Phase 6)
- Full PWA/security hardening pass (Phase 7)

---
**Waiting on your go-ahead to start Phase 4 (Verification Portal).**
