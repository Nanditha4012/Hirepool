'use strict';

/**
 * Phase 5: verifier workflow upgrade.
 *
 * Purely additive, following the conventions of
 * 20240104000001-phase4-verification.js (idempotent enum creation, uuidPk /
 * createdAtNow literals, admin/roleIs/selfId RLS session-variable helpers,
 * DDL + RLS in one file). Nothing here drops or rewrites existing data.
 *
 * What it adds:
 *
 *  1. users.username — verifier/admin accounts are provisioned by us, not
 *     self-signup, so they log in with a handle ("verifier01") rather than
 *     an email. Nullable + unique so every existing row stays valid.
 *
 *  2. candidate_profiles.pending_reverification /
 *     reverification_requested_at — an already-approved candidate who adds a
 *     new project stays live on the portal, but the new item still has to be
 *     re-verified. These two columns are what the candidate dashboard reads
 *     to show "you have unverified changes — submit a verification request".
 *
 *  3. profile_field_checks — the per-field Yes/No the verifier records while
 *     reviewing (field_key + passed + optional reason). Append-only: every
 *     review pass inserts a fresh row rather than updating, which is what
 *     makes the profile timeline reconstructable. The "current" state of a
 *     field is simply its newest row.
 */

const admin = `current_setting('app.current_user_role', true) = 'admin'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;
const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes, literal } = Sequelize;
    const query = (sql) => queryInterface.sequelize.query(sql);

    // ---------------------------------------------------------------
    // 1. users.username
    // ---------------------------------------------------------------
    await queryInterface.addColumn('users', 'username', {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    });

    // ---------------------------------------------------------------
    // 2. candidate_profiles re-verification flags
    // ---------------------------------------------------------------
    await queryInterface.addColumn('candidate_profiles', 'pending_reverification', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('candidate_profiles', 'reverification_requested_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });

    // ---------------------------------------------------------------
    // 3. profile_field_checks
    // ---------------------------------------------------------------
    await queryInterface.createTable('profile_field_checks', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: literal('gen_random_uuid()'),
      },
      profile_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'candidate_profiles', key: 'id' },
        onDelete: 'CASCADE',
      },
      // Denormalised copy of candidate_profiles.user_id. The candidate-facing
      // RLS policy below has to answer "is this my row?" on every SELECT;
      // without this column that check needs a subquery into
      // candidate_profiles on every row, which is both slower and awkward
      // under FORCE ROW LEVEL SECURITY (the subquery is itself RLS-filtered).
      candidate_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      reviewer_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      // Stable machine key, e.g. 'resumeLink' / 'project:<uuid>'. Not an enum:
      // per-item checks (one row per project/badge) mean the key set is
      // open-ended and data-dependent.
      field_key: { type: DataTypes.STRING, allowNull: false },
      field_label: { type: DataTypes.STRING, allowNull: true },
      passed: { type: DataTypes.BOOLEAN, allowNull: false },
      reason_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'rejection_reasons_master', key: 'id' },
      },
      reason_text: { type: DataTypes.TEXT, allowNull: true },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: literal('NOW()'),
      },
    });

    // Newest-first per profile: covers both "current state of each field"
    // and the timeline query, which are the only two reads on this table.
    await queryInterface.addIndex('profile_field_checks', ['profile_id', 'created_at'], {
      name: 'profile_field_checks_profile_created_idx',
    });
    await queryInterface.addIndex('profile_field_checks', ['candidate_id'], {
      name: 'profile_field_checks_candidate_idx',
    });

    // ---------------------------------------------------------------
    // RLS for profile_field_checks
    //
    // Verifiers write and read everything; candidates read only their own
    // rows (this is what powers the candidate's "why was I rejected"
    // report); admins get full access. No UPDATE/DELETE policy for anyone
    // but admin — the table is deliberately append-only so the timeline
    // can't be rewritten after the fact.
    // ---------------------------------------------------------------
    await query(`ALTER TABLE profile_field_checks ENABLE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE profile_field_checks FORCE ROW LEVEL SECURITY;`);
    await query(`
      CREATE POLICY profile_field_checks_verifier_select ON profile_field_checks FOR SELECT
        USING (${roleIs('verifier')});
    `);
    await query(`
      CREATE POLICY profile_field_checks_verifier_insert ON profile_field_checks FOR INSERT
        WITH CHECK (${roleIs('verifier')} AND reviewer_id = ${selfId});
    `);
    await query(`
      CREATE POLICY profile_field_checks_candidate_select ON profile_field_checks FOR SELECT
        USING (${roleIs('candidate')} AND candidate_id = ${selfId});
    `);
    await query(`
      CREATE POLICY profile_field_checks_admin_all ON profile_field_checks FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // Verifiers need to read the reviewer name on rows they didn't write
    // (the timeline shows "reviewed by <name>"), and their own users row
    // for the account page. Phase 4's users_select_candidate_by_verifier
    // only covers role = 'candidate', so a verifier currently cannot read
    // any verifier row — including their own — and every reviewer name in
    // the timeline would come back null.
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY users_select_verifier_by_verifier ON users FOR SELECT
        USING (${roleIs('verifier')} AND role IN ('verifier', 'admin'));
    `);

    // A verifier updating their own display name / password from the
    // account page. Scoped to their own row only.
    await query(`
      CREATE POLICY users_update_self_by_verifier ON users FOR UPDATE
        USING (${roleIs('verifier')} AND id = ${selfId})
        WITH CHECK (${roleIs('verifier')} AND id = ${selfId});
    `);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`DROP POLICY IF EXISTS users_update_self_by_verifier ON users;`);
    await query(`DROP POLICY IF EXISTS users_select_verifier_by_verifier ON users;`);

    await query(`DROP POLICY IF EXISTS profile_field_checks_admin_all ON profile_field_checks;`);
    await query(`DROP POLICY IF EXISTS profile_field_checks_candidate_select ON profile_field_checks;`);
    await query(`DROP POLICY IF EXISTS profile_field_checks_verifier_insert ON profile_field_checks;`);
    await query(`DROP POLICY IF EXISTS profile_field_checks_verifier_select ON profile_field_checks;`);
    await query(`ALTER TABLE profile_field_checks NO FORCE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE profile_field_checks DISABLE ROW LEVEL SECURITY;`);

    await queryInterface.dropTable('profile_field_checks');

    await queryInterface.removeColumn('candidate_profiles', 'reverification_requested_at');
    await queryInterface.removeColumn('candidate_profiles', 'pending_reverification');

    await queryInterface.removeColumn('users', 'username');
  },
};
