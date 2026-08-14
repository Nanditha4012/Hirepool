# Candidate profile verification — current status

Analysis of what's implemented as of `ab7a372` (2026-08-14). This is not part of
the original 7-phase build (`PHASE_1_SUMMARY.md` – `PHASE_7_SUMMARY.md`) — it's a
later workstream ("stage1", commits by Varugowdatp) layered on top, built mainly
across `54fa4af stage1 app completed` and `ab7a372 stage 1 bug fixed`.

Two tracks exist side by side and both are implemented and wired into routes.

## Track 1 — human verifier review

The older, Phase-5/7 system. Fully built out.

- Verifier queue (`backend/src/controllers/verifierController.ts`, ~1850 lines)
  with three catalogs: `unverified` (submitted/under_review/needs_info),
  `verified` (approved), `rejected`. `draft` profiles never appear — a
  candidate who hasn't submitted hasn't asked to be reviewed.
- A per-field checklist is built **server-side** from the same rules that
  decide what's mandatory at submission (`backend/src/utils/mandatoryFields.ts`),
  so the checklist and the submission requirements can never drift apart.
  Different checklist shape per category — fresher gets project links + coding
  platform badges, experienced/executive get years of experience, current
  company, designation, offer letter/LinkedIn, company type.
- Field verdicts (`profile_field_checks`) are append-only; "current" state is
  just the newest row per field key. A verdict can autosave independently of
  the final decision.
- Decisions: `approved` / `rejected` / `needs_info` / `flagged` (flagged
  escalates to admin, doesn't change profile status). Every decision writes a
  `VerificationLog` row and sends a status-change email.
- A merged, newest-first timeline (submission, every decision, every field
  check) assembled in JS from three tables for the profile review page.
- `requireVerified` middleware (`backend/src/middleware/requireVerified.ts`)
  gates most of the app: an unverified candidate can only see their own
  submission and its status, nothing else — this applies uniformly to
  candidates and companies (verifiers/admins pass through).

## Track 2 — automated document verification (OCR + eKYC)

The new "stage1" addition (`backend/src/controllers/verificationController.ts`,
~435 lines). Candidates submit a document link; the system reads it and
matches extracted fields against the candidate's own profile claims.

Three-way outcome, deliberately not binary:

| Status | Meaning |
|---|---|
| `auto_verified` | Document confirms the claim. No human needed. |
| `manual_review` | Document was readable but didn't confirm enough (bad photo, etc.) — falls into the normal verifier queue exactly as before. |
| `failed` | Document unreadable or actively contradicts the claim. |

Key design point: **a machine may only ever promote a claim, never reject
one.** A clean marks-card match auto-promotes the linked `CandidateEducation`
row to `auto_verified`, and the verifier's checklist shows this as a hint
("auto-matched against the marks card — spot-check only") — but the verifier's
own Yes/No still overrides it in both directions. Withdrawing a document also
reverts the education row back to `pending`, so an auto-verified claim can
never be left standing on nothing.

Two document sources feed into the same pipeline:

1. **OCR path (`drive_link` source)** — candidate pastes a link
   (Aadhaar / marks card / degree certificate), backend fetches + OCRs it
   (`tesseract.js` + `pdf-parse`), parses fields, matches against the claim.
   Confidence = reader confidence × match confidence (multiplied, not
   averaged — a confident match on text the OCR wasn't sure of isn't strong
   evidence). This path is **fully active in production** right now.
2. **DigiLocker / eKYC path (`digilocker` source)** — see below.

Routes are live (`backend/src/routes/candidateRoutes.ts`), a migration exists
(`backend/migrations/20240117000001-education-certificates-verification.js`),
and the OCR dependencies are in `backend/package.json`.

## The eKYC path: DigiLocker

DigiLocker is India's government-run document locker — documents arrive
pre-signed by the issuer, so there's nothing to OCR and nothing to guess.

**Status: fully coded, but dormant.** Written the same way Razorpay/SMTP are
elsewhere in this codebase — complete implementation, gated behind a
config check, degrades gracefully with no credentials set.

- `backend/src/utils/digilocker.ts` implements the full OAuth 2.0 + PKCE
  (S256) flow: authorize-URL builder, in-memory state tracking (10-min TTL,
  explicitly noted as single-instance-only — a real limitation if this ever
  runs behind a load balancer), token exchange, and mapping DigiLocker's
  signed identity fields (name/DOB/gender) onto the same
  `ExtractedDocumentFields` shape the OCR path produces, so all downstream
  matching/storage logic is shared between both sources.
- A DigiLocker match gets `confidence: 1` — issuer-signed, nothing to doubt —
  versus OCR's discounted confidence.
- Gated by `isDigilockerConfigured()`, which checks
  `DIGILOCKER_CLIENT_ID` / `DIGILOCKER_CLIENT_SECRET` / `DIGILOCKER_REDIRECT_URI`
  (`backend/src/config/env.ts`). All three default to `''` and nothing in
  `.env.example` sets them.
- **Right now, in this environment**: `digilockerStatus` reports "coming
  soon" to the frontend, and `digilockerStart` / `digilockerCallback` both
  throw a friendly 400 telling the candidate to use the document-link + OCR
  path instead.

**What's blocking activation is not code** — it's getting real credentials: a
partner agreement with NeGD and an approved application on the Meripehchaan
partner portal. That's an external registration/approval process. Once those
three env vars are set, the code path activates with no further engineering
work needed.

## Summary

- Human verifier review — **done**, mature, in production.
- OCR-based document auto-verification — **done**, in production, feeding into
  the verifier checklist as a hint/shortcut, never a silent auto-reject.
- DigiLocker / eKYC — **code complete, inactive**. Blocked on partner
  credentials from NeGD, not on engineering work.
