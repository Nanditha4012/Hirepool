'use strict';

/**
 * Row Level Security for the three new Phase 3 tables introduced in
 * 20240103000001-phase3-company-portal.js. Follows the EXACT
 * session-variable-based pattern established in
 * 20240101000004-enable-rls-and-policies.js (`admin`/`roleIs`/`selfId`
 * helper constants, FORCE ROW LEVEL SECURITY) — see that file's header
 * comment for the full rationale; not repeated here.
 */

const admin = `current_setting('app.current_user_role', true) = 'admin'`;
const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;

module.exports = {
  up: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    const allTables = ['plans_master', 'unlocks', 'company_blocks'];

    for (const table of allTables) {
      await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      await query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    }

    // ---------------------------------------------------------------
    // plans_master: public SELECT, admin-only write (same pattern as
    // skills_master / domains_master).
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY plans_master_select_all ON plans_master FOR SELECT
        USING (true);
    `);
    await query(`
      CREATE POLICY plans_master_admin_write ON plans_master FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // unlocks
    //   - companies: full CRUD on rows they own (company_id = self)
    //   - candidates: SELECT rows about themselves (candidate_id = self) —
    //     lets a candidate see which companies have unlocked their contact
    //     info
    //   - admins: full access
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY unlocks_company_owner ON unlocks FOR ALL
        USING (${roleIs('company')} AND company_id = ${selfId})
        WITH CHECK (${roleIs('company')} AND company_id = ${selfId});
    `);
    await query(`
      CREATE POLICY unlocks_candidate_select ON unlocks FOR SELECT
        USING (${roleIs('candidate')} AND candidate_id = ${selfId});
    `);
    await query(`
      CREATE POLICY unlocks_admin ON unlocks FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // company_blocks
    //   - candidates: INSERT/SELECT their own blocks (candidate_id = self)
    //   - companies: SELECT rows about themselves (company_id = self) — so
    //     a company can tell why messaging a candidate is forbidden
    //   - admins: full access
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY company_blocks_candidate_select ON company_blocks FOR SELECT
        USING (${roleIs('candidate')} AND candidate_id = ${selfId});
    `);
    await query(`
      CREATE POLICY company_blocks_candidate_insert ON company_blocks FOR INSERT
        WITH CHECK (${roleIs('candidate')} AND candidate_id = ${selfId});
    `);
    await query(`
      CREATE POLICY company_blocks_company_select ON company_blocks FOR SELECT
        USING (${roleIs('company')} AND company_id = ${selfId});
    `);
    await query(`
      CREATE POLICY company_blocks_admin ON company_blocks FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // Cross-role reads Phase 3 actually needs, missing from Phase 1's
    // users/company_profiles policies (Phase 1 only ever granted
    // self/admin access to `users`, and owner/admin access to
    // `company_profiles` — neither anticipated a company reading a
    // candidate's name/contact, or a candidate reading a company's name).
    // Without these, search/unlock/messaging would silently resolve every
    // cross-role User.findByPk/CompanyProfile lookup to nothing under RLS,
    // even though the Express layer's own logic correctly gates contact
    // fields (phone/email) behind `isUnlockedByMe` — this is what actually
    // enforces "blurred until unlock", not RLS on `users` itself.
    //
    // Scoped to `status = 'approved'` candidates (mirroring the exact same
    // boundary `candidate_profiles_company_select` already uses — a company
    // should never look up a draft/rejected candidate's name via a direct
    // id guess) OR a candidate the company has already unlocked. The second
    // branch matters because spec requires unlocked candidates stay visible
    // "permanently" — including their contact fields, which the Express
    // layer gates on `isUnlockedByMe`, not on current profile status. Without
    // it, a candidate editing their approved profile back to `submitted`
    // (Phase 2's edit-resets-to-submitted rule) would retroactively hide
    // them from a company that already legitimately unlocked and paid for
    // their contact info.
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY users_select_candidate_by_company ON users FOR SELECT
        USING (
          ${roleIs('company')}
          AND role = 'candidate'
          AND (
            EXISTS (
              SELECT 1 FROM candidate_profiles cp
              WHERE cp.user_id = users.id AND cp.status = 'approved'
            )
            OR EXISTS (
              SELECT 1 FROM unlocks u
              WHERE u.candidate_id = users.id AND u.company_id = ${selfId}
            )
          )
        );
    `);
    // Company names/branding aren't sensitive the way candidate contact info
    // is (the whole product is companies wanting to be found) — no
    // additional scoping needed beyond "candidate session, target is a
    // company account".
    await query(`
      CREATE POLICY company_profiles_candidate_select ON company_profiles FOR SELECT
        USING (${roleIs('candidate')});
    `);

    // ---------------------------------------------------------------
    // Pre-existing Phase 1 gap, found during this Phase 3 review, fixed
    // here since 20240101000004-enable-rls-and-policies.js is already
    // applied to the live DB and can't be edited retroactively.
    //
    // authController.signup()/googleAuth() create the profile row
    // (candidate_profiles or company_profiles) inside the SAME
    // runInRequestContext(null, ...) transaction used for the users insert
    // — i.e. with NO session variables set, because by definition no
    // session exists until registration completes. The `users` table
    // anticipated this (`users_insert_registration` explicitly allows a
    // null-context INSERT), but candidate_profiles_owner / company_profiles_owner
    // are `FOR ALL` policies gated on `roleIs('candidate'/'company')`, and
    // under Postgres RLS a NULL-vs-string comparison evaluates to NULL, not
    // true — so those inserts would be silently rejected. This was never
    // caught because every prior signup attempt failed earlier, at the
    // `users` insert (missing full_name column, fixed earlier this
    // session) — so this path was never actually exercised against the
    // live DB. Additive `FOR INSERT` policies here are OR'd (permissive)
    // against the existing `FOR ALL` policies without loosening
    // SELECT/UPDATE/DELETE for either table.
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY candidate_profiles_insert_registration ON candidate_profiles FOR INSERT
        WITH CHECK (current_setting('app.current_user_role', true) IS NULL);
    `);
    await query(`
      CREATE POLICY company_profiles_insert_registration ON company_profiles FOR INSERT
        WITH CHECK (current_setting('app.current_user_role', true) IS NULL);
    `);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    const tablesAndPolicies = {
      plans_master: ['plans_master_select_all', 'plans_master_admin_write'],
      unlocks: ['unlocks_company_owner', 'unlocks_candidate_select', 'unlocks_admin'],
      company_blocks: [
        'company_blocks_candidate_select',
        'company_blocks_candidate_insert',
        'company_blocks_company_select',
        'company_blocks_admin',
      ],
    };

    for (const [table, policies] of Object.entries(tablesAndPolicies)) {
      for (const policy of policies) {
        await query(`DROP POLICY IF EXISTS ${policy} ON ${table};`);
      }
      await query(`ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY;`);
      await query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`);
    }

    // `users` and `company_profiles` already had RLS ENABLE/FORCE'd by Phase
    // 1's migration — only drop the two policies this migration added to
    // them, don't touch their RLS enable/force state (that belongs to
    // 20240101000004-enable-rls-and-policies.js's up/down, not this one).
    await query(`DROP POLICY IF EXISTS users_select_candidate_by_company ON users;`);
    await query(`DROP POLICY IF EXISTS company_profiles_candidate_select ON company_profiles;`);
    await query(`DROP POLICY IF EXISTS candidate_profiles_insert_registration ON candidate_profiles;`);
    await query(`DROP POLICY IF EXISTS company_profiles_insert_registration ON company_profiles;`);
  },
};
