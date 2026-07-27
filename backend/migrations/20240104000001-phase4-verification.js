'use strict';

/**
 * Phase 4: Verification Portal backend (role=verifier, route /verify).
 *
 * Follows the exact conventions of 20240103000001-phase3-company-portal.js /
 * 20240103000002-phase3-rls-policies.js (idempotent `DO $$ ... EXCEPTION
 * WHEN duplicate_object` enum creation, uuidPk/createdAtNow helpers,
 * admin/roleIs/selfId RLS session-variable helper constants), combined into
 * a single migration file (DDL + RLS) rather than split across two, since
 * this phase only adds RLS for one new table.
 *
 * Phase 1's 20240101000004-enable-rls-and-policies.js already grants
 * verifiers SELECT+UPDATE on candidate_profiles, candidate_platform_badges,
 * candidate_achievements, and INSERT (reviewer_id = self) on
 * verification_logs — so no new policies are needed for those four tables
 * here, only for the new rejection_reasons_master master table.
 *
 * This migration runs against a live Supabase DB that already has Phase 1-3
 * data — it is purely additive (new table, new nullable columns) and never
 * drops or alters any existing table/column.
 */

const admin = `current_setting('app.current_user_role', true) = 'admin'`;
const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;

const ENUM_TYPES = [{ name: 'rejection_reason_scope', values: ['profile', 'item'] }];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes, literal } = Sequelize;
    const uuidPk = {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: literal('gen_random_uuid()'),
    };
    const query = (sql) => queryInterface.sequelize.query(sql);

    // ---------------------------------------------------------------
    // New enum types
    // ---------------------------------------------------------------
    for (const enumType of ENUM_TYPES) {
      const valuesSql = enumType.values.map((v) => `'${v}'`).join(', ');
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE ${enumType.name} AS ENUM (${valuesSql});
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$;
      `);
    }

    // ---------------------------------------------------------------
    // candidate_profiles: new nullable columns
    // ---------------------------------------------------------------
    await queryInterface.addColumn('candidate_profiles', 'assigned_verifier_id', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    });
    await queryInterface.addColumn('candidate_profiles', 'submitted_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });

    // ---------------------------------------------------------------
    // rejection_reasons_master
    // ---------------------------------------------------------------
    await queryInterface.createTable('rejection_reasons_master', {
      id: uuidPk,
      scope: { type: 'rejection_reason_scope', allowNull: false },
      reason_text: { type: DataTypes.STRING, allowNull: false },
    });

    // ---------------------------------------------------------------
    // RLS: public SELECT, admin-only write (same pattern as
    // roles_master/skills_master).
    // ---------------------------------------------------------------
    await query(`ALTER TABLE rejection_reasons_master ENABLE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE rejection_reasons_master FORCE ROW LEVEL SECURITY;`);
    await query(`
      CREATE POLICY rejection_reasons_master_select_all ON rejection_reasons_master FOR SELECT
        USING (true);
    `);
    await query(`
      CREATE POLICY rejection_reasons_master_admin_write ON rejection_reasons_master FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // Same class of gap caught in Phase 3 (users_select_candidate_by_company),
    // now for verifiers: Phase 1 granted verifiers SELECT+UPDATE on
    // candidate_profiles/candidate_platform_badges/candidate_achievements,
    // but never on the `users` row itself — so every fullName/phone/email
    // lookup in the verifier queue and review pages (listProfileQueue,
    // getProfileForReview, listBadgeQueue, listAchievementQueue) would
    // silently return null under RLS.
    //
    // Deliberately UNSCOPED by candidate_profiles.status (unlike the
    // company-facing policy, which only allows approved candidates) —
    // verifiers exist specifically to review candidates who are NOT yet
    // approved (submitted/under_review), so scoping to 'approved' would
    // make the review queue itself unreadable.
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY users_select_candidate_by_verifier ON users FOR SELECT
        USING (${roleIs('verifier')} AND role = 'candidate');
    `);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`DROP POLICY IF EXISTS users_select_candidate_by_verifier ON users;`);
    await query(`DROP POLICY IF EXISTS rejection_reasons_master_select_all ON rejection_reasons_master;`);
    await query(`DROP POLICY IF EXISTS rejection_reasons_master_admin_write ON rejection_reasons_master;`);
    await query(`ALTER TABLE rejection_reasons_master NO FORCE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE rejection_reasons_master DISABLE ROW LEVEL SECURITY;`);

    await queryInterface.dropTable('rejection_reasons_master');

    await queryInterface.removeColumn('candidate_profiles', 'submitted_at');
    await queryInterface.removeColumn('candidate_profiles', 'assigned_verifier_id');

    for (const enumType of [...ENUM_TYPES].reverse()) {
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS ${enumType.name} CASCADE;`);
    }
  },
};
