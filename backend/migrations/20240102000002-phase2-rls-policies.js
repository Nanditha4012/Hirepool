'use strict';

/**
 * Row Level Security for the five new Phase 2 tables introduced in
 * 20240102000001-phase2-candidate-profile.js. Follows the EXACT
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

    const allTables = [
      'skills_master',
      'domains_master',
      'candidate_skills',
      'candidate_secondary_roles',
      'company_requests',
    ];

    for (const table of allTables) {
      await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      await query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    }

    // ---------------------------------------------------------------
    // skills_master, domains_master: public SELECT, admin-only write
    // (same pattern as roles_master / platform_badges_master / companies_master).
    // ---------------------------------------------------------------
    for (const table of ['skills_master', 'domains_master']) {
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
    // candidate_skills, candidate_secondary_roles
    //   - candidates: full CRUD on their own rows (candidate_id = self)
    //   - admins: full access
    // ---------------------------------------------------------------
    for (const table of ['candidate_skills', 'candidate_secondary_roles']) {
      await query(`
        CREATE POLICY ${table}_owner ON ${table} FOR ALL
          USING (${roleIs('candidate')} AND candidate_id = ${selfId})
          WITH CHECK (${roleIs('candidate')} AND candidate_id = ${selfId});
      `);
      await query(`
        CREATE POLICY ${table}_admin ON ${table} FOR ALL
          USING (${admin})
          WITH CHECK (${admin});
      `);
    }

    // ---------------------------------------------------------------
    // company_requests
    //   - candidates: INSERT/SELECT their own (requested_by = self)
    //   - admins: full access (approve/reject is Phase 5 — this policy
    //     already allows it)
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY company_requests_owner_select ON company_requests FOR SELECT
        USING (${roleIs('candidate')} AND requested_by = ${selfId});
    `);
    await query(`
      CREATE POLICY company_requests_owner_insert ON company_requests FOR INSERT
        WITH CHECK (${roleIs('candidate')} AND requested_by = ${selfId});
    `);
    await query(`
      CREATE POLICY company_requests_admin ON company_requests FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    const tablesAndPolicies = {
      skills_master: ['skills_master_select_all', 'skills_master_admin_write'],
      domains_master: ['domains_master_select_all', 'domains_master_admin_write'],
      candidate_skills: ['candidate_skills_owner', 'candidate_skills_admin'],
      candidate_secondary_roles: [
        'candidate_secondary_roles_owner',
        'candidate_secondary_roles_admin',
      ],
      company_requests: [
        'company_requests_owner_select',
        'company_requests_owner_insert',
        'company_requests_admin',
      ],
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
