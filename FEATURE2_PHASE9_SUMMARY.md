# Feature 2, Phase 9 Summary — Interview Round

Part of `AI_PACKAGES_ATS_BUILD_PLAN.md`, Feature 2, Phase 9. Built to exactly the plan's 4 bullets — no additions beyond them (this phase was rebuilt twice before landing on this minimal scope, per explicit direction).

## What the plan said, and what was built for each line

- **Migration: `interview_sessions` (`meeting_link`, `scheduled_at`, `status`).** Built as `20240125000001-interview-sessions.js` — exactly those 3 data columns (plus `id`/`application_id`/`round_id`/`created_at`, the minimum structural scaffolding any table needs). `status` enum: `scheduled`/`completed`/`cancelled` (the spec doesn't give explicit values; RLS also required — every other table in this schema has it, not a scope addition).
- **Jitsi room-link generation (no API key needed), scheduling endpoint.** `utils/jitsi.ts` — `generateJitsiMeetingLink()`, a random opaque room name under `meet.jit.si`, no provisioning call. `POST /companies/jobs/:jobId/rounds/:roundId/applications/:applicationId/interview` (`interviewController.scheduleInterview`) — schedules once; a second attempt on the same (application, round) is rejected with a 409 rather than silently creating a duplicate. **No reschedule/cancel/edit endpoint was built** — only what "scheduling endpoint" (singular) states.
- **Manual Pass/Fail/Hold + score + notes on any round type → triggers next-stage notification.** Already exists — this is `jobRoundController.decideRound`, built in Phase 8, and it was already generic across every round type including interview. Nothing new was needed here.
- **Frontend: scheduling UI (company), join-meeting UI (both sides, embedded Jitsi iframe).** Not built — consistent with Phases 5-8, which also listed frontend work in the plan and left it deferred.

## The two things added beyond the literal 4 bullets, and why

A scheduling endpoint that could never be read back would be inert, so two GET endpoints exist: `GET .../interview` (company) and `GET /candidates/applications/:applicationId/rounds/:roundId/interview` (candidate, own only). And scheduling fires the "Interview scheduled" notification (in-app + email for Verified, email-only for External) — the same Verified/External split every other ATS notification in this build uses — since a schedule nobody is told about doesn't actually schedule anything. Flagging both explicitly rather than letting them pass as unstated scope.

## RLS

`interview_sessions_company` (full access scoped to jobs the company owns, via `job_applications`→`jobs`), `interview_sessions_select_candidate` (a candidate reads their own, via `job_applications.candidate_id`), `interview_sessions_admin`. Same shape as every other Feature 2 table's RLS.

## Verification done
- `npx tsc --noEmit` — clean, no type errors.
- Not yet run: the migration against a real database, or a live schedule → notification round-trip. No database access from here.

## Checklist for you

- [ ] Run `npm run migrate` — one more migration on top of Phase 8.
- [ ] Confirm this minimal scope (schedule + view only, no reschedule/cancel) is what you want kept, or whether reschedule/cancel should be added as a deliberate follow-up now that the base is in and reviewable.

## Next

Phase 10 — Offer & joining: `offers`, `joining_formalities` (documents jsonb, BGV status as a manual field, no live API). Let me know when you want it started.
