'use strict';

/**
 * Forgot-password flow: an OTP emailed to the account's address, entered
 * back to prove ownership, then exchanged for a short-lived reset token
 * (see utils/jwt.ts signPasswordResetToken) that authorizes exactly one
 * password change. Rows are append-only per attempt (a new row per
 * forgot-password request, not an upsert) so `attempts`/`consumedAt` on an
 * older row can never be reset by a newer request racing it.
 *
 * The whole flow runs before any session exists (same as login/signup),
 * so every policy here follows the same null-context idiom as
 * users_select_for_auth / verifier_invites_select_for_signup — see
 * 20240101000004-enable-rls-and-policies.js and
 * 20240108000001-verifier-invites.js.
 *
 * Also adds users_update_self_by_password_reset: the one piece of this flow
 * that touches the `users` table itself (authController.resetPassword sets
 * password_hash + bumps token_version). Unlike every other null-context
 * policy here, this one still needs row-scoping — a null role alone can't
 * be trusted to update *any* user row. authController.resetPassword only
 * reaches this after independently verifying the JWT issued by verifyResetOtp
 * (which itself only issues after the emailed OTP checked out), then opens
 * its own transaction (not the shared runInRequestContext helper, which
 * only supports "no context" or "id+role together") and sets JUST
 * app.current_user_id to that verified id, deliberately leaving
 * app.current_user_role unset. That combination — role null, id set to
 * one specific row — is unique to this one call site.
 */

const admin = `current_setting('app.current_user_role', true) = 'admin'`;
const nullContext = `current_setting('app.current_user_role', true) IS NULL`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;

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

    await queryInterface.createTable('password_reset_otps', {
      id: uuidPk,
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      // bcrypt hash of the 6-digit code — never stored/emailed in a way a
      // DB read alone could recover, same treatment as users.password_hash.
      otp_hash: { type: DataTypes.STRING, allowNull: false },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      // Incremented on every failed verify; the controller locks the row
      // out well before a 6-digit space could be brute-forced.
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      consumed_at: { type: DataTypes.DATE, allowNull: true },
      created_at: createdAtNow,
    });

    await query(`ALTER TABLE password_reset_otps ENABLE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE password_reset_otps FORCE ROW LEVEL SECURITY;`);

    await query(`
      CREATE POLICY password_reset_otps_admin_all ON password_reset_otps FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // Every request/verify/consume in this flow runs with no session
    // established yet (the whole point of "forgot" password) — mirrors
    // verifier_invites' split, collapsed into one ALL policy since this
    // table is never owner-scoped by a later authenticated session.
    await query(`
      CREATE POLICY password_reset_otps_public ON password_reset_otps FOR ALL
        USING (${nullContext})
        WITH CHECK (${nullContext});
    `);

    await query(`
      CREATE POLICY users_update_self_by_password_reset ON users FOR UPDATE
        USING (${nullContext} AND id = ${selfId})
        WITH CHECK (${nullContext} AND id = ${selfId});
    `);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`DROP POLICY IF EXISTS users_update_self_by_password_reset ON users;`);
    await query(`DROP POLICY IF EXISTS password_reset_otps_public ON password_reset_otps;`);
    await query(`DROP POLICY IF EXISTS password_reset_otps_admin_all ON password_reset_otps;`);
    await query(`ALTER TABLE password_reset_otps NO FORCE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE password_reset_otps DISABLE ROW LEVEL SECURITY;`);
    await queryInterface.dropTable('password_reset_otps');
  },
};
