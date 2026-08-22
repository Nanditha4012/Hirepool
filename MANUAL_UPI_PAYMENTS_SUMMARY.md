# Manual UPI Payments — Summary

Not part of `AI_PACKAGES_ATS_BUILD_PLAN.md` — a standalone addition to the existing Razorpay payments system. Adds a second, independent way to pay: a merchant UPI ID the payer sends money to directly from their own UPI app, with an admin manually verifying and approving it, instead of Razorpay's automatic webhook confirmation.

## What was built

- **Migration `20240127000001-manual-upi-payments.js`.** Adds `method` (`razorpay` | `upi_manual`, defaults to `razorpay`), `manual_reference` (unique, the UPI-flow equivalent of `razorpay_order_id`), and `upi_utr` to `payments`. Loosens `razorpay_order_id` to nullable (manual rows never get one; Postgres `UNIQUE` still holds for the Razorpay rows since it allows any number of `NULL`s). Adds a `submitted` payment status (`created` → `submitted` → `paid`/`failed`). Adds one new RLS policy, `payments_owner_update_manual_upi`, so a payer can attach their own UTR to their own `upi_manual` row — `payments` previously had no owner-UPDATE policy at all, only owner SELECT/INSERT.
- **Order creation, no Razorpay call.** `POST /companies/payments/subscribe/upi` and `POST /candidates/payments/boost/upi` — same plan/day lookup and price calculation as their Razorpay siblings, but write a `payments` row directly (`createManualPaymentRow` in `paymentController.ts`) instead of calling Razorpay's Orders API. Both throw `ApiError.serviceUnavailable` if the `upi_id` site setting isn't configured yet.
- **UTR submission.** `PATCH /payments/upi/:paymentId/submit` — payer attaches their UPI transaction reference once they've actually paid. Role-agnostic route (company or candidate can own a manual row), ownership enforced both in the controller query and by the new RLS policy.
- **Admin approve/reject.** `POST /admin/payments/:id/approve` and `.../reject` in `adminController.ts` — approving reuses the exact same `applyPaymentEffect`/`buildReceiptMessage`/`buildPaymentDescription` helpers the Razorpay webhook uses (exported from `paymentController.ts` for this purpose), so a manually-approved plan/boost purchase behaves identically to a Razorpay-confirmed one, down to the receipt email and in-app notification. Rejecting sends the same "payment failed" notification/email the webhook sends on a failed Razorpay payment.
- **Frontend: `UpiManualPayment.tsx`.** Shared component (idle → shows UPI ID + copy button + `upi://pay` deep link + UTR box → submitted). Wired into `PlanSubscribeCard` (company) and `BoostPurchaseCard` (candidate) — the two flows explicitly asked for. Not wired into unlock top-up or the AI relevancy package purchase; those still exist only via Razorpay.
- **Admin UI.** Site Settings gained two fields — `UPI ID` and `Razorpay enabled` (type `true`/`false`, blank = enabled). Transaction ledger gained a Method column, a Reference/UTR column, a Method filter, and Approve/Reject buttons on rows that are `upi_manual` + `submitted`.

## The Razorpay on/off switch

Per your ask ("switching is enough") — `razorpay_enabled` is a site setting, not a code flag. When it's `false`, `PlanSubscribeCard`/`BoostPurchaseCard` simply don't render the Razorpay button; the UPI option (if `upi_id` is set) still shows. Flip it back to blank/`true` and Razorpay reappears — no redeploy, no code change. Nothing about the Razorpay integration itself (Checkout flow, webhook, `razorpay.ts`, `usePaymentCheckout.ts`, the four original checkout endpoints) was touched or overridden by any of this.

## Verification done

- `npx tsc --noEmit` — clean on both `backend/` and `frontend/`.
- Migration applied to the real database (confirmed via `sequelize-cli db:migrate:status` — all migrations, including this one, show `up`).
- Confirmed live: you set `upi_id` and `boost_price_per_day` (₹10, for testing) yourself via the admin Site Settings page.
- Not yet done: an actual end-to-end pay → submit UTR → admin approve round-trip. No payment access from here — this needs you to actually send ₹10 from a UPI app.

## Checklist for you

- [ ] Do one real test run: company or candidate dashboard → "Pay via UPI instead" → pay the small test amount → submit the UTR → log in as admin → Transaction ledger → Approve → confirm the plan/boost actually applied.
- [ ] Decide if you want `razorpay_enabled` set to `false` for now, or leave both options visible.
- [ ] If you later want UPI on unlock top-up or the relevancy package purchase too, say so — the backend helper (`createManualPaymentRow`) is generic, it's just not wired into those two UI cards yet.
