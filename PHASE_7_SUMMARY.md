# Hirepool — Phase 7 Complete: PWA, Responsive Polish & Security Hardening

Status: **Code complete, both halves build clean.** This was the final phase in the original build spec. Not yet run against the live Supabase DB (two new migrations, unapplied — see checklist).

## What was found already done (not rebuilt)

A pre-work survey confirmed two of the four Phase 7 areas were already solid from earlier phases:
- **PWA**: `vite-plugin-pwa` is fully configured — manifest with the right theme color (`#0A66C2`) and app name sourced from `VITE_APP_NAME`, all required icons present, service worker registration confirmed present in a real prior build output. Nothing needed here beyond verification.
- **Responsive design**: already a consistent habit across every portal (mobile-first grids, `md:hidden`/`md:block` toggles, a dedicated mobile bottom-nav for candidates, safe-area handling). Phase 7's responsive work was a real spot-check-and-fix pass, not a rebuild — see below for what was actually found and fixed.

## What was built

### Database (`backend/migrations/20240111000001-verification-logs-select-policies.js`, `20240112000001-verification-logs-system-flag.js`)
- **Two real, previously-undetected RLS gaps closed.** `verification_logs` has existed since Phase 1 with only an admin policy and a verifier-insert-own-decisions policy — **no policy ever let a verifier read the table back**, and **no policy ever let a candidate read their own decision history**, meaning `candidateController`'s `latestVerificationNote` and profile timeline have been silently returning nothing via this path since Phase 2. Added both missing SELECT policies (candidate's is scoped via a subquery into their own `candidate_profiles` row, since `target_id` is polymorphic).
- `verification_logs.reviewer_id` is now nullable, specifically to support a new system-generated flag (see below) that has no human reviewer.

