'use strict';

/**
 * End-to-End Job Catalog & Hiring Pipeline (Feature 2) — Phase 10: offer &
 * joining. Columns exactly as spec'd:
 *   offers (id, application_id, offer_letter_link, status: sent/accepted/
 *     declined, sent_at, responded_at)
 *   joining_formalities (id, application_id, documents jsonb, bgv_status:
 *     pending/in_progress/cleared/flagged, bgv_agency_name, bgv_updated_at)
 *
 * BGV is a manual field the company/admin updates — no live BGV API
 * integration (spec, explicitly). `offer_letter_link` and each entry in
 * `documents` are links, not uploaded binaries — same convention as
 * resume_link/portfolio_link/candidate_verification_documents.document_link
 * elsewhere in this schema; this app never stores document bytes.
 *
 * One offer and one joining_formalities row per application — both unique
 * on application_id.
 */

const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;
const admin = `current_setting('app.current_user_role', true) = 'admin'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;

const ENUM_TYPES = [
  { name: 'offer_status', values: ['sent', 'accepted', 'declined'] },
  { name: 'bgv_status', values: ['pending', 'in_progress', 'cleared', 'flagged'] },
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

    // ---------------------------------------------------------------
    // offers
    // ---------------------------------------------------------------
    await queryInterface.createTable('offers', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: literal('gen_random_uuid()'),
      },
      application_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'job_applications', key: 'id' },
        onDelete: 'CASCADE',
      },
      offer_letter_link: { type: DataTypes.STRING, allowNull: false },
      status: { type: 'offer_status', allowNull: false, defaultValue: 'sent' },
      sent_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('now()') },
      responded_at: { type: DataTypes.DATE, allowNull: true },
    });

    // ---------------------------------------------------------------
    // joining_formalities
    // ---------------------------------------------------------------
    await queryInterface.createTable('joining_formalities', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: literal('gen_random_uuid()'),
      },
      application_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'job_applications', key: 'id' },
        onDelete: 'CASCADE',
      },
      // Array of {docType, link} — e.g. ID proof, previous offer/relieving
      // letters (spec's examples). Links only, per the header note.
      documents: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      bgv_status: { type: 'bgv_status', allowNull: false, defaultValue: 'pending' },
      bgv_agency_name: { type: DataTypes.STRING, allowNull: true },
      bgv_updated_at: { type: DataTypes.DATE, allowNull: true },
    });

    // ---------------------------------------------------------------
    // RLS
    // ---------------------------------------------------------------
    for (const table of ['offers', 'joining_formalities']) {
      await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      await query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    }

    // offers: company sends/reads its own; candidate reads and updates
    // (accept/decline) their own; admin full. RLS is row-level, not
    // column-level, so the controller is what actually restricts a
    // candidate's write to status/responded_at only.
    await query(`
      CREATE POLICY offers_company ON offers FOR ALL
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
      CREATE POLICY offers_candidate ON offers FOR ALL
        USING (${roleIs('candidate')} AND EXISTS (
          SELECT 1 FROM job_applications ja WHERE ja.id = application_id AND ja.candidate_id = ${selfId}
        ))
        WITH CHECK (${roleIs('candidate')} AND EXISTS (
          SELECT 1 FROM job_applications ja WHERE ja.id = application_id AND ja.candidate_id = ${selfId}
        ));
    `);
    await query(`CREATE POLICY offers_admin ON offers FOR ALL USING (${admin}) WITH CHECK (${admin});`);

    // joining_formalities: same shape — company/admin own the BGV fields,
    // candidate owns the documents field, RLS covers the row for both and
    // the controller enforces which columns each role's endpoint touches.
    await query(`
      CREATE POLICY joining_formalities_company ON joining_formalities FOR ALL
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
      CREATE POLICY joining_formalities_candidate ON joining_formalities FOR ALL
        USING (${roleIs('candidate')} AND EXISTS (
          SELECT 1 FROM job_applications ja WHERE ja.id = application_id AND ja.candidate_id = ${selfId}
        ))
        WITH CHECK (${roleIs('candidate')} AND EXISTS (
          SELECT 1 FROM job_applications ja WHERE ja.id = application_id AND ja.candidate_id = ${selfId}
        ));
    `);
    await query(`CREATE POLICY joining_formalities_admin ON joining_formalities FOR ALL USING (${admin}) WITH CHECK (${admin});`);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await queryInterface.dropTable('joining_formalities');
    await queryInterface.dropTable('offers');

    for (const enumType of ENUM_TYPES) {
      await query(`DROP TYPE IF EXISTS ${enumType.name};`);
    }
  },
};
