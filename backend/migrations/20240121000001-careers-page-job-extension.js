'use strict';

/**
 * End-to-End Job Catalog & Hiring Pipeline (Feature 2 of the AI Packages &
 * ATS spec) — Phase 5: Careers Page & job extension. Backend-only phase, no
 * frontend (the public apply page and application flow are Phase 6).
 *
 * Extends `jobs` (created lean in Feature 1 Phase 1,
 * 20240118000001-relevancy-packages-foundation.js) additively — no existing
 * column is altered or dropped, so nothing from Feature 1 is disturbed.
 *
 * `custom_job_id` is the company's own tracking id (e.g. from their existing
 * ATS/HRIS), distinct from Hirepool's internal `jobs.id`. It's optional —
 * Feature 1 jobs (JD-only, no ATS pipeline) never set one — and unique only
 * per company: a plain UNIQUE(company_id, custom_job_id) constraint already
 * allows unlimited NULLs (Postgres treats NULLs as distinct under a regular
 * unique constraint), so this needs no partial-index trick.
 *
 * `careers_link_slug` is set by a separate action (POST .../careers-link,
 * see jdController.generateCareersLink) rather than at job creation — the
 * spec has the company choose the application form type *when generating
 * the link*, which is a distinct step from creating the job itself.
 *
 * RLS: this DOES need one new policy, despite every new column being
 * covered row-level by the existing `jobs_owner`/`jobs_admin` policies —
 * those only match a `company`/`admin` session role. The public careers
 * page (Phase 5's other deliverable, careersController.getJobBySlug) reads
 * a job with NO session at all (runInRequestContext(null, ...) — an
 * applicant has never logged in), which neither existing policy matches,
 * so without an addition here the endpoint would read zero rows. Added
 * below: `jobs_select_public_careers_link`, scoped to
 * `careers_link_slug IS NOT NULL` — once a company has generated a careers
 * link for a job, that job's own fields become publicly readable (not the
 * fact that it exists before a link is generated, and not any other
 * company's jobs). Same shape as `contests_select_published` gating on
 * `published = true`.
 */

const admin = `current_setting('app.current_user_role', true) = 'admin'`;

const ENUM_TYPES = [
  { name: 'job_status', values: ['open', 'closed'] },
  { name: 'application_form_type', values: ['simple', 'detailed', 'foreign', 'custom'] },
];

