# Hirepool — Phase 6 Complete: Payments & Notifications

Status: **Code complete, both halves build clean.** Not yet run against the live Supabase DB, and payments/email are unconfigured by default (no Razorpay/Resend keys in this environment) — see checklist. Awaiting your approval before starting Phase 7 (PWA, Responsive Polish & Security Hardening).

## What was built

### Database (`backend/migrations/20240107000001-phase6-payments-notifications.js`, `backend/seeders/20240107000001-seed-payment-settings.js`)
- New `payments` table — `type` (`subscription`/`pay_per_unlock`/`boost`), `status` (`created`/`paid`/`failed`/`refunded`), `payerUserId`, `amount`, `razorpayOrderId`/`PaymentId`/`Signature`, and a `metadata` JSONB column holding whatever the webhook needs to apply the purchase on success (plan id, unlock quantity, or boost days). RLS: owner can read/create their own rows, admin has full access, and a narrow public-context UPDATE policy exists specifically for the webhook (which runs with no logged-in session — safe because the handler independently verifies Razorpay's HMAC signature before touching the DB).
- `candidate_profiles`: `is_boosted`, `boost_expires_at`.
- Seeded one more `site_settings` row: `price_per_unlock` = `'20'` (alongside Phase 5's `boost_price_per_day`).

### Backend (`backend/src/`)
- `paymentController.ts` — order creation for all three purchase flows (subscribe/unlock-topup/boost), a Razorpay webhook handler (`payment.captured`/`payment.failed`, signature-verified, idempotent against retries), and payment-history endpoints for both candidates and companies.
- `utils/razorpay.ts` — thin SDK wrapper, gracefully absent when `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` aren't set (checkout endpoints return a clear "payments not configured" error instead of crashing).
- **Notification infrastructure that didn't exist before this phase**: `notificationController.ts` + `/api/me/notifications*` routes — list, unread-count, mark-one-read, mark-all-read. Every earlier phase only ever *wrote* notifications; nothing could read them back until now.
- Three new notification triggers wired into existing code: new-message alerts (both directions — candidate↔company, neither side fired one before), low-unlock-quota alerts (fires once when a company's remaining unlocks cross down to 2), and renewal reminders (checked as a side effect of a company loading their own dashboard, deduped to at most one per 24h — see scope decisions on why this isn't a real scheduled job).
- `utils/email.ts` + `utils/emailTemplates.ts` — Resend integration, same graceful-when-unconfigured pattern as Razorpay. Wired to four points: signup confirmation, profile status changes, payment receipts/failures, renewal reminders.
- Public `GET /masters/plans` — added so companies can actually see what plans exist (see gap #2 below).
- Admin: `GET /admin/payments` (the financial transaction ledger) and real revenue numbers in `GET /admin/analytics/overview` (see gap #3 below).

### Frontend (`frontend/src/`)
- `lib/razorpay.ts` — lazy-loads Razorpay's Checkout.js the same way `googleIdentity.ts` lazy-loads Google's script.
- `lib/paymentsApi.ts`, `lib/notificationsApi.ts`, `lib/usePaymentCheckout.ts` (shared checkout-then-poll-for-confirmation hook, since the webhook confirms payment asynchronously, not in the browser callback).
- `components/layout/NotificationBell.tsx` — wired into `Header.tsx` for every signed-in role, unread badge, dropdown, mark-read.
- `components/candidate/BoostPurchaseCard.tsx`, `components/company/UnlockTopUpCard.tsx`, `components/company/PlanSubscribeCard.tsx` — real purchase flows replacing the disabled Boost placeholder button from Phase 2.
- Payment history pages for both candidate and company, plus `pages/admin/AdminPaymentsPage.tsx` (the admin-facing ledger).

## Three real gaps caught and fixed during review

1. **`isBoosted`/`boostExpiresAt` existed on the model and DB but were never returned by the candidate profile API** — the frontend agent building the Boost purchase UI flagged this correctly rather than silently working around it. Fixed in `candidateController.ts`, and made the returned value *effective* rather than a raw column read: since there's no cron job clearing `isBoosted` once `boostExpiresAt` passes, the response now computes `isBoosted && (!boostExpiresAt || boostExpiresAt > now)` so a lapsed boost doesn't show as active forever.
2. **No company-facing plan catalog existed** — only the admin-only `/admin/masters/plans` did, so the subscribe flow could only "renew the plan you're already on," not actually browse or switch plans. Added public `GET /masters/plans` (RLS for public SELECT already existed from Phase 3, just no endpoint) and rewired `PlanSubscribeCard.tsx` to a real picker with Renew/Switch actions.
3. **The admin financial ledger was never built** — the spec explicitly says payments should be "surfaced in both the Admin financial ledger and the paying user's own invoice history," but the initial build only did the user-facing half. `GET /admin/analytics/overview`'s `revenue` field was still Phase 5's `{note: "Payments not yet integrated"}` placeholder even after the payments table existed. Added `GET /admin/payments` (full ledger, filterable by type/status) + `AdminPaymentsPage.tsx`, and replaced the placeholder with real lifetime revenue, a per-type breakdown, and paid/failed counts.

## Explicit scope decisions

- **No true Razorpay recurring billing.** "Subscription" payments are one-time hosted-checkout charges that manually extend the company's period by 30 days (resets `remainingUnlocks` to the new plan's allotment, sets `unlocksResetAt`/`messagesPeriodResetAt` to now+30d — these two columns existed since Phase 3 but nothing ever wrote to them until this phase). There's no auto-recharge without the company initiating another payment. Razorpay's real Subscriptions API (mandates, tokens, recurring webhooks) is meaningfully more complex and felt like too large a lift for this phase's zero-cost MVP scope — this gets the functional behavior ("pay monthly to keep your plan") without it.
- **No cron/scheduler infrastructure exists anywhere in this codebase.** Renewal reminders are a read-triggered side effect (checked when a company loads their dashboard), not a real time-based push — a reasonable MVP substitute, but it means a company that never opens their dashboard near renewal time won't get reminded. Low-unlock-quota alerts are a coarse threshold-crossing check, not a proper per-period dedup.
- **MRR/churn are still not real numbers.** The new revenue analytics show real lifetime totals and a type breakdown, but computing actual monthly-recurring-revenue or churn needs subscription-period history (when did each company's period start/end, did they renew), which this schema doesn't track yet. Don't read the dashboard's revenue figure as MRR.
- **Boost's visual treatment is still not wired.** Phase 3 deferred "Boosted/Featured first (amber border in grid)" in company search results because no boost data existed yet. It still doesn't exist now, even though the data does — candidates can buy a boost, but it has no visible effect on search results yet. Flagging this explicitly so it doesn't get lost; it's a frontend-only follow-up (`companyController.searchCandidates`'s sort + `ProfileCard.tsx`'s styling).
- **Email confirmation is informational, not a verification gate.** Phase 1/2 mentioned candidate email being "verified via signup confirmation link" — this phase sends a welcome email on signup, but does not build a click-to-verify token flow or block unverified accounts from anything. That's a distinct auth-flow feature, not "email notifications" plumbing, and was treated as out of scope here.
- **`Payment.amount` has the same latent type issue as `PlanMaster.price`**: Postgres DECIMAL comes back as a string from `pg`/Sequelize with no custom type parser configured. Worked around defensively (`Number(...)` at every arithmetic use site) rather than fixing the underlying config, consistent with the pre-existing pattern.
- **`.env.example` already had real-looking committed secrets before this phase** (flagged separately, not fixed here) — only added obviously-fake placeholder lines for the five new keys (`RAZORPAY_KEY_ID`/`KEY_SECRET`/`WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`) so as not to make the existing problem worse.

## Verification checklist

- [x] Backend (`npx tsc --noEmit`) and frontend (`npx tsc -b && vite build`) both compile/build with zero errors
- [x] No RLS policy name collisions with any earlier migration
- [ ] `npm run migrate` applies `20240107000001-phase6-payments-notifications.js` cleanly against the live Supabase DB
- [ ] `npx sequelize-cli db:seed --seed 20240107000001-seed-payment-settings.js` seeds `price_per_unlock`
- [ ] **Without** Razorpay keys set: subscribe/unlock-topup/boost all return a clear "payments not configured" error, not a crash
- [ ] Set real Razorpay **test-mode** keys (`RAZORPAY_KEY_ID`/`KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET`) and point a Razorpay test webhook at `/api/payments/razorpay/webhook` (needs a public URL for local dev — ngrok or similar)
- [ ] Company: buy unlock top-up with a Razorpay test card → after the webhook fires, `remainingUnlocks` increments and the payment shows `paid` in history
- [ ] Company: subscribe/switch/renew a plan → `planId`, `remainingUnlocks`, `unlocksResetAt`, `messagesSentThisPeriod`, `messagesPeriodResetAt` all update correctly
- [ ] Candidate: buy a boost → `isBoosted` true, `boostExpiresAt` set correctly; buying more days while already boosted extends rather than resets the expiry
- [ ] Trigger a failed test payment → shows `failed` in history, a failure notification appears
- [ ] Retry the same webhook event (simulate a Razorpay retry) → confirms idempotency, doesn't double-apply the effect
- [ ] Notification bell: unread badge appears, dropdown lists notifications, mark-one/mark-all-read works
- [ ] New-message notification fires in both directions
- [ ] Low-unlock-quota notification fires once when crossing down to 2 remaining, not on every subsequent unlock
- [ ] Renewal reminder appears on company dashboard load when `unlocksResetAt` is within 3 days, at most once per 24h
- [ ] **Without** `RESEND_API_KEY` set: everything above still works exactly the same, console shows `[email] skipped` logs, nothing crashes
- [ ] **With** a real `RESEND_API_KEY`: signup confirmation, profile status change, payment receipt/failure, and renewal reminder emails actually arrive
- [ ] Admin → Payments shows the real transaction ledger with working type/status filters
- [ ] Admin → Dashboard's Revenue card shows real totals (not the old placeholder note)

## Not yet done (by design — flagged, not silently skipped)
- True recurring/auto-billing via Razorpay Subscriptions (manual re-subscribe only, see scope decisions)
- MRR/churn dashboards (needs subscription-period history)
- Boost's visual treatment in company search (amber border, boosted-first sort)
- Real cron-based renewal reminders and quota resets (currently read-triggered/webhook-triggered only)
- Email verification-link gating (Phase 1/2 mentioned this; this phase only added an informational confirmation email)
- Full PWA/security hardening pass — CAPTCHA, duplicate-account detection, responsive QA sweep (Phase 7)

---
**Waiting on your go-ahead to start Phase 7 (PWA, Responsive Polish & Security Hardening).**
