'use strict';

/**
 * AI Relevancy Packages (Feature 1 of the AI Packages & ATS spec) — Phase 1:
 * schema foundation only. No scoring logic lives here yet (that's Phase 2);
 * this migration just creates the tables, enum, RLS, and seeds the
 * admin-editable config values the scoring/purchase phases will read.
 *
 * `jobs` is deliberately lean here — id/company_id/title/description/status/
 * created_at. Feature 2 (the ATS) will ADD columns to this same table
 * (custom_job_id, careers_link_slug, form_type, custom_form_schema,
 * closed_at) in a later, additive migration rather than this one declaring
 * them upfront unused.
 *
 * Follows the conventions of 20240110000001-contest-module.js exactly —
 * idempotent `DO $$ ... EXCEPTION WHEN duplicate_object` enum creation, the
 * uuidPk/createdAtNow helpers, and the admin/roleIs/selfId RLS helpers from
 * 20240101000004-enable-rls-and-policies.js.
 *
 * ── A note on candidate_relevancy_scores RLS ─────────────────────────────
 * This phase only creates the table; Phase 2 builds the actual recompute
 * logic (event-triggered on candidate approval, and on JD create/edit — see
 * AI_PACKAGES_ATS_BUILD_PLAN.md). Because a JD edit is a company-role
 * request but an approval is a verifier-role request, this table needs
 * writes from both roles. For now: verifier gets a blanket write policy
 * (mirrors how verifiers already write broadly across the review pipeline),
 * company gets SELECT-only on their own jobs' scores. If Phase 2 ends up
 * running JD-edit recompute inside the company's own request transaction
 * (rather than deferring it to a verifier/admin-triggered path), this will
 * need a company WITH CHECK write policy added then — flagged here so it
 * isn't forgotten.
 */

const admin = `current_setting('app.current_user_role', true) = 'admin'`;
const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;

const ENUM_TYPES = [
  { name: 'relevancy_tier', values: ['100_percent', '90_plus', '75_plus', '50_plus'] },
  {
    name: 'job_requirement_parse_status',
    values: ['pending', 'success', 'failed', 'unavailable'],
  },
];

