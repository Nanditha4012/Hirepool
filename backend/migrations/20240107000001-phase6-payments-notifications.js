'use strict';

/**
 * Phase 6: Payments & Notifications.
 *
 * Follows the exact conventions of 20240106000001-phase5-admin-portal.js
 * (idempotent `DO $$ ... EXCEPTION WHEN duplicate_object` enum creation,
 * uuidPk/createdAtNow literal helpers, admin/roleIs/selfId RLS
 * session-variable helpers, DDL + RLS together in one file). Purely
 * additive — nothing here drops or rewrites existing data.
 *
 * What it adds:
 *
 *  1. payments — one row per Razorpay checkout attempt (subscription
 *     purchase, one-off pay-per-unlock top-up, or candidate profile Boost).
 *     `metadata` (JSONB) holds whatever the webhook needs to apply on
 *     success, shape keyed by `type`:
 *       - subscription:    { planId: string }
 *       - pay_per_unlock:  { unlockQuantity: number }
 *       - boost:           { boostDays: number }
 *     `amount` is in rupees (matches plans_master.price's existing DECIMAL
 *     convention — no paise conversion at the DB layer; paise conversion
 *     only happens at the Razorpay API boundary in paymentController).
 *     `razorpay_order_id` is NOT NULL UNIQUE because a payments row is only
 *     ever created once we already have an order id back from Razorpay
 *     (see paymentController's shared order-creation helper).
 *
 *  2. candidate_profiles.is_boosted / boost_expires_at — new, previously
 *     nonexistent columns (candidate_profiles had zero boost-related
 *     columns before this migration). No RLS changes needed for this
 *     table — candidate_profiles already has full owner/verifier/admin
 *     policies from earlier phases that cover these new columns too.
 *
 *  3. company_profiles — no schema change. This phase is what finally
 *     starts WRITING to unlocksResetAt/messagesPeriodResetAt, which have
 *     existed on company_profiles since Phase 3 but were dead columns
 *     (never set, never read) until the Razorpay webhook handler's
 *     `subscription` case below.
 *
 * RLS on payments:
 *   - payments_owner_select: a company/candidate can read their own payment
 *     history (GET .../payments/history).
 *   - payments_owner_insert: a company/candidate can create their own
 *     payment row when initiating checkout — the order-creation endpoints
 *     run inside runInRequestContext(req.user, ...), i.e. with that user's
 *     own session GUCs set, so INSERT needs an owner-scoped WITH CHECK,
 *     not just an admin one.
 *   - payments_update_for_webhook: the Razorpay webhook handler runs with
 *     NO request context at all (runInRequestContext(null, ...)) — Razorpay
 *     calls the server directly, there's no logged-in user to scope a
 *     session to. Mirrors users_select_for_auth's exact
 *     "current_setting(...) IS NULL" shape from
 *     20240101000004-enable-rls-and-policies.js (see that file for the
 *     original comment on this pattern). Safe specifically because the
 *     webhook handler independently verifies the Razorpay HMAC signature
 *     before ever touching the DB — an unauthenticated DB session is fine
 *     here precisely because the app layer already gated it.
 *   - payments_admin_all: the admin financial ledger (full CRUD).
 *   No other role gets any access.
 */

const admin = `current_setting('app.current_user_role', true) = 'admin'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;

const PAYMENT_TYPE_ENUM = 'payment_type';
const PAYMENT_STATUS_ENUM = 'payment_status';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes, literal } = Sequelize;
    const query = (sql) => queryInterface.sequelize.query(sql);

    const uuidPk = {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: literal('gen_random_uuid()'),
    };
    const createdAtNow = {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: literal('now()'),
    };

    // ---------------------------------------------------------------
    // New enum types
    // ---------------------------------------------------------------
    await query(`
      DO $$ BEGIN
        CREATE TYPE ${PAYMENT_TYPE_ENUM} AS ENUM ('subscription', 'pay_per_unlock', 'boost');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await query(`
      DO $$ BEGIN
        CREATE TYPE ${PAYMENT_STATUS_ENUM} AS ENUM ('created', 'paid', 'failed', 'refunded');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // ---------------------------------------------------------------
    // 1. payments
    // ---------------------------------------------------------------
    await queryInterface.createTable('payments', {
      id: uuidPk,
      type: { type: PAYMENT_TYPE_ENUM, allowNull: false },
      payer_user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
      },
      amount: { type: DataTypes.DECIMAL, allowNull: false },
      currency: { type: DataTypes.STRING, allowNull: false, defaultValue: 'INR' },
      status: { type: PAYMENT_STATUS_ENUM, allowNull: false, defaultValue: 'created' },
      razorpay_order_id: { type: DataTypes.STRING, allowNull: false, unique: true },
      razorpay_payment_id: { type: DataTypes.STRING, allowNull: true },
      razorpay_signature: { type: DataTypes.STRING, allowNull: true },
      // See header comment for the per-`type` shape held here.
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: createdAtNow,
      updated_at: createdAtNow,
    });

    await query(`ALTER TABLE payments ENABLE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE payments FORCE ROW LEVEL SECURITY;`);
    await query(`
      CREATE POLICY payments_owner_select ON payments FOR SELECT
        USING (payer_user_id = ${selfId});
    `);
    await query(`
      CREATE POLICY payments_owner_insert ON payments FOR INSERT
        WITH CHECK (payer_user_id = ${selfId});
    `);
    // See header comment — mirrors users_select_for_auth's null-context
    // shape; safe because the webhook handler verifies the Razorpay
    // signature before ever reaching a query that would use this policy.
    await query(`
      CREATE POLICY payments_update_for_webhook ON payments FOR UPDATE
        USING (current_setting('app.current_user_role', true) IS NULL);
    `);
    await query(`
      CREATE POLICY payments_admin_all ON payments FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // 2. candidate_profiles: Boost columns
    // ---------------------------------------------------------------
    await queryInterface.addColumn('candidate_profiles', 'is_boosted', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('candidate_profiles', 'boost_expires_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });

    // ---------------------------------------------------------------
    // 3. company_profiles — no DDL change. See header comment: this phase
    // starts writing to the existing unlocks_reset_at / messages_period_
    // reset_at columns for the first time.
    // ---------------------------------------------------------------
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await queryInterface.removeColumn('candidate_profiles', 'boost_expires_at');
    await queryInterface.removeColumn('candidate_profiles', 'is_boosted');

    await query(`DROP POLICY IF EXISTS payments_admin_all ON payments;`);
    await query(`DROP POLICY IF EXISTS payments_update_for_webhook ON payments;`);
    await query(`DROP POLICY IF EXISTS payments_owner_insert ON payments;`);
    await query(`DROP POLICY IF EXISTS payments_owner_select ON payments;`);
    await query(`ALTER TABLE payments NO FORCE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE payments DISABLE ROW LEVEL SECURITY;`);
    await queryInterface.dropTable('payments');

    await query(`DROP TYPE IF EXISTS ${PAYMENT_STATUS_ENUM} CASCADE;`);
    await query(`DROP TYPE IF EXISTS ${PAYMENT_TYPE_ENUM} CASCADE;`);
  },
};
