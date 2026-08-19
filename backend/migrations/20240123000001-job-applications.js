'use strict';

/**
 * End-to-End Job Catalog & Hiring Pipeline (Feature 2) — Phase 7:
 * applications, badges, shortlisting. `job_applications` is the pipeline
 * table itself — a row only exists once a company has actually committed
 * to a candidate for a job, via either of the two equivalent actions the
 * spec describes: manual "Add to Job" (one candidate, from search) or bulk
 * "Shortlist" (one or more, from an AI relevancy batch or the external
 * applicant list). Both create the same kind of row; there's no separate
 * "suggested but not yet added" state modelled here — the relevancy
 * batches (Feature 1) and external applicant list (Phase 6) already ARE
 * that suggestions view via their own existing endpoints.
 *
 * `current_round_id` has no foreign key yet — `job_rounds` doesn't exist
 * until Phase 8. It's a plain nullable UUID column for now; Phase 8 adds
 * the FK constraint once that table exists (ALTER TABLE ADD CONSTRAINT,
 * not a rewrite of this migration).
 *
 * `status` starts minimal (shortlisted/rejected) — Phase 8-10 will extend
 * this enum via ADD VALUE as rounds/offer/joining states are introduced,
 * same mechanism already used for payment_type/achievement_type.
 */

const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;
const admin = `current_setting('app.current_user_role', true) = 'admin'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;

const ENUM_TYPES = [
  { name: 'job_application_source', values: ['internal', 'external'] },
  { name: 'job_application_status', values: ['shortlisted', 'rejected'] },
];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes, literal } = Sequelize;
    const query = (sql) => queryInterface.sequelize.query(sql);

    for (const enumType of ENUM_TYPES) {
      const valuesSql = enumType.values.map((v) => `'${v}'`).join(', ');
      await query(`
        DO $$ BEGIN
          CREATE TYPE ${enumType.name} AS ENUM (${valuesSql});
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$;
      `);
    }

    await queryInterface.createTable('job_applications', {
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
      candidate_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      external_applicant_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'external_applicants', key: 'id' },
        onDelete: 'CASCADE',
      },
      source: { type: 'job_application_source', allowNull: false },
      // Denormalized rather than derived from `source` at read time — the
      // spec lists it as its own column, and "which badge does this row
      // show" is exactly the kind of thing worth not recomputing on every
      // list render.
      verified_badge: { type: DataTypes.BOOLEAN, allowNull: false },
      status: { type: 'job_application_status', allowNull: false, defaultValue: 'shortlisted' },
      current_round_id: { type: DataTypes.UUID, allowNull: true },
      shortlisted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('now()') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('now()') },
    });

    await query(`
      ALTER TABLE job_applications ADD CONSTRAINT job_applications_source_matches_id CHECK (
        (source = 'internal' AND candidate_id IS NOT NULL AND external_applicant_id IS NULL) OR
        (source = 'external' AND external_applicant_id IS NOT NULL AND candidate_id IS NULL)
      );
    `);
    // One pipeline entry per candidate/applicant per job — shortlisting
    // twice is a no-op, not a duplicate row (see jdController's shortlist
    // endpoint for how it surfaces that).
    await query(`
      CREATE UNIQUE INDEX job_applications_job_candidate_unique
        ON job_applications (job_id, candidate_id) WHERE candidate_id IS NOT NULL;
    `);
    await query(`
      CREATE UNIQUE INDEX job_applications_job_external_unique
        ON job_applications (job_id, external_applicant_id) WHERE external_applicant_id IS NOT NULL;
    `);
    await query(`CREATE INDEX job_applications_candidate_idx ON job_applications (candidate_id);`);

    // ---------------------------------------------------------------
    // RLS
    // ---------------------------------------------------------------
    await query(`ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE job_applications FORCE ROW LEVEL SECURITY;`);

    await query(`
      CREATE POLICY job_applications_company ON job_applications FOR ALL
        USING (
          ${roleIs('company')} AND EXISTS (
            SELECT 1 FROM jobs j WHERE j.id = job_id AND j.company_id = ${selfId}
          )
        )
        WITH CHECK (
          ${roleIs('company')} AND EXISTS (
            SELECT 1 FROM jobs j WHERE j.id = job_id AND j.company_id = ${selfId}
          )
        );
    `);
    // A Verified candidate reads their own "My Applications" list — see
    // candidateController.listMyApplications.
    await query(`
      CREATE POLICY job_applications_candidate_select ON job_applications FOR SELECT
        USING (${roleIs('candidate')} AND candidate_id = ${selfId});
    `);
    await query(`
      CREATE POLICY job_applications_admin ON job_applications FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // Cross-role read gap this table exposes: a candidate's "My
    // Applications" view (candidateController.listMyApplications) needs to
    // read the `jobs` row and the company's `company_profiles` row behind
    // its own applications, and neither table has ever had a
    // candidate-facing policy. This project has a repeated history of this
    // exact kind of gap (companies/verifiers needing to read a `users` row
    // they don't own, across Phases 1/3/4/7) — added here up front rather
    // than discovered after the fact.
    // ---------------------------------------------------------------
    await query(`
      CREATE POLICY jobs_select_candidate_applicant ON jobs FOR SELECT
        USING (
          ${roleIs('candidate')} AND EXISTS (
            SELECT 1 FROM job_applications ja WHERE ja.job_id = jobs.id AND ja.candidate_id = ${selfId}
          )
        );
    `);
    await query(`
      CREATE POLICY company_profiles_select_candidate_applicant ON company_profiles FOR SELECT
        USING (
          ${roleIs('candidate')} AND EXISTS (
            SELECT 1 FROM job_applications ja
            JOIN jobs j ON j.id = ja.job_id
            WHERE j.company_id = company_profiles.user_id AND ja.candidate_id = ${selfId}
          )
        );
    `);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`DROP POLICY IF EXISTS company_profiles_select_candidate_applicant ON company_profiles;`);
    await query(`DROP POLICY IF EXISTS jobs_select_candidate_applicant ON jobs;`);
    await queryInterface.dropTable('job_applications');

    for (const enumType of ENUM_TYPES) {
      await query(`DROP TYPE IF EXISTS ${enumType.name};`);
    }
  },
};
