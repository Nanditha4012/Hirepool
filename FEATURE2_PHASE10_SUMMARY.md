# Feature 2, Phase 10 Summary — Offer & Joining

Part of `AI_PACKAGES_ATS_BUILD_PLAN.md`, Feature 2, Phase 10. Backend only, matching Phases 5-9's scope. Built to the plan's bullets, with the same "flag what's added beyond the literal text" discipline established in Phase 9.

## What the plan said, and what was built

- **Migration: `offers`, `joining_formalities`.** Columns exactly as spec'd: `offers` (`application_id`, `offer_letter_link`, `status`: sent/accepted/declined, `sent_at`, `responded_at`); `joining_formalities` (`application_id`, `documents` jsonb, `bgv_status`: pending/in_progress/cleared/flagged, `bgv_agency_name`, `bgv_updated_at`). Both unique on `application_id` — one offer, one joining-formalities record per application. `offer_letter_link` and each entry in `documents` are links, not uploaded files — same convention as `resume_link`/`portfolio_link` elsewhere; this app has never stored document bytes.
- **Offer upload/generate.** `POST /companies/jobs/:jobId/applications/:applicationId/offer` (`offerController.sendOffer`) — company supplies a link, one offer per application (409 on a second attempt, not a silent duplicate).
- **Candidate accept/decline.** `POST /candidates/applications/:applicationId/offer/respond` (`candidateOfferController.respondToOffer`) — sets `status`/`responded_at`; rejects responding twice.
- **Joining-formalities document checklist.** On acceptance, a `joining_formalities` row is created automatically (spec: "On acceptance, a joining-formalities checklist opens"). `PATCH /candidates/applications/:applicationId/joining/documents` lets the candidate submit their document links; attempting this before accepting returns a clear error rather than a confusing 404.
- **Manual BGV status field (no live API).** `PATCH /companies/jobs/:jobId/applications/:applicationId/joining/bgv` — company sets `bgv_status`/`bgv_agency_name` directly. No BGV API integration exists or was added, per spec.

## What was added beyond the literal bullets, and why

Same reasoning as Phase 9: a write with no way to read it back is inert. Four GETs exist — company's `getOffer`/`getJoiningFormalities`, candidate's `getMyOffer`/`getMyJoiningFormalities` — mirroring their respective POST/PATCH counterparts. And sending an offer fires the "Offer sent" notification (in-app + email for Verified, email-only for External) — this one **is** explicitly in the original spec's "Notifications needed" list, not an invention. No notification was added for accept/decline or BGV updates, since neither appears in that list — the company checks those via the GET endpoints instead.

## RLS

`offers`/`joining_formalities` each get: company (full access, scoped to jobs it owns via `job_applications`→`jobs`), candidate (full access, scoped to their own `job_applications` row), admin (full). RLS is row-level, not column-level, so it can't stop a candidate from writing `bgv_status` or a company from writing `documents` at the database layer — the controllers are the actual guard (candidate's endpoint only ever touches `documents`; company's only ever touches the BGV fields), same caveat that's applied throughout this schema (hidden test cases, `post_reports.user_id`, round results).

## Verification done
- `npx tsc --noEmit` — clean, no type errors.
- Not yet run: the migration against a real database, or a live offer → accept → document-upload → BGV-update round-trip. No database access from here.

## Checklist for you

- [ ] Run `npm run migrate` — one more migration on top of Phase 9.
- [ ] Confirm the two additions (GET endpoints, offer-sent notification) are welcome, same as Phase 9's.

## Next

Phase 11 — Analytics: the last phase in the build plan. Read-only aggregation over `job_applications`/`job_round_results`/`offers`/`joining_formalities` — full funnel with drop-off rate per stage split Verified vs External, average score per round, average time-in-stage, time-to-hire. No new tables. Let me know when you want it started.
