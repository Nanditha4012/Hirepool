'use strict';

/**
 * Education, certificates and automated document verification.
 *
 * Three things, one migration, because they land as one product change — the
 * profile grows an Education section, certificates become a first-class kind
 * of attachment, and both of those (plus basic info) become auto-verifiable
 * from a document rather than only by a human reading a link.
 *
 * Follows the conventions of 20240102000001-phase2-candidate-profile.js:
 * idempotent `DO $$ ... EXCEPTION WHEN duplicate_object` enum creation,
 * uuidPk/createdAtNow helpers, snake_case columns, explicit FK `references`.
 * Purely additive — no existing table or column is dropped or altered, with
 * the single exception of adding a value to the `achievement_type` enum,
 * which no existing row can be invalidated by.
 */

const ENUM_TYPES = [
  {
    // 10th and 12th are separate levels rather than a generic "school"
    // because they are separately verifiable (two different marks cards) and
    // companies filter on them separately.
    name: 'education_level',
    values: ['tenth', 'twelfth', 'diploma', 'undergraduate', 'postgraduate', 'doctorate'],
  },
  {
    // Deliberately its own type rather than reusing
    // `achievement_verification_status`: education rows gain an `auto_`
    // outcome that achievements don't have, and widening the shared type
    // would put states on achievements that mean nothing there.
    name: 'education_verification_status',
    values: ['pending', 'auto_verified', 'verified', 'rejected'],
  },
  {
    name: 'verification_document_type',
    values: ['aadhaar', 'marks_card', 'degree_certificate'],
  },
  {
    // `manual_review` is the honest outcome for a scan the OCR could read but
    // not confidently match — it is not a failure, it is "a human needs to
    // look". Routing those to the existing verifier queue instead of
    // rejecting them is what keeps automation from being worse than no
    // automation.
    name: 'verification_document_status',
    values: ['pending', 'processing', 'auto_verified', 'manual_review', 'failed'],
  },
  {
    name: 'verification_document_source',
    values: ['drive_link', 'digilocker'],
  },
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
    const updatedAtNow = {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: literal('now()'),
    };
    const candidateFk = {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
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

    // A certificate is an achievement with a different shelf in the UI, not a
    // different shape of record — same title/description/proof-link/verdict
    // columns, same verifier queue, same RLS. A fourth enum value is the
    // whole change.
    //
    // `ADD VALUE` cannot run inside a transaction block on older Postgres;
    // sequelize-cli does not wrap migrations in one by default, and Supabase
    // is on 15 where it is permitted regardless. IF NOT EXISTS keeps a re-run
    // from erroring.
    await query(`ALTER TYPE achievement_type ADD VALUE IF NOT EXISTS 'certificate';`);

    // ---------------------------------------------------------------
    // candidate_education
    // ---------------------------------------------------------------
    await queryInterface.createTable('candidate_education', {
      id: uuidPk,
      candidate_id: candidateFk,
      level: { type: 'education_level', allowNull: false },
      // Free text rather than a master table: India has tens of thousands of
      // schools and colleges, and a Combobox over an incomplete master list
      // is how a candidate ends up unable to enter the truth. The OCR match
      // (see candidate_verification_documents) is what turns this into
      // something trustworthy.
      institution: { type: DataTypes.STRING, allowNull: false },
      board_or_university: { type: DataTypes.STRING, allowNull: true },
      /** e.g. "B.E.", "B.Tech", "MBA" — null for 10th/12th. */
      degree: { type: DataTypes.STRING, allowNull: true },
      /** e.g. "Computer Science" — null for 10th/12th. */
      branch: { type: DataTypes.STRING, allowNull: true },
      start_year: { type: DataTypes.INTEGER, allowNull: true },
      /** Null while still studying — paired with is_ongoing below. */
      end_year: { type: DataTypes.INTEGER, allowNull: true },
      is_ongoing: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      /**
       * Stored as the number the candidate was given plus the unit it was
       * given in, not normalised to a percentage. A 8.6 CGPA is not 86% and
       * converting it silently would be inventing a figure a company might
       * screen on.
       */
      score_value: { type: DataTypes.DECIMAL(6, 3), allowNull: true },
      score_type: { type: DataTypes.STRING, allowNull: true },
      marks_card_link: { type: DataTypes.STRING, allowNull: true },
      verification_status: {
        type: 'education_verification_status',
        allowNull: false,
        defaultValue: 'pending',
      },
      rejection_reason: { type: DataTypes.TEXT, allowNull: true },
      created_at: createdAtNow,
      updated_at: updatedAtNow,
    });

    await query(`
      CREATE INDEX IF NOT EXISTS candidate_education_candidate_id_idx
        ON candidate_education (candidate_id);
    `);

    // ---------------------------------------------------------------
    // candidate_verification_documents
    //
    // Note what is NOT here: the document itself. The bytes are fetched from
    // the candidate's link, OCR'd in memory and dropped — only the link, the
    // fields read out of it and the verdict are persisted. For an Aadhaar
    // that is not a storage-cost decision, it is the point: holding scans of
    // government ID turns this table into something worth stealing, and
    // Aadhaar in particular carries statutory duties around storage that a
    // hiring platform has no business taking on. `aadhaar_last4` exists so a
    // human can tell two documents apart; the full number is never written.
    // ---------------------------------------------------------------
    await queryInterface.createTable('candidate_verification_documents', {
      id: uuidPk,
      candidate_id: candidateFk,
      doc_type: { type: 'verification_document_type', allowNull: false },
      source: {
        type: 'verification_document_source',
        allowNull: false,
        defaultValue: 'drive_link',
      },
      /** The candidate-supplied link the bytes were read from. */
      document_link: { type: DataTypes.STRING, allowNull: true },
      /** Set when this row backs a specific education entry. */
      education_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'candidate_education', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      status: {
        type: 'verification_document_status',
        allowNull: false,
        defaultValue: 'pending',
      },
      /** Whatever the reader could parse: name, dob, board, year, score… */
      extracted: { type: DataTypes.JSONB, allowNull: true },
      /**
       * Per-field agreement between `extracted` and what the candidate typed
       * — `{ fullName: true, dob: false }`. This, not the raw OCR text, is
       * what a verifier reads and what the auto-verdict is computed from.
       */
      field_matches: { type: DataTypes.JSONB, allowNull: true },
      /** 0–1. Below AUTO_VERIFY_THRESHOLD the row goes to a human instead. */
      confidence: { type: DataTypes.DECIMAL(4, 3), allowNull: true },
      aadhaar_last4: { type: DataTypes.STRING(4), allowNull: true },
      failure_reason: { type: DataTypes.TEXT, allowNull: true },
      processed_at: { type: DataTypes.DATE, allowNull: true },
      created_at: createdAtNow,
      updated_at: updatedAtNow,
    });

    await query(`
      CREATE INDEX IF NOT EXISTS candidate_verification_documents_candidate_id_idx
        ON candidate_verification_documents (candidate_id);
    `);

    // ---------------------------------------------------------------
    // RLS
    // ---------------------------------------------------------------
    const admin = `current_setting('app.current_user_role', true) = 'admin'`;
    const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;
    const selfId = `current_setting('app.current_user_id', true)::uuid`;

    for (const table of ['candidate_education', 'candidate_verification_documents']) {
      await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      await query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
      await query(`
        CREATE POLICY ${table}_owner ON ${table} FOR ALL
          USING (${roleIs('candidate')} AND candidate_id = ${selfId})
          WITH CHECK (${roleIs('candidate')} AND candidate_id = ${selfId});
      `);
      await query(`
        CREATE POLICY ${table}_verifier_select ON ${table} FOR SELECT
          USING (${roleIs('verifier')});
      `);
      await query(`
        CREATE POLICY ${table}_verifier_update ON ${table} FOR UPDATE
          USING (${roleIs('verifier')})
          WITH CHECK (${roleIs('verifier')});
      `);
      await query(`
        CREATE POLICY ${table}_admin ON ${table} FOR ALL
          USING (${admin})
          WITH CHECK (${admin});
      `);
    }

    // Education is one of the five things a company is allowed to see, so it
    // needs the same company-SELECT boundary `candidate_profiles` has had
    // since Phase 1: approved candidates only, enforced by a subquery on the
    // profile's status rather than trusting the controller to filter.
    //
    // Verification documents get no such policy, deliberately — a company
    // never sees them.
    await query(`
      CREATE POLICY candidate_education_company_select ON candidate_education FOR SELECT
        USING (
          ${roleIs('company')}
          AND EXISTS (
            SELECT 1 FROM candidate_profiles cp
            WHERE cp.user_id = candidate_education.candidate_id
              AND cp.status = 'approved'
          )
        );
    `);

    // ---------------------------------------------------------------
    // Backfill: company SELECT on skills and secondary roles.
    //
    // Phase 2 created candidate_skills / candidate_secondary_roles with only
    // owner and admin policies, and Phase 3 — which opened candidate search
    // to companies — added company policies to `users` and
    // `candidate_profiles` but never to these two. Under FORCE ROW LEVEL
    // SECURITY that means every search result a company sees has come back
    // with an empty `skills` array and no secondary roles, regardless of what
    // the candidate filled in: not an error, just silently nothing. Skills
    // are the main thing a company searches on, so this is fixed here rather
    // than left for later.
    // ---------------------------------------------------------------
    for (const table of ['candidate_skills', 'candidate_secondary_roles']) {
      await query(`
        CREATE POLICY ${table}_company_select ON ${table} FOR SELECT
          USING (
            ${roleIs('company')}
            AND EXISTS (
              SELECT 1 FROM candidate_profiles cp
              WHERE cp.user_id = ${table}.candidate_id
                AND cp.status = 'approved'
            )
          );
      `);
      // Verifiers review these alongside the rest of the profile and had no
      // policy either — same omission, same fix.
      await query(`
        CREATE POLICY ${table}_verifier_select ON ${table} FOR SELECT
          USING (${roleIs('verifier')});
      `);
    }
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    for (const table of ['candidate_skills', 'candidate_secondary_roles']) {
      await query(`DROP POLICY IF EXISTS ${table}_company_select ON ${table};`);
      await query(`DROP POLICY IF EXISTS ${table}_verifier_select ON ${table};`);
    }

    await query(
      `DROP POLICY IF EXISTS candidate_education_company_select ON candidate_education;`,
    );

    for (const table of ['candidate_education', 'candidate_verification_documents']) {
      for (const suffix of ['owner', 'verifier_select', 'verifier_update', 'admin']) {
        await query(`DROP POLICY IF EXISTS ${table}_${suffix} ON ${table};`);
      }
    }

    // candidate_verification_documents first — it FKs candidate_education.
    await queryInterface.dropTable('candidate_verification_documents');
    await queryInterface.dropTable('candidate_education');

    for (const name of [
      'verification_document_source',
      'verification_document_status',
      'verification_document_type',
      'education_verification_status',
      'education_level',
    ]) {
      await query(`DROP TYPE IF EXISTS ${name};`);
    }

    // `achievement_type`'s 'certificate' value is deliberately NOT removed:
    // Postgres has no DROP VALUE, and rebuilding the type would mean
    // rewriting every candidate_achievements row. Rolling this migration
    // back leaves a spare enum value that nothing reads, which is harmless.
  },
};
