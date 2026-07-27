# Hirepool — Phase 4 Complete: Verification Portal

Status: **Code complete, migrated + seeded against the live Supabase DB, both halves build clean.** Awaiting your approval before starting Phase 5 (Admin Portal).

## What was built

### Database (`backend/migrations/20240104000001-phase4-verification.js`)
- `candidate_profiles.assigned_verifier_id` / `.submitted_at` — reviewer assignment and a dedicated submission timestamp (needed since `updatedAt` gets overwritten by later edits, including the approval decision itself — it can't answer "how long since submission").
- `rejection_reasons_master` (11 seeded reasons split `profile`/`item` scope) — the spec's "mandatory reason dropdown" plus the build's own data-consistency rule both required this to be a dropdown backed by a master table, not free text.
- No new RLS needed on `candidate_profiles`/`candidate_platform_badges`/`candidate_achievements`/`verification_logs` — Phase 1 already granted verifiers access to all four.

### Backend (`backend/src/controllers/verifierController.ts`)
- **Track 1 (profile-level)**: queue by tier (oldest-first), claim (blocks a second verifier from claiming the same profile), full review detail, and Approve/Reject/Needs-Info/Flag decisions — each writes a `verification_logs` row and notifies the candidate via the existing `notifications` table.
- **Track 2 (item-level)**: separate badge and achievement queues spanning every candidate regardless of their profile's status, with the same Verified/Incorrect decision pattern — confirmed to never touch the main profile's status, exactly as the spec's "two independent tracks" rule requires.
- **Analytics**: average time-to-approve, backlog counts per queue, 30-day rejection-reason breakdown.
- `masterController.listRejectionReasons` — public endpoint feeding the frontend's reason dropdowns.

### Frontend (`frontend/src/pages/verifier/`)
- `QueuePage` (tier tabs, claim action), `ProfileReviewPage` (candidate summary, category-aware Track 1 checklist with clickable links to what needs checking, read-only Track 2 context, decision panel), `BadgeQueuePage`, `AchievementQueuePage`, `AnalyticsPage` — replacing the Phase 1 `VerifierStub`.

## A real bug caught during review

Same class of gap found and fixed in Phase 3, now on the verifier side: the `users` table had no RLS policy letting a **verifier** read a candidate's row. Every `fullName`/`phone`/`email` lookup in the queue and review pages (`listProfileQueue`, `getProfileForReview`, both Track 2 queues) would have silently returned blank names — the entire portal would have looked broken, showing anonymous rows with no way to identify who you're reviewing. Fixed with a policy scoped to `role='candidate'` with no status restriction (deliberately broader than the Phase 3 company-facing version — verifiers exist specifically to review candidates who are *not yet* approved, so scoping to `status='approved'` would have made the review queue itself unreadable). Confirmed fixed against the live database.

## A known limitation, by design

Verifier accounts are admin-provisioned, not self-signup (a Phase 1 design decision). Since the Admin portal that would create them is Phase 5, testing this phase requires manually inserting a verifier user directly in the database — same workaround already in use for Phase 3's company-verification testing. This resolves itself once Phase 5 ships.

## Verification checklist

- [x] Migration applied cleanly against the live Supabase DB; 11 rejection reasons seeded; the verifier RLS fix confirmed live
- [x] Backend and frontend both compile and production-build with zero errors
- [ ] Manually insert a verifier user + role in the DB, log in, confirm TOTP enrollment still gates access
- [ ] A submitted profile appears in the correct tier queue tab, oldest-first
- [ ] Claim moves status to `under_review`; a second verifier can't claim the same profile
- [ ] Approve makes the profile live even while its badges/achievements are still pending
- [ ] Reject/Needs-Info requires picking a reason; the candidate sees it via their existing "what to fix" note
- [ ] Flag as Suspicious logs the decision without changing the profile's live status
- [ ] Marking a badge/achievement Incorrect hides it and notifies the candidate, without touching the main profile
- [ ] Analytics shows backlog counts and a rejection-reason breakdown after a few test decisions

## Not yet done (by design — later phases)
- Admin portal — including creating verifier accounts, consuming "flagged" profiles, overriding decisions (Phase 5)
- Payments, full PWA/security hardening (Phases 6–7)

---
**Waiting on your go-ahead to start Phase 5 (Admin Portal).**
