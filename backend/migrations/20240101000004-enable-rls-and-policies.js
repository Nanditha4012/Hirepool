'use strict';

/**
 * Row Level Security (defense-in-depth), session-variable based
 * ---------------------------------------------------------------
 * This app does NOT use Supabase Auth — the Express backend authenticates
 * requests with its own JWT and talks to Postgres through a single
 * application DB role. Because of that, Supabase's usual `auth.uid()` /
 * `auth.role()` helpers (which read Supabase's own JWT claims) are not
 * available here.
 *
 * The Postgres-native equivalent used instead: before running any query
 * that touches user data, the Express layer opens a transaction and runs
 *   SET LOCAL app.current_user_id = '<uuid>';
 *   SET LOCAL app.current_user_role = '<role>';
 * (both unset/NULL for anonymous/pre-auth requests, e.g. registration).
 * These policies read those session variables via
 *   current_setting('app.current_user_id', true)::uuid
 *   current_setting('app.current_user_role', true)
 * (the `true` "missing_ok" argument makes it return NULL instead of raising
 * when the variable was never set, e.g. if a query runs outside the
 * request-scoped transaction).
 *
 * This is explicitly a SECOND layer of defense behind the Express
 * authorization middleware/controllers, not the primary access-control
 * mechanism — if the app layer has a bug that leaks the wrong rows, RLS is
 * the backstop that still enforces row ownership at the database level.
 *
 * FORCE ROW LEVEL SECURITY: because migrations and the app connect to
 * Postgres as the same single application role, and that role owns the
 * tables it created, Postgres would otherwise let it bypass RLS entirely
 * (table owners bypass RLS by default, even after ENABLE ROW LEVEL
 * SECURITY, unless FORCE is also applied). We FORCE RLS on every table so
 * these policies actually take effect for the app's own connection.
 *
 * Some policies below go slightly beyond the letter of the six access-model
 * bullet points from spec, where skipping them would silently break core
 * product flows (e.g. a company having no way to read/update its own
 * company_profiles row, or a user having no way to enroll their own TOTP
 * secret). Each such addition is called out in an inline comment as an
 * "extension" so it's easy to spot and revisit.
 */

const admin = `current_setting('app.current_user_role', true) = 'admin'`;
const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;

