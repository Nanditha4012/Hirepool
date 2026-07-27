'use strict';

/**
 * Phase 2: candidate profile expansion — skills/domains master tables,
 * candidate<->skill and candidate<->secondary-role join tables, company
 * requests, and a batch of new nullable columns on `users` /
 * `candidate_profiles` / `candidate_platform_badges`.
 *
 * Follows the exact conventions of 20240101000002-create-enum-types.js
 * (idempotent `DO $$ ... EXCEPTION WHEN duplicate_object` enum creation)
 * and 20240101000003-create-tables.js (uuidPk/createdAtNow helpers,
 * snake_case columns, explicit FK `references`).
 *
 * This migration runs against a live Supabase DB that already has Phase 1
 * data — it is purely additive (new tables, new nullable/defaulted
 * columns) and never drops or alters any existing Phase 1 table or column.
 */

const ENUM_TYPES = [
  { name: 'company_request_status', values: ['pending', 'approved', 'rejected'] },
  { name: 'company_type', values: ['mnc', 'startup', 'agency'] },
];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { DataTypes, literal } = Sequelize;
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

    // ---------------------------------------------------------------
    // New enum types
    // ---------------------------------------------------------------
    for (const enumType of ENUM_TYPES) {
      const valuesSql = enumType.values.map((v) => `'${v}'`).join(', ');
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE ${enumType.name} AS ENUM (${valuesSql});
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$;
      `);
    }

    // ---------------------------------------------------------------
    // New master tables
    // ---------------------------------------------------------------
    await queryInterface.createTable('skills_master', {
      id: uuidPk,
      skill_name: { type: DataTypes.STRING, allowNull: false, unique: true },
    });

    await queryInterface.createTable('domains_master', {
      id: uuidPk,
      domain_name: { type: DataTypes.STRING, allowNull: false, unique: true },
    });

    // ---------------------------------------------------------------
    // candidate_skills — composite PK (candidate_id, skill_id), no id column
    // ---------------------------------------------------------------
    await queryInterface.createTable('candidate_skills', {
      candidate_id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      skill_id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: 'skills_master', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
    });

    // ---------------------------------------------------------------
    // candidate_secondary_roles — composite PK (candidate_id, role_id), no id column
    // ---------------------------------------------------------------
    await queryInterface.createTable('candidate_secondary_roles', {
      candidate_id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      role_id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: 'roles_master', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
    });

    // ---------------------------------------------------------------
    // company_requests
    // ---------------------------------------------------------------
    await queryInterface.createTable('company_requests', {
      id: uuidPk,
      requested_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
      },
      company_name: { type: DataTypes.STRING, allowNull: false },
      status: { type: 'company_request_status', allowNull: false, defaultValue: 'pending' },
      created_at: createdAtNow,
    });

    // ---------------------------------------------------------------
    // Column additions on existing Phase 1 tables
    // ---------------------------------------------------------------
    await queryInterface.addColumn('users', 'full_name', {
      type: DataTypes.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('candidate_profiles', 'primary_role_id', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'roles_master', key: 'id' },
    });
    await queryInterface.addColumn('candidate_profiles', 'domain_id', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'domains_master', key: 'id' },
    });
    await queryInterface.addColumn('candidate_profiles', 'resume_link', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('candidate_profiles', 'portfolio_link', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('candidate_profiles', 'years_of_experience', {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('candidate_profiles', 'current_company_id', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'companies_master', key: 'id' },
    });
    await queryInterface.addColumn('candidate_profiles', 'designation_role_id', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'roles_master', key: 'id' },
    });
    await queryInterface.addColumn('candidate_profiles', 'offer_letter_or_linkedin_link', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('candidate_profiles', 'company_type', {
      type: 'company_type',
      allowNull: true,
    });
    await queryInterface.addColumn('candidate_profiles', 'team_size_managed', {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('candidate_profiles', 'budget_owned', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('candidate_profiles', 'title_level', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('candidate_profiles', 'is_actively_looking', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });

    await queryInterface.addColumn('candidate_platform_badges', 'total_questions_solved', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('candidate_platform_badges', 'total_questions_solved');

    await queryInterface.removeColumn('candidate_profiles', 'is_actively_looking');
    await queryInterface.removeColumn('candidate_profiles', 'title_level');
    await queryInterface.removeColumn('candidate_profiles', 'budget_owned');
    await queryInterface.removeColumn('candidate_profiles', 'team_size_managed');
    await queryInterface.removeColumn('candidate_profiles', 'company_type');
    await queryInterface.removeColumn('candidate_profiles', 'offer_letter_or_linkedin_link');
    await queryInterface.removeColumn('candidate_profiles', 'designation_role_id');
    await queryInterface.removeColumn('candidate_profiles', 'current_company_id');
    await queryInterface.removeColumn('candidate_profiles', 'years_of_experience');
    await queryInterface.removeColumn('candidate_profiles', 'portfolio_link');
    await queryInterface.removeColumn('candidate_profiles', 'resume_link');
    await queryInterface.removeColumn('candidate_profiles', 'domain_id');
    await queryInterface.removeColumn('candidate_profiles', 'primary_role_id');

    await queryInterface.removeColumn('users', 'full_name');

    await queryInterface.dropTable('company_requests');
    await queryInterface.dropTable('candidate_secondary_roles');
    await queryInterface.dropTable('candidate_skills');
    await queryInterface.dropTable('domains_master');
    await queryInterface.dropTable('skills_master');

    for (const enumType of [...ENUM_TYPES].reverse()) {
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS ${enumType.name} CASCADE;`);
    }
  },
};
