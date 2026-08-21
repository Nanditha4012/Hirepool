'use strict';

/**
 * End-to-End Job Catalog & Hiring Pipeline (Feature 2) — Phase 9: interview
 * round. Per the build plan: interview_sessions (meeting_link,
 * scheduled_at, status), Jitsi room-link generation, a scheduling
 * endpoint. Backend only.
 *
 * One session per (application, round) — a round has at most one
 * scheduled interview for a given application.
 */

const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;
const admin = `current_setting('app.current_user_role', true) = 'admin'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;

const INTERVIEW_STATUS_ENUM = { name: 'interview_session_status', values: ['scheduled', 'completed', 'cancelled'] };

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes, literal } = Sequelize;
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`
      DO $$ BEGIN
        CREATE TYPE ${INTERVIEW_STATUS_ENUM.name} AS ENUM (${INTERVIEW_STATUS_ENUM.values.map((v) => `'${v}'`).join(', ')});
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryInterface.createTable('interview_sessions', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: literal('gen_random_uuid()'),
      },
      application_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'job_applications', key: 'id' },
        onDelete: 'CASCADE',
      },
      round_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'job_rounds', key: 'id' },
        onDelete: 'CASCADE',
      },
      meeting_link: { type: DataTypes.STRING, allowNull: false },
      scheduled_at: { type: DataTypes.DATE, allowNull: false },
      status: { type: INTERVIEW_STATUS_ENUM.name, allowNull: false, defaultValue: 'scheduled' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('now()') },
    });
    await query(`
      CREATE UNIQUE INDEX interview_sessions_application_round_unique
        ON interview_sessions (application_id, round_id);
    `);

    // ---------------------------------------------------------------
    // RLS
    // ---------------------------------------------------------------
    await query(`ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE interview_sessions FORCE ROW LEVEL SECURITY;`);

    await query(`
      CREATE POLICY interview_sessions_company ON interview_sessions FOR ALL
        USING (${roleIs('company')} AND EXISTS (
          SELECT 1 FROM job_applications ja JOIN jobs j ON j.id = ja.job_id
          WHERE ja.id = application_id AND j.company_id = ${selfId}
        ))
        WITH CHECK (${roleIs('company')} AND EXISTS (
          SELECT 1 FROM job_applications ja JOIN jobs j ON j.id = ja.job_id
          WHERE ja.id = application_id AND j.company_id = ${selfId}
        ));
    `);
    await query(`
      CREATE POLICY interview_sessions_select_candidate ON interview_sessions FOR SELECT
        USING (${roleIs('candidate')} AND EXISTS (
          SELECT 1 FROM job_applications ja WHERE ja.id = application_id AND ja.candidate_id = ${selfId}
        ));
    `);
    await query(`CREATE POLICY interview_sessions_admin ON interview_sessions FOR ALL USING (${admin}) WITH CHECK (${admin});`);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);
    await queryInterface.dropTable('interview_sessions');
    await query(`DROP TYPE IF EXISTS ${INTERVIEW_STATUS_ENUM.name};`);
  },
};