// Seed field templates for the three presets. `custom` has no rows here —
// a company building a custom form supplies its own field list directly as
// jobs.custom_form_schema (see the Zod schema in jdController.ts), which is
// exactly this same field shape so the careers-page renderer (Phase 6)
// treats a preset template and a custom schema identically.
const SEED_FIELDS = [
  // ----- simple: name, contact, the minimum needed to score relevancy -----
  { formType: 'simple', fieldKey: 'full_name', fieldLabel: 'Full name', fieldType: 'text', isRequired: true, sortOrder: 1 },
  { formType: 'simple', fieldKey: 'email', fieldLabel: 'Email', fieldType: 'text', isRequired: true, sortOrder: 2 },
  { formType: 'simple', fieldKey: 'phone', fieldLabel: 'Phone', fieldType: 'text', isRequired: true, sortOrder: 3 },
  { formType: 'simple', fieldKey: 'role', fieldLabel: 'Role applying for', fieldType: 'text', isRequired: true, sortOrder: 4 },
  { formType: 'simple', fieldKey: 'years_of_experience', fieldLabel: 'Years of experience', fieldType: 'number', isRequired: true, sortOrder: 5 },
  { formType: 'simple', fieldKey: 'skills', fieldLabel: 'Key skills (comma-separated)', fieldType: 'text', isRequired: true, sortOrder: 6 },

  // ----- detailed: simple + full work history, education, in-depth fields -----
  { formType: 'detailed', fieldKey: 'full_name', fieldLabel: 'Full name', fieldType: 'text', isRequired: true, sortOrder: 1 },
  { formType: 'detailed', fieldKey: 'email', fieldLabel: 'Email', fieldType: 'text', isRequired: true, sortOrder: 2 },
  { formType: 'detailed', fieldKey: 'phone', fieldLabel: 'Phone', fieldType: 'text', isRequired: true, sortOrder: 3 },
  { formType: 'detailed', fieldKey: 'role', fieldLabel: 'Role applying for', fieldType: 'text', isRequired: true, sortOrder: 4 },
  { formType: 'detailed', fieldKey: 'years_of_experience', fieldLabel: 'Years of experience', fieldType: 'number', isRequired: true, sortOrder: 5 },
  { formType: 'detailed', fieldKey: 'skills', fieldLabel: 'Key skills (comma-separated)', fieldType: 'text', isRequired: true, sortOrder: 6 },
  { formType: 'detailed', fieldKey: 'current_company', fieldLabel: 'Current company', fieldType: 'text', isRequired: false, sortOrder: 7 },
  { formType: 'detailed', fieldKey: 'current_designation', fieldLabel: 'Current designation', fieldType: 'text', isRequired: false, sortOrder: 8 },
  { formType: 'detailed', fieldKey: 'work_history', fieldLabel: 'Work history summary', fieldType: 'textarea', isRequired: false, sortOrder: 9 },
  { formType: 'detailed', fieldKey: 'education_institution', fieldLabel: 'Institution', fieldType: 'text', isRequired: false, sortOrder: 10 },
  { formType: 'detailed', fieldKey: 'education_degree', fieldLabel: 'Degree', fieldType: 'text', isRequired: false, sortOrder: 11 },
  { formType: 'detailed', fieldKey: 'education_year', fieldLabel: 'Graduation year', fieldType: 'number', isRequired: false, sortOrder: 12 },
  {
    formType: 'detailed',
    fieldKey: 'notice_period',
    fieldLabel: 'Notice period',
    fieldType: 'select',
    isRequired: false,
    sortOrder: 13,
    options: ['Immediate', '15 days', '30 days', '60 days', '90+ days'],
  },
  { formType: 'detailed', fieldKey: 'portfolio_link', fieldLabel: 'Portfolio link', fieldType: 'text', isRequired: false, sortOrder: 14 },
  { formType: 'detailed', fieldKey: 'cover_note', fieldLabel: 'Cover note', fieldType: 'textarea', isRequired: false, sortOrder: 15 },

  // ----- foreign: simple + international-candidate fields -----
  { formType: 'foreign', fieldKey: 'full_name', fieldLabel: 'Full name', fieldType: 'text', isRequired: true, sortOrder: 1 },
  { formType: 'foreign', fieldKey: 'email', fieldLabel: 'Email', fieldType: 'text', isRequired: true, sortOrder: 2 },
  { formType: 'foreign', fieldKey: 'phone', fieldLabel: 'Phone', fieldType: 'text', isRequired: true, sortOrder: 3 },
  { formType: 'foreign', fieldKey: 'role', fieldLabel: 'Role applying for', fieldType: 'text', isRequired: true, sortOrder: 4 },
  { formType: 'foreign', fieldKey: 'years_of_experience', fieldLabel: 'Years of experience', fieldType: 'number', isRequired: true, sortOrder: 5 },
  { formType: 'foreign', fieldKey: 'skills', fieldLabel: 'Key skills (comma-separated)', fieldType: 'text', isRequired: true, sortOrder: 6 },
  { formType: 'foreign', fieldKey: 'nationality', fieldLabel: 'Nationality', fieldType: 'text', isRequired: true, sortOrder: 7 },
  {
    formType: 'foreign',
    fieldKey: 'visa_status',
    fieldLabel: 'Passport / visa status',
    fieldType: 'text',
    isRequired: true,
    sortOrder: 8,
  },
  { formType: 'foreign', fieldKey: 'work_authorization_status', fieldLabel: 'Work authorization status', fieldType: 'text', isRequired: true, sortOrder: 9 },
  {
    formType: 'foreign',
    fieldKey: 'relocation_willingness',
    fieldLabel: 'Willing to relocate?',
    fieldType: 'select',
    isRequired: true,
    sortOrder: 10,
    options: ['Yes', 'No', 'Depends on location'],
  },
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
    // jobs — additive columns
    // ---------------------------------------------------------------
    await queryInterface.addColumn('jobs', 'custom_job_id', { type: DataTypes.STRING, allowNull: true });
    await queryInterface.addColumn('jobs', 'status', {
      type: 'job_status',
      allowNull: false,
      defaultValue: 'open',
    });
    await queryInterface.addColumn('jobs', 'careers_link_slug', {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    });
    await queryInterface.addColumn('jobs', 'form_type', { type: 'application_form_type', allowNull: true });
    await queryInterface.addColumn('jobs', 'custom_form_schema', { type: DataTypes.JSONB, allowNull: true });
    await queryInterface.addColumn('jobs', 'closed_at', { type: DataTypes.DATE, allowNull: true });

    await query(`
      ALTER TABLE jobs ADD CONSTRAINT jobs_company_custom_job_id_unique UNIQUE (company_id, custom_job_id);
    `);

    // See header comment — public (no-session) read for jobs that have a
    // careers link, so the public careers page can read them at all.
    await query(`
      CREATE POLICY jobs_select_public_careers_link ON jobs FOR SELECT
        USING (careers_link_slug IS NOT NULL);
    `);

    // ---------------------------------------------------------------
    // application_forms_master
    // ---------------------------------------------------------------
    await queryInterface.createTable('application_forms_master', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: literal('gen_random_uuid()') },
      form_type: { type: 'application_form_type', allowNull: false },
      field_key: { type: DataTypes.STRING, allowNull: false },
      field_label: { type: DataTypes.STRING, allowNull: false },
      // Free-text rather than another enum — this vocabulary ('text' /
      // 'textarea' / 'number' / 'select' / 'checkbox' / 'date') is shared
      // with jobs.custom_form_schema's per-field shape (see jdController's
      // customFormFieldSchema), so a careers-page renderer treats a preset
      // template row and a custom-schema field identically without a type
      // mismatch between an Postgres enum and free-form JSON.
      field_type: { type: DataTypes.STRING, allowNull: false },
      is_required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // Only meaningful for field_type = 'select'; array of option strings.
      options: { type: DataTypes.JSONB, allowNull: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('now()') },
    });
    await query(`
      CREATE UNIQUE INDEX application_forms_master_type_key_unique
        ON application_forms_master (form_type, field_key);
    `);

    await query(`ALTER TABLE application_forms_master ENABLE ROW LEVEL SECURITY;`);
    await query(`ALTER TABLE application_forms_master FORCE ROW LEVEL SECURITY;`);
    await query(`
      CREATE POLICY application_forms_master_select_all ON application_forms_master FOR SELECT
        USING (true);
    `);
    await query(`
      CREATE POLICY application_forms_master_admin ON application_forms_master FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    await queryInterface.bulkInsert(
      'application_forms_master',
      SEED_FIELDS.map((f) => ({
        id: literal('gen_random_uuid()'),
        form_type: f.formType,
        field_key: f.fieldKey,
        field_label: f.fieldLabel,
        field_type: f.fieldType,
        is_required: f.isRequired,
        options: f.options ? JSON.stringify(f.options) : null,
        sort_order: f.sortOrder,
        created_at: literal('now()'),
      })),
    );
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await queryInterface.dropTable('application_forms_master');

    await query(`DROP POLICY IF EXISTS jobs_select_public_careers_link ON jobs;`);
    await query(`ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_company_custom_job_id_unique;`);
    await queryInterface.removeColumn('jobs', 'closed_at');
    await queryInterface.removeColumn('jobs', 'custom_form_schema');
    await queryInterface.removeColumn('jobs', 'form_type');
    await queryInterface.removeColumn('jobs', 'careers_link_slug');
    await queryInterface.removeColumn('jobs', 'status');
    await queryInterface.removeColumn('jobs', 'custom_job_id');

    for (const enumType of ENUM_TYPES) {
      await query(`DROP TYPE IF EXISTS ${enumType.name};`);
    }
  },
};