module.exports = {
  up: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    const allTables = [
      'users',
      'candidate_profiles',
      'company_profiles',
      'verification_logs',
      'admin_audit_logs',
      'roles_master',
      'platform_badges_master',
      'companies_master',
      'messages',
      'notifications',
      'candidate_platform_badges',
      'candidate_achievements',
      'user_totp_secrets',
    ];

    for (const table of allTables) {
      await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      await query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    }

    // ---------------------------------------------------------------
    // users
    //   - a user can select their own row
    //   - admins can select/update any row
    //   - (extension) INSERT is allowed either for admins, or when no
    //     session role is set at all, i.e. the public registration
    //     endpoint, which by definition runs before any user session
    //     exists to set app.current_user_id/role.
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY users_select_own ON users FOR SELECT
        USING (id = ${selfId});
    `);
    await query(`
      CREATE POLICY users_select_admin ON users FOR SELECT
        USING (${admin});
    `);
    await query(`
      CREATE POLICY users_update_admin ON users FOR UPDATE
        USING (${admin})
        WITH CHECK (${admin});
    `);
    await query(`
      CREATE POLICY users_insert_registration ON users FOR INSERT
        WITH CHECK (
          current_setting('app.current_user_role', true) IS NULL
          OR ${admin}
        );
    `);
    // (extension) Credential lookups (login, Google sign-in) must find a user
    // by email before a session/role exists to scope a SELECT to "self".
    // Mirrors users_insert_registration's null-context condition: this only
    // ever applies to unauthenticated (pre-session) queries — any request
    // that has already set app.current_user_role falls through to the
    // owner/admin policies above instead. The Express layer never returns
    // password_hash/google_id to a client; RLS here just needs to let the
    // app's own DB connection find the row at all.
    await query(`
      CREATE POLICY users_select_for_auth ON users FOR SELECT
        USING (current_setting('app.current_user_role', true) IS NULL);
    `);

    // ---------------------------------------------------------------
    // candidate_profiles
    //   - candidates: select/update/insert only their own row
    //   - companies: select only rows with status = 'approved'
    //     (no column-level restriction here: the Express
    //     controller/serializer is responsible for stripping contact
    //     fields before a company ever sees the payload)
    //   - verifiers: select/update
    //   - admins: full access
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY candidate_profiles_owner ON candidate_profiles FOR ALL
        USING (${roleIs('candidate')} AND user_id = ${selfId})
        WITH CHECK (${roleIs('candidate')} AND user_id = ${selfId});
    `);
    await query(`
      CREATE POLICY candidate_profiles_company_select ON candidate_profiles FOR SELECT
        USING (${roleIs('company')} AND status = 'approved');
    `);
    await query(`
      CREATE POLICY candidate_profiles_verifier_select ON candidate_profiles FOR SELECT
        USING (${roleIs('verifier')});
    `);
    await query(`
      CREATE POLICY candidate_profiles_verifier_update ON candidate_profiles FOR UPDATE
        USING (${roleIs('verifier')})
        WITH CHECK (${roleIs('verifier')});
    `);
    await query(`
      CREATE POLICY candidate_profiles_admin ON candidate_profiles FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // company_profiles (extension: not one of the six spec bullets, but
    // a company obviously needs to read/manage its own profile row —
    // same ownership pattern as candidate_profiles).
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY company_profiles_owner ON company_profiles FOR ALL
        USING (${roleIs('company')} AND user_id = ${selfId})
        WITH CHECK (${roleIs('company')} AND user_id = ${selfId});
    `);
    await query(`
      CREATE POLICY company_profiles_admin ON company_profiles FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // verification_logs
    //   - verifiers: insert their own decisions (reviewer_id = self)
    //   - admins: full access
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY verification_logs_verifier_insert ON verification_logs FOR INSERT
        WITH CHECK (${roleIs('verifier')} AND reviewer_id = ${selfId});
    `);
    await query(`
      CREATE POLICY verification_logs_admin ON verification_logs FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // admin_audit_logs — admin only, per spec (no other role is granted
    // any access to this table).
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY admin_audit_logs_admin ON admin_audit_logs FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // Master tables: SELECT allowed for everyone, writes admin-only.
    // ---------------------------------------------------------------
    for (const table of ['roles_master', 'platform_badges_master', 'companies_master']) {
      await query(`
        CREATE POLICY ${table}_select_all ON ${table} FOR SELECT
          USING (true);
      `);
      await query(`
        CREATE POLICY ${table}_admin_write ON ${table} FOR ALL
          USING (${admin})
          WITH CHECK (${admin});
      `);
    }

    // ---------------------------------------------------------------
    // messages (extension: not one of the six spec bullets, but without
    // it neither participant could ever read/send a message, which is
    // core product functionality). A participant is either the company
    // or the candidate on the thread; INSERT additionally requires the
    // sender_role column to match the acting session's own role.
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY messages_participant_select ON messages FOR SELECT
        USING (
          (${roleIs('company')} AND company_id = ${selfId})
          OR (${roleIs('candidate')} AND candidate_id = ${selfId})
        );
    `);
    await query(`
      CREATE POLICY messages_participant_insert ON messages FOR INSERT
        WITH CHECK (
          (${roleIs('company')} AND company_id = ${selfId} AND sender_role = 'company')
          OR (${roleIs('candidate')} AND candidate_id = ${selfId} AND sender_role = 'candidate')
        );
    `);
    await query(`
      CREATE POLICY messages_participant_update ON messages FOR UPDATE
        USING (
          (${roleIs('company')} AND company_id = ${selfId})
          OR (${roleIs('candidate')} AND candidate_id = ${selfId})
        )
        WITH CHECK (
          (${roleIs('company')} AND company_id = ${selfId})
          OR (${roleIs('candidate')} AND candidate_id = ${selfId})
        );
    `);
    await query(`
      CREATE POLICY messages_admin ON messages FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // notifications (extension). Owner can read/mark-read their own
    // notifications. INSERT is intentionally opened to any authenticated
    // session (role IS NOT NULL) rather than restricted to the owner,
    // because notifications are inherently cross-user by nature (e.g. a
    // company sending a message creates a notification row for the
    // candidate, or a verifier's decision creates one for the candidate)
    // — the app layer, not RLS, is responsible for validating the
    // notification's content/target here.
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY notifications_owner_select ON notifications FOR SELECT
        USING (user_id = ${selfId});
    `);
    await query(`
      CREATE POLICY notifications_owner_update ON notifications FOR UPDATE
        USING (user_id = ${selfId})
        WITH CHECK (user_id = ${selfId});
    `);
    await query(`
      CREATE POLICY notifications_authenticated_insert ON notifications FOR INSERT
        WITH CHECK (current_setting('app.current_user_role', true) IS NOT NULL);
    `);
    await query(`
      CREATE POLICY notifications_admin ON notifications FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // candidate_platform_badges
    //   - candidates: select/update/insert only their own rows
    //   - verifiers: select/update
    //   - admins: full access
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY candidate_platform_badges_owner ON candidate_platform_badges FOR ALL
        USING (${roleIs('candidate')} AND candidate_id = ${selfId})
        WITH CHECK (${roleIs('candidate')} AND candidate_id = ${selfId});
    `);
    await query(`
      CREATE POLICY candidate_platform_badges_verifier_select ON candidate_platform_badges FOR SELECT
        USING (${roleIs('verifier')});
    `);
    await query(`
      CREATE POLICY candidate_platform_badges_verifier_update ON candidate_platform_badges FOR UPDATE
        USING (${roleIs('verifier')})
        WITH CHECK (${roleIs('verifier')});
    `);
    await query(`
      CREATE POLICY candidate_platform_badges_admin ON candidate_platform_badges FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // candidate_achievements
    //   - candidates: select/update/insert only their own rows
    //   - verifiers: select/update
    //   - admins: full access
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY candidate_achievements_owner ON candidate_achievements FOR ALL
        USING (${roleIs('candidate')} AND candidate_id = ${selfId})
        WITH CHECK (${roleIs('candidate')} AND candidate_id = ${selfId});
    `);
    await query(`
      CREATE POLICY candidate_achievements_verifier_select ON candidate_achievements FOR SELECT
        USING (${roleIs('verifier')});
    `);
    await query(`
      CREATE POLICY candidate_achievements_verifier_update ON candidate_achievements FOR UPDATE
        USING (${roleIs('verifier')})
        WITH CHECK (${roleIs('verifier')});
    `);
    await query(`
      CREATE POLICY candidate_achievements_admin ON candidate_achievements FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // user_totp_secrets (extension: not one of the six spec bullets, but
    // essential — a user must be able to enroll/view/rotate their own
    // 2FA secret; without this, TOTP setup would be impossible for
    // anyone but an admin).
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY user_totp_secrets_owner ON user_totp_secrets FOR ALL
        USING (user_id = ${selfId})
        WITH CHECK (user_id = ${selfId});
    `);
    await query(`
      CREATE POLICY user_totp_secrets_admin ON user_totp_secrets FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    const tablesAndPolicies = {
      users: [
        'users_select_own',
        'users_select_admin',
        'users_update_admin',
        'users_insert_registration',
        'users_select_for_auth',
      ],
      candidate_profiles: [
        'candidate_profiles_owner',
        'candidate_profiles_company_select',
        'candidate_profiles_verifier_select',
        'candidate_profiles_verifier_update',
        'candidate_profiles_admin',
      ],
      company_profiles: ['company_profiles_owner', 'company_profiles_admin'],
      verification_logs: ['verification_logs_verifier_insert', 'verification_logs_admin'],
      admin_audit_logs: ['admin_audit_logs_admin'],
      roles_master: ['roles_master_select_all', 'roles_master_admin_write'],
      platform_badges_master: ['platform_badges_master_select_all', 'platform_badges_master_admin_write'],
      companies_master: ['companies_master_select_all', 'companies_master_admin_write'],
      messages: [
        'messages_participant_select',
        'messages_participant_insert',
        'messages_participant_update',
        'messages_admin',
      ],
      notifications: [
        'notifications_owner_select',
        'notifications_owner_update',
        'notifications_authenticated_insert',
        'notifications_admin',
      ],
      candidate_platform_badges: [
        'candidate_platform_badges_owner',
        'candidate_platform_badges_verifier_select',
        'candidate_platform_badges_verifier_update',
        'candidate_platform_badges_admin',
      ],
      candidate_achievements: [
        'candidate_achievements_owner',
        'candidate_achievements_verifier_select',
        'candidate_achievements_verifier_update',
        'candidate_achievements_admin',
      ],
      user_totp_secrets: ['user_totp_secrets_owner', 'user_totp_secrets_admin'],
    };

    for (const [table, policies] of Object.entries(tablesAndPolicies)) {
      for (const policy of policies) {
        await query(`DROP POLICY IF EXISTS ${policy} ON ${table};`);
      }
      await query(`ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY;`);
      await query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`);
    }
  },
};
