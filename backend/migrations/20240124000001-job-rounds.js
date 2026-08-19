'use strict';

/**
 * End-to-End Job Catalog & Hiring Pipeline (Feature 2) — Phase 8: coding &
 * MCQ rounds. Backend only this phase — round/question management UI,
 * candidate round-taking UI, and the sql.js in-browser grading for SQL
 * custom questions are frontend work not built here (see
 * FEATURE2_PHASE8_SUMMARY.md).
 *
 * ── Design notes, since the spec's own DB list needed filling in ─────────
 *
 * "Hirepool's master coding question dataset" (spec, MCQ/Coding round
 * bullets) is NOT a new table — it's the existing `contest_questions`
 * table (type='coding'), reused as-is. The spec's DB additions list for
 * this feature only adds `custom_coding_questions` (company-private), not
 * a second public coding bank, which only makes sense if the public bank
 * already exists — it does, from the Contest module. This is also why
 * `custom_coding_questions` mirrors ContestQuestion's content shape
 * (starter code / sample+hidden test cases) closely: codeRunner.ts and its
 * grading logic (executeAgainstCases) are shared, not duplicated, across
 * both.
 *
 * `mcq_master` gets nullable `company_id`/`job_id` columns rather than a
 * second "custom MCQs" table — the spec lists only one new MCQ table, and
 * "company can... add their own MCQs manually for a job-specific round"
 * needs storage somewhere. A nullable company_id (null = public/admin-
 * curated bank) is the same scoping shape already used elsewhere in this
 * schema rather than a genuinely new pattern.
 *
 * `job_round_questions` is a new link table the spec's list doesn't
 * mention but a round cannot function without: it says which questions
 * (from any of the three sources above) belong to which round, in what
 * order, worth how many points. `question_id` is polymorphic — no FK,
 * since it points at three different tables depending on
 * `question_source` — same pattern already used by
 * verification_logs.target_type/target_id.
 *
 * `job_round_results.submission_detail` (jsonb) folds what would otherwise
 * be a whole parallel ContestAttempt/ContestQuestionResponse-style system
 * into one column: per-question responses, pass/fail, and points for
 * whichever attempt a candidate submitted for a round. Scoped down for
 * this phase rather than building a fully relational per-question response
 * table — see the summary for the tradeoff.
 *
 * `job_applications.current_round_id` gets its FK constraint here, now
 * that `job_rounds` exists — flagged as deferred in Phase 7's migration.
 */

