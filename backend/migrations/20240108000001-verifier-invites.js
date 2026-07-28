'use strict';

/**
 * Verifier email whitelist / invite flow.
 *
 * Before this, the only way to get a verifier account was admin-provisioned:
 * POST /admin/verifiers, where the admin picks a username AND a password on
 * the verifier's behalf (see adminController.createVerifier /
 * seeders/20240105000001-seed-verifier-account.js). That's fine for
 * dev/seed data, but means an admin has to know a real verifier's password,
 * which is backwards for anyone actually onboarding staff.
 *
 * This adds the alternative: an admin whitelists an email address, and the
 * invited person self-signs-up through the normal /auth/signup endpoint
 * (extended in authController.ts to accept role:'verifier', but only when
 * the submitted email has a live, unconsumed row here) choosing their own
 * password, then logs in with that email like a candidate/company would —
 * no admin-issued username/password, no profile row (verifiers don't have
 * one), no TOTP (verifiers don't require 2FA, only admins do, per Phase 5).
 *
 * Purely additive, same conventions as every migration since Phase 5
 * (admin/roleIs/selfId helpers, uuidPk/createdAtNow literals, FORCE RLS).
 */

const admin = `current_setting('app.current_user_role', true) = 'admin'`;

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

    await queryInterface.createTable('verifier_invites', {
      id: uuidPk,
      // Always stored lowercased (see adminController.createVerifierInvite)
      // so the case-insensitive match at signup time is a plain equality
      // check, not a citext/ILIKE column.
      email: { type: DataTypes.STRING, allowNull: false, unique: true },
      invited_by: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      created_at: createdAtNow,
      // Both null until the invited person actually signs up. Once set,
      // the invite is spent — it authorized exactly one account, and
      // authController.signup enforces that atomically inside the same
      // transaction as the User.create (see its `consumedAt IS NULL`
      // re-check), so two concurrent signups against the same invite can't
      // both succeed.
      consumed_at: { type: DataTypes.DATE, allowNull: true },
      consumed_by_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
    });

    await query(`ALTER TABLE verifier_invites ENABLE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE verifier_invites FORCE ROW LEVEL SECURITY;`);

    // Admin manages the whitelist (create/list/revoke).
    await query(`
      CREATE POLICY verifier_invites_admin_all ON verifier_invites FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // authController.signup runs with a null request context (same reason
    // login()'s email lookup does — resolving who's signing up IS the
    // point of the query, there's no session yet). Mirrors
    // users_select_for_auth / users_insert_registration's null-context
    // condition from 20240101000004 exactly: only ever true for
    // unauthenticated pre-session queries, since any session that has set
    // app.current_user_role falls through to the admin policy above.
    await query(`
      CREATE POLICY verifier_invites_select_for_signup ON verifier_invites FOR SELECT
        USING (current_setting('app.current_user_role', true) IS NULL);
    `);
    await query(`
      CREATE POLICY verifier_invites_update_for_signup ON verifier_invites FOR UPDATE
        USING (current_setting('app.current_user_role', true) IS NULL)
        WITH CHECK (current_setting('app.current_user_role', true) IS NULL);
    `);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`DROP POLICY IF EXISTS verifier_invites_update_for_signup ON verifier_invites;`);
    await query(`DROP POLICY IF EXISTS verifier_invites_select_for_signup ON verifier_invites;`);
    await query(`DROP POLICY IF EXISTS verifier_invites_admin_all ON verifier_invites;`);
    await query(`ALTER TABLE verifier_invites NO FORCE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE verifier_invites DISABLE ROW LEVEL SECURITY;`);
    await queryInterface.dropTable('verifier_invites');
  },
};
