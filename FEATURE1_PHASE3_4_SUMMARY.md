# Feature 1, Phase 3 & 4 Summary — Package Purchase + Frontend

Part of `AI_PACKAGES_ATS_BUILD_PLAN.md`, Feature 1, Phases 3 and 4 — built together per your request. Builds on `FEATURE1_PHASE1_SUMMARY.md` and `FEATURE1_PHASE2_SUMMARY.md`. **This completes Feature 1 end-to-end.**

## Phase 3 — Package purchase (backend)

- `payment_type` enum gets a new value, `relevancy_package`, added via `ALTER TYPE ... ADD VALUE` (migration `20240120000001`) — same mechanism already used for `achievement_type`'s `certificate` value. No new payments table; this reuses the existing Razorpay pipeline exactly as the spec asks.
- `POST /companies/jobs/:jobId/batches/:tier/purchase` (`paymentController.purchaseRelevancyPackage`) — resolves the price band by the batch's actual candidate count, blocks self-serve purchase on a contact-sales band, creates an unpurchased `relevancy_packages` row, then a Razorpay order via the same shared `createOrderAndPaymentRow` helper subscribe/unlock-topup/boost already use.
- The webhook (`razorpayWebhook`) now has a `relevancy_package` case: on payment success, it looks up the package by the id carried in `Payment.metadata` and sets `purchasedByCompanyId`/`purchasedAt`.
- `GET /companies/relevancy-packages/:packageId/download` — CSV export of the batch's candidates, **with full contact details included regardless of individual unlock status**. I want to flag this explicitly: the spec describes browsing-via-unlock and buying-the-package as two alternative paths ("browse a batch... using the normal unlock flow, OR buy the entire batch as a downloadable package"), so I read a purchased package as the alternate route to full data, not a second unlock gate stacked on top. If you intended the package download to still respect per-candidate unlock status, that's a one-line change in `relevancyController.downloadPackage`.
- `GET /companies/jobs/:jobId/relevancy-packages` — added while building the frontend (see below), not in the original phase plan. Without it, a company that buys a package and reloads the page has no way to find it again to hit the download endpoint.

### A pre-existing bug this phase surfaced

The Razorpay webhook runs with no session (`runInRequestContext(null, ...)` — there's no logged-in user for Razorpay's server-to-server call). Phase 6's original migration added a null-context RLS policy for exactly that reason, but **only on the `payments` table**. It never added one for `company_profiles` or `candidate_profiles`, which `applyPaymentEffect` also writes to (`remainingUnlocks`, `isBoosted`, plan assignment, etc.). An UPDATE whose RLS-appended WHERE clause matches zero rows doesn't error — it just silently updates nothing.

**This means subscription/pay-per-unlock/boost purchases may have been marking payments `paid` without ever actually crediting the purchase**, since Phase 6. I did not fix this — it's outside this feature's scope and touches Phase 6 code — but I did fix the equivalent gap for my own new `relevancy_packages` table (migration `20240120000001` also adds `relevancy_packages_update_for_webhook`, mirroring `payments_update_for_webhook`), since my Phase 3 would have shipped with the identical silent-failure bug otherwise.

**This needs your decision**: do you want me to patch the `company_profiles`/`candidate_profiles` gap as a quick follow-up migration? It's a two-policy addition, same pattern, but it's real-money-affecting and worth verifying deliberately rather than me just fixing it inline.

## Phase 4 — Frontend

**API layer**: `lib/relevancyApi.ts` (jobs, batches, purchase, packages, price bands, CSV download) plus small additions to `lib/paymentsApi.ts` / `lib/adminApi.ts` for the new payment type.

**Company page** (`pages/company/RelevancyPage.tsx`, route `/company/relevancy`, nav item added): paste a JD → see parse status and extracted requirements (skills/role/experience/domain) → four tier cards with live counts and price (resolved from the admin-configured price bands) → browse a tier (candidate cards with relevancy %, unlock-gated contact info, reusing the existing unlock flow) → buy a tier (reuses the existing `usePaymentCheckout` hook and Razorpay flow verbatim) → download once purchased.

**Invoice history**: `relevancy_package` rows now render with a proper label ("AI relevancy package") in both the company's payment history and the admin transaction ledger/filter.

**Admin**: a new "Relevancy pricing" tab in Master Data (full CRUD on price bands, via the existing `InlineCrudTable` component — no new UI pattern introduced) and a new textarea field for `jd_parsing_prompt_template` in Site Settings.

## Verification done
- Backend: `npx tsc --noEmit` — clean.
- Frontend: `npx tsc -b` — clean, and `npx vite build` — succeeds (the "chunk larger than 500kB" warning is pre-existing/generic, not an error).
- **Not done**: no live end-to-end run (create job → Groq parse → scoring → browse → Razorpay checkout → webhook → download) against a real database/Groq key/Razorpay test keys. I don't have any of those credentials from here — this needs a real run-through on your end before you'd call Feature 1 launch-ready.

## Checklist for you

- [ ] Run `npm run migrate` — two more migrations on top of Phases 1-2.
- [ ] **Decide on the pre-existing webhook RLS gap** (company_profiles/candidate_profiles) — fix now or separately?
- [ ] Confirm the "purchased package = full contact info, not unlock-gated" reading is what you intended.
- [ ] With real Groq/Razorpay credentials in a dev environment, walk through the full flow once: create a job with a description, confirm it parses, confirm candidates get scored and tiered, buy a batch with Razorpay test mode, confirm the webhook lands and the download works.
- [ ] Admin: set real price-band numbers via the new "Relevancy pricing" tab (still seeded with placeholders) and review/edit the seeded JD-parsing prompt template in Site Settings.

## Feature 1 is now complete end-to-end

JD parsing → deterministic scoring → tiered batches → browse-or-buy → download, all four phases built. Next per the build plan is Feature 2 (the ATS), starting with Phase 5 — Careers Page & job extension — but that's a much bigger scope and a natural place to pause for your review of Feature 1 as a whole first.