const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;
const admin = `current_setting('app.current_user_role', true) = 'admin'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;

const ENUM_TYPES = [
  { name: 'job_round_type', values: ['coding', 'mcq', 'interview', 'custom'] },
  { name: 'job_round_question_source', values: ['contest_question', 'custom_coding_question', 'mcq_master'] },
  { name: 'job_round_result', values: ['pass', 'fail', 'hold'] },
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

    const uuidPk = {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: literal('gen_random_uuid()'),
    };
    const createdAtNow = { type: DataTypes.DATE, allowNull: false, defaultValue: literal('now()') };

    // ---------------------------------------------------------------
    // job_rounds
    // ---------------------------------------------------------------
    await queryInterface.createTable('job_rounds', {
      id: uuidPk,
      job_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'jobs', key: 'id' }, onDelete: 'CASCADE' },
      round_name: { type: DataTypes.STRING, allowNull: false },
      round_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      round_type: { type: 'job_round_type', allowNull: false },
      created_at: createdAtNow,
      updated_at: createdAtNow,
    });
    await query(`CREATE INDEX job_rounds_job_order_idx ON job_rounds (job_id, round_order);`);

    // ---------------------------------------------------------------
    // custom_coding_questions
    // ---------------------------------------------------------------
    await queryInterface.createTable('custom_coding_questions', {
      id: uuidPk,
      company_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      // Nullable — a question with no job_id is reusable across the
      // company's jobs; one scoped to a job is private to it.
      job_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'jobs', key: 'id' }, onDelete: 'CASCADE' },
      title: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false },
      // { parameters: [{name,type}], returnType } — spec's "parameter
      // names/types, return type".
      function_signature: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      // Per-language starting scaffold — same shape as
      // ContestQuestion.content.starterCode.
      starter_code: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      sample_test_cases: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      hidden_test_cases: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      // Array of codeRunner.ts language ids this question supports, plus
      // 'sql' as a sentinel when is_sql is true (codeRunner.ts itself has
      // no SQL provider — see the header note on is_sql below).
      language_support: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      // SQL questions are graded client-side via sql.js (spec: "a free
      // in-browser SQLite engine... zero cost") — NOT by codeRunner.ts,
      // which has no SQL provider. A submission for an is_sql question
      // carries a client-computed result rather than server-executed
      // output; see careersController-equivalent note in
      // jobRoundController.submitRoundAttempt. This is a real, spec-driven
      // trust boundary: SQL grading is not independently verified
      // server-side, unlike every other language here.
      is_sql: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: createdAtNow,
      updated_at: createdAtNow,
    });
    await query(`CREATE INDEX custom_coding_questions_company_idx ON custom_coding_questions (company_id, job_id);`);

    // ---------------------------------------------------------------
    // mcq_master (public bank when company_id IS NULL; company-private,
    // optionally job-scoped, otherwise)
    // ---------------------------------------------------------------
    await queryInterface.createTable('mcq_master', {
      id: uuidPk,
      concept_or_language: { type: DataTypes.STRING, allowNull: false },
      question: { type: DataTypes.TEXT, allowNull: false },
      options: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      correct_answer: { type: DataTypes.INTEGER, allowNull: false },
      company_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      job_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'jobs', key: 'id' }, onDelete: 'CASCADE' },
      created_at: createdAtNow,
    });
    await query(`CREATE INDEX mcq_master_concept_idx ON mcq_master (concept_or_language);`);
    await query(`CREATE INDEX mcq_master_company_idx ON mcq_master (company_id, job_id);`);

    // ---------------------------------------------------------------
    // job_round_questions — link table (see header note)
    // ---------------------------------------------------------------
    await queryInterface.createTable('job_round_questions', {
      id: uuidPk,
      round_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'job_rounds', key: 'id' }, onDelete: 'CASCADE' },
      question_source: { type: 'job_round_question_source', allowNull: false },
      question_id: { type: DataTypes.UUID, allowNull: false },
      points: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: createdAtNow,
    });
    await query(`
      CREATE UNIQUE INDEX job_round_questions_unique
        ON job_round_questions (round_id, question_source, question_id);
    `);

    // ---------------------------------------------------------------
    // job_round_results
    // ---------------------------------------------------------------
    await queryInterface.createTable('job_round_results', {
      id: uuidPk,
      application_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'job_applications', key: 'id' }, onDelete: 'CASCADE' },
      round_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'job_rounds', key: 'id' }, onDelete: 'CASCADE' },
      // Null until the company decides — a fresh auto-graded submission is
      // "scored but not yet reviewed", not implicitly pass or fail.
      result: { type: 'job_round_result', allowNull: true },
      score: { type: DataTypes.INTEGER, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      // Candidate's raw attempt (per-question responses/pass-fail) for
      // coding/mcq rounds — see header note. Null for interview-type
      // rounds (Phase 9), which have no candidate-submitted artifact.
      submission_detail: { type: DataTypes.JSONB, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      updated_at: createdAtNow,
    });
    await query(`
      CREATE UNIQUE INDEX job_round_results_application_round_unique
        ON job_round_results (application_id, round_id);
    `);

    // current_round_id's FK, deferred from Phase 7 (job_rounds didn't
    // exist yet).
    await query(`
      ALTER TABLE job_applications ADD CONSTRAINT job_applications_current_round_fk
        FOREIGN KEY (current_round_id) REFERENCES job_rounds (id) ON DELETE SET NULL;
    `);

    // ---------------------------------------------------------------
    // RLS
    // ---------------------------------------------------------------
    const allTables = [
      'job_rounds',
      'custom_coding_questions',
      'mcq_master',
      'job_round_questions',
      'job_round_results',
    ];
    for (const table of allTables) {
      await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      await query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    }

    // job_rounds: company owns its own job's rounds; a candidate with an
    // application on that job can read them (to see what's ahead); admin
    // full.
    await query(`
      CREATE POLICY job_rounds_company ON job_rounds FOR ALL
        USING (${roleIs('company')} AND EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_id AND j.company_id = ${selfId}))
        WITH CHECK (${roleIs('company')} AND EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_id AND j.company_id = ${selfId}));
    `);
    await query(`
      CREATE POLICY job_rounds_select_candidate_applicant ON job_rounds FOR SELECT
        USING (${roleIs('candidate')} AND EXISTS (
          SELECT 1 FROM job_applications ja WHERE ja.job_id = job_rounds.job_id AND ja.candidate_id = ${selfId}
        ));
    `);
    await query(`CREATE POLICY job_rounds_admin ON job_rounds FOR ALL USING (${admin}) WITH CHECK (${admin});`);

    // custom_coding_questions: company owns its own; a candidate can read
    // one only while it's actually attached to a round on a job they've
    // applied to (controller still strips hidden_test_cases — RLS is
    // row-level, same caveat as contest_questions).
    await query(`
      CREATE POLICY custom_coding_questions_company ON custom_coding_questions FOR ALL
        USING (${roleIs('company')} AND company_id = ${selfId})
        WITH CHECK (${roleIs('company')} AND company_id = ${selfId});
    `);
    await query(`
      CREATE POLICY custom_coding_questions_select_candidate ON custom_coding_questions FOR SELECT
        USING (${roleIs('candidate')} AND EXISTS (
          SELECT 1 FROM job_round_questions jrq
          JOIN job_rounds r ON r.id = jrq.round_id
          JOIN job_applications ja ON ja.job_id = r.job_id
          WHERE jrq.question_source = 'custom_coding_question'
            AND jrq.question_id = custom_coding_questions.id
            AND ja.candidate_id = ${selfId}
        ));
    `);
    await query(`CREATE POLICY custom_coding_questions_admin ON custom_coding_questions FOR ALL USING (${admin}) WITH CHECK (${admin});`);

    // mcq_master: public bank (company_id IS NULL) readable by anyone
    // signed in; a company owns its own custom rows; a candidate can also
    // read a company's custom row while it's attached to a round they're
    // on (same shape as custom_coding_questions above). correct_answer is
    // stripped by the controller before a candidate ever sees a question,
    // same "RLS is row-level, not column-level" caveat as everywhere else
    // in this schema.
    await query(`
      CREATE POLICY mcq_master_select_public ON mcq_master FOR SELECT
        USING (company_id IS NULL);
    `);
    await query(`
      CREATE POLICY mcq_master_company ON mcq_master FOR ALL
        USING (${roleIs('company')} AND company_id = ${selfId})
        WITH CHECK (${roleIs('company')} AND company_id = ${selfId});
    `);
    await query(`
      CREATE POLICY mcq_master_select_candidate ON mcq_master FOR SELECT
        USING (${roleIs('candidate')} AND EXISTS (
          SELECT 1 FROM job_round_questions jrq
          JOIN job_rounds r ON r.id = jrq.round_id
          JOIN job_applications ja ON ja.job_id = r.job_id
          WHERE jrq.question_source = 'mcq_master'
            AND jrq.question_id = mcq_master.id
            AND ja.candidate_id = ${selfId}
        ));
    `);
    await query(`CREATE POLICY mcq_master_admin ON mcq_master FOR ALL USING (${admin}) WITH CHECK (${admin});`);

    // job_round_questions: company manages its own job's rounds; a
    // candidate reads the question list for a round on a job they've
    // applied to (needed to take the round at all).
    await query(`
      CREATE POLICY job_round_questions_company ON job_round_questions FOR ALL
        USING (${roleIs('company')} AND EXISTS (
          SELECT 1 FROM job_rounds r JOIN jobs j ON j.id = r.job_id
          WHERE r.id = round_id AND j.company_id = ${selfId}
        ))
        WITH CHECK (${roleIs('company')} AND EXISTS (
          SELECT 1 FROM job_rounds r JOIN jobs j ON j.id = r.job_id
          WHERE r.id = round_id AND j.company_id = ${selfId}
        ));
    `);
    await query(`
      CREATE POLICY job_round_questions_select_candidate ON job_round_questions FOR SELECT
        USING (${roleIs('candidate')} AND EXISTS (
          SELECT 1 FROM job_rounds r JOIN job_applications ja ON ja.job_id = r.job_id
          WHERE r.id = round_id AND ja.candidate_id = ${selfId}
        ));
    `);
    await query(`CREATE POLICY job_round_questions_admin ON job_round_questions FOR ALL USING (${admin}) WITH CHECK (${admin});`);

    // job_round_results: company manages results for its own jobs
    // (decision: result/notes). A candidate can INSERT/SELECT/UPDATE their
    // own row (submitting an attempt: score/submission_detail) — RLS
    // cannot restrict this to ONLY those columns (row-level, not
    // column-level), so the controller is what actually prevents a
    // candidate-facing endpoint from ever writing result/notes/updated_by;
    // see jobRoundController.submitRoundAttempt's comment.
    await query(`
      CREATE POLICY job_round_results_company ON job_round_results FOR ALL
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
      CREATE POLICY job_round_results_candidate ON job_round_results FOR ALL
        USING (${roleIs('candidate')} AND EXISTS (
          SELECT 1 FROM job_applications ja WHERE ja.id = application_id AND ja.candidate_id = ${selfId}
        ))
        WITH CHECK (${roleIs('candidate')} AND EXISTS (
          SELECT 1 FROM job_applications ja WHERE ja.id = application_id AND ja.candidate_id = ${selfId}
        ));
    `);
    await query(`CREATE POLICY job_round_results_admin ON job_round_results FOR ALL USING (${admin}) WITH CHECK (${admin});`);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`ALTER TABLE job_applications DROP CONSTRAINT IF EXISTS job_applications_current_round_fk;`);

    await queryInterface.dropTable('job_round_results');
    await queryInterface.dropTable('job_round_questions');
    await queryInterface.dropTable('mcq_master');
    await queryInterface.dropTable('custom_coding_questions');
    await queryInterface.dropTable('job_rounds');

    for (const enumType of ENUM_TYPES) {
      await query(`DROP TYPE IF EXISTS ${enumType.name};`);
    }
  },
};
