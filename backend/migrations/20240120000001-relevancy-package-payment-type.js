'use strict';

/**
 * AI Relevancy Packages (Feature 1) — Phase 3: package purchase reuses the
 * existing payments/Razorpay pipeline (per spec — "no new payment provider
 * needed"), so this is a one-line addition to the existing `payment_type`
 * enum rather than a new payments table. relevancy_packages itself already
 * exists from Phase 1 (20240118000001).
 *
 * `ADD VALUE` cannot run inside a transaction block on older Postgres;
 * sequelize-cli does not wrap migrations in one by default, and Supabase is
 * on 15 where it is permitted regardless — same situation and same fix as
 * 20240117000001-education-certificates-verification.js's addition of
 * achievement_type 'certificate'. IF NOT EXISTS keeps a re-run from erroring.
 *
 * ── A pre-existing gap this migration also has to close ──────────────────
 * paymentController's Razorpay webhook runs with NO request context
 * (runInRequestContext(null, ...) — Razorpay calls the server directly,
 * there's no session to scope). 20240107000001-phase6-payments-notifications
 * added a null-context UPDATE policy for exactly that reason, but only on
 * `payments` itself — `payments_update_for_webhook`. It did NOT add one for
 * company_profiles or candidate_profiles, which the same webhook's
 * applyPaymentEffect() also writes to (remainingUnlocks, isBoosted, planId,
 * etc.). Those writes appear to have been silently no-op-ing under RLS since
 * Phase 6 — an UPDATE whose WHERE clause (RLS-appended) matches zero rows
 * doesn't error, it just updates nothing. That is a pre-existing bug outside
 * this feature's scope and is NOT fixed here; it's called out in
 * FEATURE1_PHASE3_4_SUMMARY.md for a decision on whether to patch it
 * separately.
 *
 * What IS in scope here: relevancy_packages has the exact same shape of
 * problem, and applyPaymentEffect's new 'relevancy_package' case (Phase 3)
 * would be silently broken from day one without this policy — so this
 * migration adds the missing null-context UPDATE policy for
 * relevancy_packages specifically, mirroring payments_update_for_webhook.
 */

const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;

module.exports = {
  up: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`ALTER TYPE payment_type ADD VALUE IF NOT EXISTS 'relevancy_package';`);

    await query(`
      CREATE POLICY relevancy_packages_update_for_webhook ON relevancy_packages FOR UPDATE
        USING (current_setting('app.current_user_role', true) IS NULL);
    `);
  },

  down: async (queryInterface) => {
    // Postgres has no DROP VALUE for enums — same accepted no-op for the
    // enum half as the 'certificate' migration this mirrors. The RLS policy
    // half is reversible and is reverted.
    await queryInterface.sequelize.query(
      `DROP POLICY IF EXISTS relevancy_packages_update_for_webhook ON relevancy_packages;`,
    );
  },
};
