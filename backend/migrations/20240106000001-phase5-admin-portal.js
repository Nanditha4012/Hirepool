'use strict';

/**
 * Phase 5: Admin Portal.
 *
 * Purely additive, following the same conventions as
 * 20240105000001-phase5-verifier-workflow.js (idempotent enum creation via a
 * DO $$ ... EXCEPTION block, uuidPk/createdAtNow literals, admin/roleIs/selfId
 * RLS session-variable helpers, DDL + RLS in one file). Nothing here drops or
 * rewrites existing data.
 *
 * What it adds:
 *
 *  1. users.token_version — embedded in every JWT issued from now on. Bumping
 *     this integer server-side (POST /admin/users/:id/suspend|ban, or any
 *     future "force logout" action) invalidates every refresh token already
 *     handed out for that user, because authController.refresh compares the
 *     token's embedded value against the current DB value before reissuing.
 *     Deliberately NOT checked on every access-token-protected request
 *     (requireAuth stays a pure JWT-signature check, no DB round trip) — only
 *     on refresh. That keeps the common-case request path stateless/fast, at
 *     the cost of a forced-logout not taking effect until the user's current
 *     15-minute access token expires and they try to refresh. Acceptable
 *     tradeoff for this MVP; a stricter "kill this session right now" control
 *     would need a DB check in requireAuth itself (or a short-lived
 *     access-token blocklist), which is out of scope here.
 *
 *  2. users.account_status / status_reason / status_changed_at /
 *     status_changed_by — the suspend/ban/reactivate moderation state. A new
 *     enum type (users_account_status) rather than a free-text column, same
 *     "closed set -> Postgres enum" convention used for every other status
 *     column in this schema (see 20240101000002-create-enum-types.js).
 *
 *  3. users_delete_admin — the one users RLS policy that was genuinely never
 *     added: every earlier phase covers SELECT/UPDATE/INSERT for admins, but
 *     nothing yet allows a DELETE (POST /admin/users/:id hard-delete). Every
 *     other policy name already declared on `users` across
 *     20240101000004/20240105000001 is left untouched.
 *
 *  4. company_requests.reviewed_by / reviewed_at / rejection_reason — audit
 *     trail for admin approve/reject decisions on a candidate's "my company
 *     isn't listed" request. No new RLS: company_requests already has a
 *     FOR ALL admin policy from Phase 2 (company_requests_admin, see
 *     20240102000002-phase2-rls-policies.js) that already covers these new
 *     columns.
 *
 *  5. announcements — admin-authored broadcast messages, audience-targeted
 *     (all / candidate / company / verifier), fanned out to Notification rows
 *     at creation time by the controller. Any authenticated user of any role
 *     can read the list (for an in-app banner); only admins can write.
 *
 *  6. site_settings — small admin-editable key/value store (app name, landing
 *     hero copy, FAQ, Boost price placeholder). Primary key is the `key`
 *     string itself, not a generated `id` — same non-uuid-PK shape as
 *     user_totp_secrets (see migrations/20240101000004, models/TotpSecret.ts).
 *     Readable by anyone, including fully unauthenticated requests (the
 *     public landing page needs this before a session exists), writable by
 *     admins only.
 */

