'use strict';

/**
 * Contest module: three contest types (DSA / Domain / Quant), each with
 * Easy/Medium/Hard tests, scored attempts, and per-type leaderboards.
 *
 * Follows the conventions of the earlier phase migrations exactly —
 * idempotent `DO $$ ... EXCEPTION WHEN duplicate_object` enum creation, the
 * uuidPk/createdAtNow helpers, and the `admin`/`roleIs`/`selfId` RLS
 * session-variable helpers from 20240101000004-enable-rls-and-policies.js.
 * DDL and RLS live in one file (as in the Phase 4 migration) because every
 * table here is new.
 *
 * Purely additive: no existing table or column is altered or dropped.
 *
 * ── A note on hidden test cases ──────────────────────────────────────────
 * `contest_questions.hidden_test_cases` holds the grading inputs a candidate
 * must never see. RLS is row-level, not column-level, so it cannot hide one
 * column from a role that is allowed to read the row — and candidates DO
 * need to read question rows in order to sit the test. Withholding that
 * column is therefore the controller's job (see
 * contestController.toCandidateQuestion, which is the single place question
 * rows are shaped for a candidate). This is called out here because the
 * usual "RLS is the real guard" reasoning does not apply to that one field.
 */

const admin = `current_setting('app.current_user_role', true) = 'admin'`;
const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;