### Backend (`backend/src/`)
- **Duplicate resume-link detection** (`candidateController.ts`): on profile submission, checks whether the resume link matches another (non-draft) candidate's — if so, writes a `VerificationLog` with `decision: 'flagged'` (reusing the verifier portal's existing "Flag as Suspicious" convention exactly, so it surfaces in the same places without any new UI). Never blocks the submission — this is a fraud *signal* for a human to check, not an automatic rejection, since legitimate collisions (shared portfolio links, copy-paste mistakes) can happen. Runs after the main transaction commits, wrapped in try/catch, so a failure here can never turn a successful submission into an error.
- **Google reCAPTCHA v2** on signup (`utils/recaptcha.ts`, wired into `authController.signup`): follows the exact same "optional, graceful-when-unconfigured" pattern as Razorpay/Resend — `isRecaptchaConfigured()` gates the whole check, so with no `RECAPTCHA_SECRET_KEY` set (this environment's actual state), signup behaves identically to before. Applies uniformly across candidate/company/verifier signup since they share one endpoint.
- **Rate limiting extended to search**: `GET /companies/search` now has its own limiter (120 requests/15min — high enough not to bother normal browsing, low enough to stop a scripted scrape of the candidate pool). Signup/login were already covered from an earlier phase.

### Frontend (`frontend/src/`)
- **Legal pages**: real `PrivacyPolicyPage.tsx` and `TermsOfServicePage.tsx` (explaining contact info is shared with paying companies after unlock, per the spec), routed and linked from the footer (previously `href="#"` placeholders).
- **Consent checkbox** at candidate signup, blocking submission until checked — same "explain why, don't just silently disable" pattern used elsewhere in this app.
- **reCAPTCHA widget** (`RecaptchaWidget.tsx`, `lib/recaptcha.ts`) — lazy-loaded exactly like the existing Google Sign-In button pattern, renders nothing at all when unconfigured.
- **5 real responsive bugs found and fixed** (not cosmetic tweaks — see the detailed sweep report for what was checked and found already fine, which was the large majority of the app):
  1. The candidate mobile bottom-nav's scroll-clearance spacer was in the wrong position — it padded the *top* of every candidate page instead of the *bottom*, so page content (including the footer) rendered underneath the fixed nav bar. Fixed by moving the nav to render after the footer.
  2. reCAPTCHA's fixed-width iframe (~304px) didn't fit inside the signup form column on phones narrower than ~300px — added horizontal scroll as a safety net rather than letting it clip or force page-wide scroll.
  3. A verifier queue filter row could overflow on narrow phones (missing `flex-wrap`, unlike every comparable tab row elsewhere in the app).
  4. A Contests hub stat grid used a bare 3-column grid with no mobile override — the only such instance found in the entire codebase (everywhere else already had a `sm:` breakpoint).
  5. The Contests leaderboard's sticky "your position" row would render underneath the candidate bottom-nav — same root-cause pattern as fix #1, different page.

### Ops / hygiene
- 🚩 **`backend/.env.example` and `frontend/.env.example` had real, live-looking secrets committed** (Supabase DB password, JWT signing secrets, Google OAuth client ID/secret) — not placeholders. Replaced with clear placeholder values. Confirmed the actual `.env` files were correctly gitignored and never committed, so this was contained to the example files — but **if this repo has ever been pushed anywhere (even a private GitHub repo), those old values are still sitting in git history and should be treated as compromised.** Rotating them is a manual action only you can take: regenerate the JWT secrets, rotate the Google OAuth client secret in Google Cloud Console, and change the Supabase database password. I sanitized the file going forward; I did not (and can't) retroactively scrub git history or rotate credentials on your accounts.
- `frontend/vercel.json` added (SPA rewrite fallback to `index.html`, needed for React Router's client-side routes to survive a direct navigation/refresh on Vercel) — the backend already had its Vercel config from the deploy work earlier; the frontend didn't yet.

## Explicit scope decisions

- **Verifier 2FA stays admin-only**, per your explicit call on the fork I raised — the spec's original "TOTP for verifier and admin" line is deliberately not being restored. This was a prior session's reasoned decision (verifiers are lower-privilege internal accounts with no financial/config access) and you confirmed keeping it as-is rather than re-adding the enrollment/challenge flow to verifier login.
- **Contact-field exclusion (company sees approved profiles minus contact info) is enforced at the application layer, not the database layer** — `candidate_profiles_company_select`'s RLS policy is row-level only (status = approved); the actual stripping of phone/email/WhatsApp link happens in the controller's response serialization, by design (documented in the migration itself). This is a reasonable, common pattern, but it means a future controller change that forgets to strip those fields wouldn't be caught by RLS — worth keeping in mind for any future work touching `companyController.searchCandidates` or the profile-card response builders.
- **Duplicate detection covers resume links, not a broader fraud model.** The spec's exact phrase was "same email/resume link across accounts" — same-email is already fully handled (case-insensitive unique constraint, from earlier ad-hoc work). Resume-link matching is a simple exact-trimmed-string comparison, not fuzzy/normalized matching (e.g. `docs.google.com/.../edit` vs `.../edit?usp=sharing` wouldn't currently match) — flagged as a possible future refinement, not built now.

## Verification checklist

- [x] Backend (`npx tsc --noEmit`) and frontend (`npx tsc -b`) both compile with zero errors
- [x] No RLS policy name collisions with any earlier migration
- [ ] `npm run migrate` applies both new migrations cleanly against the live Supabase DB
- [ ] A verifier can now see the decision timeline/history for a profile (previously silently empty)
- [ ] A rejected/needs-info candidate's "what to fix" note actually appears (previously silently empty via this path — check whether it was already visible via a different path, e.g. the notification created alongside the same decision, before assuming this was user-visible before)
- [ ] Submit two different candidate profiles with the same resume link → second one shows up as `flagged` in the verifier's queue / admin's `flaggedVerifications` count, and both profiles still submit successfully (not blocked)
- [ ] Without `RECAPTCHA_SECRET_KEY`/`VITE_RECAPTCHA_SITE_KEY` set: signup works exactly as before, no widget, no token required
- [ ] With real reCAPTCHA test keys set: widget renders, submission is blocked with a clear message until completed, backend rejects a missing/invalid token
- [ ] Hit `/company/search` more than 120 times in 15 minutes as a company → get a clear rate-limit message, not a silent hang
- [ ] Privacy Policy and Terms of Service pages load and read correctly; footer links point to them instead of `#`
- [ ] Candidate signup blocks submission until the consent checkbox is checked
- [ ] On a real phone (or devtools mobile emulation): candidate pages no longer show content clipped under the bottom nav; the Contests hub and leaderboard render correctly at narrow widths
- [ ] Frontend deploys cleanly on Vercel with the new `vercel.json` (direct navigation to a deep route like `/candidate/edit` no longer 404s)
- [ ] **Rotate the real secrets that were previously committed in `.env.example`** — JWT secrets, Google OAuth client secret, Supabase DB password — this is on you, not something I can verify from here

## Not yet done / consciously deferred
- Verifier TOTP (deferred per your explicit decision, not forgotten)
- Fuzzy/normalized resume-link matching (exact-string only for now)
- Retroactive git-history secret scrubbing (can't be done by editing the current file state — would need `git filter-repo`/BFG or, more simply, rotating the credentials so the old leaked values stop mattering)

---
This closes out all 7 phases of the original build spec. Let me know how the checklist goes, and whether you want me to circle back on the verifier-2FA decision, the fuzzy resume-link matching, or anything the checklist surfaces.