const JD_PARSING_PROMPT_TEMPLATE = `You are extracting structured hiring requirements from a job description. Given a job title and description, return ONLY a JSON object with this exact shape:
{"requiredSkills": string[], "role": string, "minimumExperienceYears": number, "domain": string}

- requiredSkills: specific technical/professional skills mentioned or clearly implied, as short strings.
- role: the closest single job title match for this position.
- minimumExperienceYears: your best-estimate minimum years of experience required (0 if entry-level or not specified).
- domain: the industry/domain this role belongs to.

Return only the JSON object, no other text.`;

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes, literal } = Sequelize;
    const query = (sql) => queryInterface.sequelize.query(sql);

    const uuidPk = {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: literal('gen_random_uuid()'),
    };
    const createdAtNow = {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: literal('now()'),
    };

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
    // jobs (lean — see header note)
    // ---------------------------------------------------------------
    await queryInterface.createTable('jobs', {
      id: uuidPk,
      company_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      title: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      created_at: createdAtNow,
      updated_at: createdAtNow,
    });
    await query(`CREATE INDEX jobs_company_idx ON jobs (company_id, created_at DESC);`);

    // ---------------------------------------------------------------
    // job_requirements_parsed — one row per job, upserted on (re)parse
    // ---------------------------------------------------------------
    await queryInterface.createTable('job_requirements_parsed', {
      id: uuidPk,
      job_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'jobs', key: 'id' },
        onDelete: 'CASCADE',
      },
      extracted_skills: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      extracted_role: { type: DataTypes.STRING, allowNull: true },
      extracted_experience_level: { type: DataTypes.INTEGER, allowNull: true },
      extracted_domain: { type: DataTypes.STRING, allowNull: true },
      // Not in the spec's column list verbatim — added so the frontend can
      // distinguish "not parsed because Groq isn't configured" from "parsed,
      // and the model genuinely returned nothing" from "parse call failed",
      // rather than three states all looking like blank columns.
      parse_status: {
        type: 'job_requirement_parse_status',
        allowNull: false,
        defaultValue: 'pending',
      },
      parse_error: { type: DataTypes.TEXT, allowNull: true },
      created_at: createdAtNow,
      updated_at: createdAtNow,
    });

    // ---------------------------------------------------------------
    // candidate_relevancy_scores — one row per (job, candidate), upserted
    // on recompute
    // ---------------------------------------------------------------
    await queryInterface.createTable('candidate_relevancy_scores', {
      id: uuidPk,
      job_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'jobs', key: 'id' },
        onDelete: 'CASCADE',
      },
      candidate_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      relevancy_percent: { type: DataTypes.INTEGER, allowNull: false },
      tier: { type: 'relevancy_tier', allowNull: false },
      created_at: createdAtNow,
      updated_at: createdAtNow,
    });
    await query(`
      CREATE UNIQUE INDEX candidate_relevancy_scores_unique
        ON candidate_relevancy_scores (job_id, candidate_id);
    `);
    // Batch-card counts (Phase 2) are "how many candidates at tier X for job
    // Y" — this index is exactly that grouping.
    await query(`
      CREATE INDEX candidate_relevancy_scores_job_tier_idx
        ON candidate_relevancy_scores (job_id, tier);
    `);

    // ---------------------------------------------------------------
    // relevancy_packages — a purchased (or purchasable-and-not-yet-bought)
    // batch snapshot
    // ---------------------------------------------------------------
    await queryInterface.createTable('relevancy_packages', {
      id: uuidPk,
      job_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'jobs', key: 'id' },
        onDelete: 'CASCADE',
      },
      tier: { type: 'relevancy_tier', allowNull: false },
      candidate_count: { type: DataTypes.INTEGER, allowNull: false },
      price: { type: DataTypes.DECIMAL, allowNull: false },
      purchased_by_company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      purchased_at: { type: DataTypes.DATE, allowNull: true },
      downloaded_at: { type: DataTypes.DATE, allowNull: true },
      created_at: createdAtNow,
    });
    await query(`
      CREATE INDEX relevancy_packages_company_idx
        ON relevancy_packages (purchased_by_company_id, purchased_at DESC);
    `);

    // ---------------------------------------------------------------
    // relevancy_package_price_bands — admin-editable pricing config
    // ---------------------------------------------------------------
    await queryInterface.createTable('relevancy_package_price_bands', {
      id: uuidPk,
      label: { type: DataTypes.STRING, allowNull: false },
      min_candidates: { type: DataTypes.INTEGER, allowNull: false },
      // NULL = no upper bound (the 200+ "contact sales" band).
      max_candidates: { type: DataTypes.INTEGER, allowNull: true },
      // NULL = not self-serve priced; is_contact_sales carries the actual
      // meaning so the frontend never has to infer it from a null price.
      price: { type: DataTypes.DECIMAL, allowNull: true },
      is_contact_sales: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: createdAtNow,
      updated_at: createdAtNow,
    });

    // ---------------------------------------------------------------
    // RLS
    // ---------------------------------------------------------------
    const allTables = [
      'jobs',
      'job_requirements_parsed',
      'candidate_relevancy_scores',
      'relevancy_packages',
      'relevancy_package_price_bands',
    ];
    for (const table of allTables) {
      await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      await query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    }

    // jobs: company owns its own; admin full.
    await query(`
      CREATE POLICY jobs_owner ON jobs FOR ALL
        USING (${roleIs('company')} AND company_id = ${selfId})
        WITH CHECK (${roleIs('company')} AND company_id = ${selfId});
    `);
    await query(`
      CREATE POLICY jobs_admin ON jobs FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // job_requirements_parsed: readable/writable by the owning company via
    // the parent job, plus admin.
    await query(`
      CREATE POLICY job_requirements_parsed_owner ON job_requirements_parsed FOR ALL
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
    await query(`
      CREATE POLICY job_requirements_parsed_admin ON job_requirements_parsed FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // candidate_relevancy_scores: see header note — company SELECT-only for
    // now, verifier gets write (approval-triggered recompute), admin full.
    await query(`
      CREATE POLICY candidate_relevancy_scores_select_company ON candidate_relevancy_scores FOR SELECT
        USING (
          ${roleIs('company')} AND EXISTS (
            SELECT 1 FROM jobs j WHERE j.id = job_id AND j.company_id = ${selfId}
          )
        );
    `);
    await query(`
      CREATE POLICY candidate_relevancy_scores_write_verifier ON candidate_relevancy_scores FOR ALL
        USING (${roleIs('verifier')})
        WITH CHECK (${roleIs('verifier')});
    `);
    await query(`
      CREATE POLICY candidate_relevancy_scores_admin ON candidate_relevancy_scores FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // relevancy_packages: owning company full access (Phase 3 purchase flow
    // creates these inside the company's own request context); admin full.
    await query(`
      CREATE POLICY relevancy_packages_owner ON relevancy_packages FOR ALL
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
    await query(`
      CREATE POLICY relevancy_packages_admin ON relevancy_packages FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // relevancy_package_price_bands: public read (same shape as
    // plans_master), admin-only write.
    await query(`
      CREATE POLICY relevancy_package_price_bands_select_all ON relevancy_package_price_bands FOR SELECT
        USING (true);
    `);
    await query(`
      CREATE POLICY relevancy_package_price_bands_admin ON relevancy_package_price_bands FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // Seed: jd_parsing_prompt_template (site_settings) + default price
    // bands. Placeholder prices — user explicitly asked for seeded
    // defaults, admin-editable via the price-bands admin CRUD, not
    // hardcoded launch numbers.
    // ---------------------------------------------------------------
    await query(`
      INSERT INTO site_settings ("key", "value")
      VALUES ('jd_parsing_prompt_template', $$${JD_PARSING_PROMPT_TEMPLATE}$$)
      ON CONFLICT ("key") DO NOTHING;
    `);

    await queryInterface.bulkInsert('relevancy_package_price_bands', [
      {
        id: literal('gen_random_uuid()'),
        label: '1–10 candidates',
        min_candidates: 1,
        max_candidates: 10,
        price: 999,
        is_contact_sales: false,
        sort_order: 1,
        created_at: literal('now()'),
        updated_at: literal('now()'),
      },
      {
        id: literal('gen_random_uuid()'),
        label: '11–50 candidates',
        min_candidates: 11,
        max_candidates: 50,
        price: 3999,
        is_contact_sales: false,
        sort_order: 2,
        created_at: literal('now()'),
        updated_at: literal('now()'),
      },
      {
        id: literal('gen_random_uuid()'),
        label: '51–200 candidates',
        min_candidates: 51,
        max_candidates: 200,
        price: 12999,
        is_contact_sales: false,
        sort_order: 3,
        created_at: literal('now()'),
        updated_at: literal('now()'),
      },
      {
        id: literal('gen_random_uuid()'),
        label: '200+ candidates',
        min_candidates: 201,
        max_candidates: null,
        price: null,
        is_contact_sales: true,
        sort_order: 4,
        created_at: literal('now()'),
        updated_at: literal('now()'),
      },
    ]);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`DELETE FROM site_settings WHERE "key" = 'jd_parsing_prompt_template';`);

    // Child-first, so the FK references drop cleanly.
    await queryInterface.dropTable('relevancy_package_price_bands');
    await queryInterface.dropTable('relevancy_packages');
    await queryInterface.dropTable('candidate_relevancy_scores');
    await queryInterface.dropTable('job_requirements_parsed');
    await queryInterface.dropTable('jobs');

    for (const enumType of ENUM_TYPES) {
      await query(`DROP TYPE IF EXISTS ${enumType.name};`);
    }
  },
};