const ENUM_TYPES = [
  { name: 'contest_type', values: ['dsa', 'domain', 'quant'] },
  { name: 'contest_complexity', values: ['easy', 'medium', 'hard'] },
  // 'interactive' covers the non-MCQ, non-coding question forms (drag-drop
  // ordering, fill-in-the-blank, multi-part scenario). The specific form is
  // carried inside `content.interactiveKind` rather than as another enum
  // value, so adding a fourth interactive form later is a content change,
  // not a migration.
  { name: 'contest_question_type', values: ['coding', 'mcq', 'interactive'] },
  { name: 'contest_section', values: ['math', 'reasoning', 'english'] },
];

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
    // contests
    // ---------------------------------------------------------------
    await queryInterface.createTable('contests', {
      id: uuidPk,
      type: { type: 'contest_type', allowNull: false },
      complexity: { type: 'contest_complexity', allowNull: false },
      title: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      time_limit_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
      published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: createdAtNow,
      updated_at: createdAtNow,
    });
    await query(`CREATE INDEX contests_type_complexity_idx ON contests (type, complexity);`);

    // ---------------------------------------------------------------
    // contest_questions
    // ---------------------------------------------------------------
    await queryInterface.createTable('contest_questions', {
      id: uuidPk,
      contest_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'contests', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: { type: 'contest_question_type', allowNull: false },
      /** Shape depends on `type` — see contestController's zod schemas. */
      content: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      correct_answer: { type: DataTypes.JSONB, allowNull: true },
      /** Drives the strengths/weak-areas summary on the score screen. */
      topic_tag: { type: DataTypes.STRING, allowNull: true },
      /** Quant only — null for DSA/Domain questions. */
      section: { type: 'contest_section', allowNull: true },
      sample_test_cases: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      hidden_test_cases: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      points: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: createdAtNow,
    });
    await query(`CREATE INDEX contest_questions_contest_idx ON contest_questions (contest_id, sort_order);`);

    // ---------------------------------------------------------------
    // contest_attempts
    // ---------------------------------------------------------------
    await queryInterface.createTable('contest_attempts', {
      id: uuidPk,
      candidate_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      contest_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'contests', key: 'id' },
        onDelete: 'CASCADE',
      },
      score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      /** Snapshotted at start — a later edit to the test must not retroactively change a finished attempt's denominator. */
      max_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      section_scores: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      time_taken_seconds: { type: DataTypes.INTEGER, allowNull: true },
      started_at: createdAtNow,
      /** NULL while in progress; set on submit or timeout auto-submit. */
      submitted_at: { type: DataTypes.DATE, allowNull: true },
    });
    await query(`CREATE INDEX contest_attempts_candidate_idx ON contest_attempts (candidate_id, contest_id);`);
    await query(
      `CREATE INDEX contest_attempts_leaderboard_idx ON contest_attempts (contest_id, score DESC) WHERE submitted_at IS NOT NULL;`,
    );

    // ---------------------------------------------------------------
    // contest_question_responses
    // ---------------------------------------------------------------
    await queryInterface.createTable('contest_question_responses', {
      id: uuidPk,
      attempt_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'contest_attempts', key: 'id' },
        onDelete: 'CASCADE',
      },
      question_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'contest_questions', key: 'id' },
        onDelete: 'CASCADE',
      },
      response: { type: DataTypes.JSONB, allowNull: true },
      is_correct: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      code_run_results: { type: DataTypes.JSONB, allowNull: true },
      updated_at: createdAtNow,
    });
    // One row per question per attempt — the save-answer endpoint upserts on
    // this constraint, so a candidate revisiting a question overwrites their
    // previous answer instead of accumulating duplicates.
    await query(`
      CREATE UNIQUE INDEX contest_question_responses_unique
        ON contest_question_responses (attempt_id, question_id);
    `);

    // ---------------------------------------------------------------
    // RLS
    // ---------------------------------------------------------------
    const allTables = [
      'contests',
      'contest_questions',
      'contest_attempts',
      'contest_question_responses',
    ];
    for (const table of allTables) {
      await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      await query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    }

    // contests: anyone (including unauthenticated — public leaderboard/SEO)
    // may read a PUBLISHED contest. Unpublished drafts are admin-only, which
    // is what makes "unpublish without deleting" actually hide a test.
    await query(`
      CREATE POLICY contests_select_published ON contests FOR SELECT
        USING (published = true);
    `);
    await query(`
      CREATE POLICY contests_admin ON contests FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // contest_questions: readable iff their contest is published. (The
    // hidden_test_cases column is stripped in the controller — see the header
    // note above.)
    await query(`
      CREATE POLICY contest_questions_select_published ON contest_questions FOR SELECT
        USING (
          EXISTS (SELECT 1 FROM contests c WHERE c.id = contest_id AND c.published = true)
        );
    `);
    await query(`
      CREATE POLICY contest_questions_admin ON contest_questions FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // contest_attempts:
    //   - a candidate owns their own attempts outright
    //   - anyone may read SUBMITTED attempts, which is what the public
    //     leaderboard is computed from. In-progress attempts stay private, so
    //     a live score can't be scraped mid-test.
    await query(`
      CREATE POLICY contest_attempts_owner ON contest_attempts FOR ALL
        USING (${roleIs('candidate')} AND candidate_id = ${selfId})
        WITH CHECK (${roleIs('candidate')} AND candidate_id = ${selfId});
    `);
    await query(`
      CREATE POLICY contest_attempts_select_submitted ON contest_attempts FOR SELECT
        USING (submitted_at IS NOT NULL);
    `);
    await query(`
      CREATE POLICY contest_attempts_admin ON contest_attempts FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // contest_question_responses: strictly private to the candidate who owns
    // the parent attempt. Deliberately NOT readable by other candidates even
    // once submitted — unlike the attempt's total score, the per-question
    // answers are the answer key in disguise.
    await query(`
      CREATE POLICY contest_question_responses_owner ON contest_question_responses FOR ALL
        USING (
          ${roleIs('candidate')} AND EXISTS (
            SELECT 1 FROM contest_attempts a
            WHERE a.id = attempt_id AND a.candidate_id = ${selfId}
          )
        )
        WITH CHECK (
          ${roleIs('candidate')} AND EXISTS (
            SELECT 1 FROM contest_attempts a
            WHERE a.id = attempt_id AND a.candidate_id = ${selfId}
          )
        );
    `);
    await query(`
      CREATE POLICY contest_question_responses_admin ON contest_question_responses FOR ALL
        USING (${admin})
        WITH CHECK (${admin});
    `);

    // ---------------------------------------------------------------
    // Pricing toggle — built now, switched on later.
    //
    // `contest_entry_fee_inr = 0` means free. The start-attempt endpoint
    // already reads this and routes through a payment gate when it is
    // non-zero, so enabling a ₹9 fee is an admin editing this row, not a code
    // change. Lives in site_settings alongside boost_price_per_day and
    // price_per_unlock so it is editable from the existing admin screen with
    // no new UI.
    // ---------------------------------------------------------------
    await query(`
      INSERT INTO site_settings ("key", "value")
      VALUES ('contest_entry_fee_inr', '0')
      ON CONFLICT ("key") DO NOTHING;
    `);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`DELETE FROM site_settings WHERE "key" = 'contest_entry_fee_inr';`);

    // Child-first, so the FK references drop cleanly.
    await queryInterface.dropTable('contest_question_responses');
    await queryInterface.dropTable('contest_attempts');
    await queryInterface.dropTable('contest_questions');
    await queryInterface.dropTable('contests');

    for (const enumType of ENUM_TYPES) {
      await query(`DROP TYPE IF EXISTS ${enumType.name};`);
    }
  },
};
