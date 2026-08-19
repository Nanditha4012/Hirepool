'use strict';

/**
 * End-to-End Job Catalog & Hiring Pipeline (Feature 2) — Phase 6: external
 * applications. Anyone can apply through a job's careers link without ever
 * having a Hirepool account — this table is where that application lives
 * until (if ever) the applicant registers and it's linked to a real
 * candidate via `converted_candidate_id`.
 *
 * `full_name`/`email` are denormalized out of `form_data` (which holds the
 * complete raw submission) rather than left buried in JSONB — same
 * rationale as feed_posts.author_name: this data needs to be queried and
 * displayed constantly (conversion matching by email, a company's
 * applicant list), and re-parsing JSONB for that on every read is worse in
 * every direction than one denormalized, indexed column. `email` in
 * particular is load-bearing: it's what authController.signup matches
 * against to set converted_candidate_id.
 *
 * Because it's load-bearing, a job's application form — including a
 * `custom` one — is required (Zod, jdController.generateCareersLink) to
 * always include fields keyed exactly `email` and `full_name`. Without that
 * guarantee a custom form's applicant could be uncontactable and
 * unconvertible; see FEATURE2_PHASE6_SUMMARY.md.
 *
 * `relevancy_percent`/`tier` live directly on this row (not a separate
 * scores table the way candidates get one) because an external applicant
 * only ever has one job — there's no "recompute the same applicant across
 * many jobs" case the way there is for candidate_relevancy_scores.
 * Reuses Feature 1's `relevancy_tier` enum — same four batches the spec
 * describes external applicants being auto-scored into.
 */

const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;
const admin = `current_setting('app.current_user_role', true) = 'admin'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;
const nullContext = `current_setting('app.current_user_role', true) IS NULL`;

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes, literal } = Sequelize;
    const query = (sql) => queryInterface.sequelize.query(sql);

    await queryInterface.createTable('external_applicants', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: literal('gen_random_uuid()'),
      },
      job_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'jobs', key: 'id' },
        onDelete: 'CASCADE',
      },
      // Complete raw submission, keyed by field key — includes full_name/
      // email too (denormalized copies below are for querying, not instead
      // of keeping the original submission intact).
      form_data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      full_name: { type: DataTypes.STRING, allowNull: true },
      email: { type: DataTypes.STRING, allowNull: false },
      // Null when the job had no successfully parsed requirements at the
      // time of application — "without required structured fields, an
      // external application can't be placed into a relevancy batch"
      // (spec), generalized: without the JOB's own parsed JD, nothing to
      // score against either.
      relevancy_percent: { type: DataTypes.INTEGER, allowNull: true },
      tier: { type: 'relevancy_tier', allowNull: true },
      applied_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('now()') },
      converted_candidate_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
    });

    // One application per job per email — a re-submit should edit, not
    // duplicate (editing isn't built in this phase; the apply endpoint just
    // rejects a second submission with a clear 409).
    await query(`
      CREATE UNIQUE INDEX external_applicants_job_email_unique
        ON external_applicants (job_id, lower(email));
    `);
    await query(`CREATE INDEX external_applicants_email_idx ON external_applicants (lower(email));`);
    await query(`CREATE INDEX external_applicants_job_tier_idx ON external_applicants (job_id, tier);`);

    // ---------------------------------------------------------------
    // RLS
    // ---------------------------------------------------------------
    await query(`ALTER TABLE external_applicants ENABLE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE external_applicants FORCE ROW LEVEL SECURITY;`);

    // Public apply (careersController.applyToJob) — no session at all.
    await query(`
      CREATE POLICY external_applicants_insert_public ON external_applicants FOR INSERT
        WITH CHECK (${nullContext});
    `);
    // Conversion (authController.signup, candidate branch) — also runs with
    // no session, matching converted_candidate_id by email. Mirrors
    // payments_update_for_webhook / relevancy_packages_update_for_webhook's
    // exact null-context UPDATE shape.
    await query(`
      CREATE POLICY external_applicants_update_for_conversion ON external_applicants FOR UPDATE
        USING (${nullContext});
    `);
    // Company reads applicants to its own jobs. SELECT-only for now — Phase
    // 6 scores an applicant once, at apply time, against whatever the job's
    // parsed requirements were then; it does not rescore existing
    // applicants when a JD is later edited (unlike candidate_relevancy_scores,
    // which does). If that's wanted later this needs a company UPDATE policy
    // added too — same lesson as Phase 1 -> Phase 2's candidate_relevancy_scores
    // policy, called out up front this time instead of discovered later.
    await query(`
      CREATE POLICY external_applicants_company_select ON external_applicants FOR SELECT
        USING (
          ${roleIs('company')} AND EXISTS (
            SELECT 1 FROM jobs j WHERE j.id = job_id AND j.company_id = ${selfId}
          )
        );
    `);
    await query(`
      CREATE POLICY external_applicants_admin ON external_applicants FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('external_applicants');
  },
};