const admin = `current_setting('app.current_user_role', true) = 'admin'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;
const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;

const ACCOUNT_STATUS_ENUM = 'users_account_status';
const ANNOUNCEMENT_AUDIENCE_ENUM = 'announcement_audience';

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
        CREATE TYPE ${ACCOUNT_STATUS_ENUM} AS ENUM ('active', 'suspended', 'banned');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await query(`
      DO $$ BEGIN
        CREATE TYPE ${ANNOUNCEMENT_AUDIENCE_ENUM} AS ENUM ('all', 'candidate', 'company', 'verifier');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // ---------------------------------------------------------------
    // 1 & 2. users: token_version, account_status, status_*
    // ---------------------------------------------------------------
    await queryInterface.addColumn('users', 'token_version', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('users', 'account_status', {
      type: ACCOUNT_STATUS_ENUM,
      allowNull: false,
      defaultValue: 'active',
    });
    await queryInterface.addColumn('users', 'status_reason', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'status_changed_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'status_changed_by', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    });

    // ---------------------------------------------------------------
    // 3. users_delete_admin — the missing DELETE policy for admins.
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY users_delete_admin ON users FOR DELETE
        USING (${admin});
    `);

    // ---------------------------------------------------------------
    // 4. company_requests: review audit trail columns
    // ---------------------------------------------------------------
    await queryInterface.addColumn('company_requests', 'reviewed_by', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    });
    await queryInterface.addColumn('company_requests', 'reviewed_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('company_requests', 'rejection_reason', {
      type: DataTypes.TEXT,
      allowNull: true,
    });

    // ---------------------------------------------------------------
    // 5. announcements
    // ---------------------------------------------------------------
    await queryInterface.createTable('announcements', {
      id: uuidPk,
      title: { type: DataTypes.STRING, allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      audience: { type: ANNOUNCEMENT_AUDIENCE_ENUM, allowNull: false },
      created_by: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      created_at: createdAtNow,
    });

    await query(`ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE announcements FORCE ROW LEVEL SECURITY;`);
    await query(`
      CREATE POLICY announcements_admin_all ON announcements FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);
    // Any logged-in user of any role can read the announcement list, for an
    // in-app banner — matches the notifications_authenticated_insert
    // "any authenticated session" shape from 20240101000004.
    await query(`
      CREATE POLICY announcements_select_authenticated ON announcements FOR SELECT
        USING (current_setting('app.current_user_role', true) IS NOT NULL);
    `);

    // ---------------------------------------------------------------
    // 6. site_settings — non-uuid primary key (`key`), same pattern as
    // user_totp_secrets / models/TotpSecret.ts (PK = user_id).
    // ---------------------------------------------------------------
    await queryInterface.createTable('site_settings', {
      key: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
      value: { type: DataTypes.TEXT, allowNull: true },
      updated_at: createdAtNow,
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
    });

    await query(`ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE site_settings FORCE ROW LEVEL SECURITY;`);
    // Public, unauthenticated reads allowed — the landing page needs
    // app_name/hero text before any session exists.
    await query(`
      CREATE POLICY site_settings_select_all ON site_settings FOR SELECT
        USING (true);
    `);
    await query(`
      CREATE POLICY site_settings_admin_write ON site_settings FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`DROP POLICY IF EXISTS site_settings_admin_write ON site_settings;`);
    await query(`DROP POLICY IF EXISTS site_settings_select_all ON site_settings;`);
    await query(`ALTER TABLE site_settings NO FORCE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE site_settings DISABLE ROW LEVEL SECURITY;`);
    await queryInterface.dropTable('site_settings');

    await query(`DROP POLICY IF EXISTS announcements_select_authenticated ON announcements;`);
    await query(`DROP POLICY IF EXISTS announcements_admin_all ON announcements;`);
    await query(`ALTER TABLE announcements NO FORCE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE announcements DISABLE ROW LEVEL SECURITY;`);
    await queryInterface.dropTable('announcements');

    await queryInterface.removeColumn('company_requests', 'rejection_reason');
    await queryInterface.removeColumn('company_requests', 'reviewed_at');
    await queryInterface.removeColumn('company_requests', 'reviewed_by');

    await query(`DROP POLICY IF EXISTS users_delete_admin ON users;`);

    await queryInterface.removeColumn('users', 'status_changed_by');
    await queryInterface.removeColumn('users', 'status_changed_at');
    await queryInterface.removeColumn('users', 'status_reason');
    await queryInterface.removeColumn('users', 'account_status');
    await queryInterface.removeColumn('users', 'token_version');

    await query(`DROP TYPE IF EXISTS ${ANNOUNCEMENT_AUDIENCE_ENUM} CASCADE;`);
    await query(`DROP TYPE IF EXISTS ${ACCOUNT_STATUS_ENUM} CASCADE;`);
  },
};
