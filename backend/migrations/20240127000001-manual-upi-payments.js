'use strict';

/**
 * Manual UPI-ID payment path — an alternative to Razorpay Checkout, not a
 * replacement for it. Nothing about the existing `razorpay` method (Checkout
 * flow, webhook, subscribe/unlock-topup/boost/relevancy-package endpoints)
 * changes here; this only adds a second `method` a payments row can have,
 * plus a `razorpay_enabled` site_settings flag (added via the admin Site
 * Settings UI, not schema — site_settings is a free-form key/value table)
 * so Razorpay can be hidden from checkout UIs and switched back on later
 * without touching any code.
 *
 * The flow: the company/candidate sees a merchant UPI ID (stored as the
 * `upi_id` site_settings key, admin-editable, publicly readable via
 * GET /masters/site-settings — a UPI ID is meant to be shown to whoever is
 * paying it, same as a bank account number) and pays it directly from their
 * own UPI app. There is no automatic callback for this path (unlike
 * Razorpay's webhook), so the payer submits the UPI transaction reference
 * (UTR) they got back, and an admin manually approves or rejects it from the
 * financial ledger. Approval reuses the exact same applyPaymentEffect(...)
 * that the Razorpay webhook uses (see paymentController.ts) — same effect,
 * different trigger.
 *
 * `razorpay_order_id` was NOT NULL UNIQUE because every payments row used to
 * be created only once an order id came back from Razorpay. Manual UPI rows
 * have no Razorpay order at all, so this loosens that column to nullable —
 * Postgres UNIQUE permits any number of NULLs, so existing Razorpay rows'
 * uniqueness guarantee is unaffected. `manual_reference` is the equivalent
 * locally-generated identifier for a manual row.
 *
 * `submitted` is a new payment_status value: `created` (row exists, payer
 * hasn't submitted a UTR yet) -> `submitted` (UTR submitted, awaiting admin
 * review) -> `paid` (admin approved) / `failed` (admin rejected). `ADD
 * VALUE` cannot run inside a transaction block on older Postgres; same
 * accepted pattern as 20240120000001-relevancy-package-payment-type.js.
 */

const PAYMENT_METHOD_ENUM = 'payment_method';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes } = Sequelize;
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`
      DO $$ BEGIN
        CREATE TYPE ${PAYMENT_METHOD_ENUM} AS ENUM ('razorpay', 'upi_manual');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await query(`ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'submitted';`);

    await queryInterface.addColumn('payments', 'method', {
      type: PAYMENT_METHOD_ENUM,
      allowNull: false,
      defaultValue: 'razorpay',
    });
    await queryInterface.changeColumn('payments', 'razorpay_order_id', {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    });
    await queryInterface.addColumn('payments', 'manual_reference', {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    });
    await queryInterface.addColumn('payments', 'upi_utr', {
      type: DataTypes.STRING,
      allowNull: true,
    });

    // Lets a payer attach the UTR to their own manual-method row themselves
    // (submit endpoint runs in their own request context, not an admin
    // one) — payments previously had no owner UPDATE policy at all, only
    // owner SELECT/INSERT. Scoped to method = 'upi_manual' so it can never
    // touch a Razorpay row, which must only ever be updated by the webhook
    // or an admin.
    await query(`
      CREATE POLICY payments_owner_update_manual_upi ON payments FOR UPDATE
        USING (
          payer_user_id = current_setting('app.current_user_id', true)::uuid
          AND method = 'upi_manual'
        )
        WITH CHECK (
          payer_user_id = current_setting('app.current_user_id', true)::uuid
          AND method = 'upi_manual'
        );
    `);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`DROP POLICY IF EXISTS payments_owner_update_manual_upi ON payments;`);

    await queryInterface.removeColumn('payments', 'upi_utr');
    await queryInterface.removeColumn('payments', 'manual_reference');
    await queryInterface.changeColumn('payments', 'razorpay_order_id', {
      type: queryInterface.sequelize.Sequelize.DataTypes.STRING,
      allowNull: false,
      unique: true,
    });
    await queryInterface.removeColumn('payments', 'method');

    // Postgres has no DROP VALUE for enums — 'submitted' on payment_status
    // is an accepted no-op on down, same as the relevancy_package migration
    // this mirrors.
    await query(`DROP TYPE IF EXISTS ${PAYMENT_METHOD_ENUM};`);
  },
};
