'use strict';

/**
 * Phase 3: Company Portal — search/browse candidates, unlock-contact flow,
 * company-side messaging. Follows the exact conventions of
 * 20240102000001-phase2-candidate-profile.js (idempotent `DO $$ ...
 * EXCEPTION WHEN duplicate_object` enum creation, uuidPk/createdAtNow
 * helpers, snake_case columns, explicit FK `references`). RLS for the new
 * tables lives in the sibling migration 20240103000002-phase3-rls-policies.js
 * (same DDL/RLS split as Phase 2).
 *
 * This migration runs against a live Supabase DB that already has Phase 1/2
 * data — it is purely additive (new tables, new nullable/defaulted columns)
 * and never drops or alters any existing table/column.
 */

const ENUM_TYPES = [
  { name: 'notice_period', values: ['immediate', '15_days', '30_days', '60_days', '90_plus_days'] },
  { name: 'company_size', values: ['1-10', '11-50', '51-200', '201-1000', '1000+'] },
];

// Plans seed data — inlined here (rather than a separate seeder) because the
// data step below needs to look up the Free plan's id immediately after
// insertion. See Task 1/2 of the Phase 3 spec: this is the ONE place these
// 5 rows are created; there is no seeders/*-seed-plans-master.js file.
const PLAN_ROWS = [
  { name: 'Free', monthly_unlocks: 0, monthly_message_cap: 5, price: 0 },
  { name: 'Starter', monthly_unlocks: 10, monthly_message_cap: 30, price: 999 },
  { name: 'Growth', monthly_unlocks: 30, monthly_message_cap: null, price: 2999 },
  // Recurring monthly unlocks are 0 on this plan by design — one-off unlock
  // purchases are Phase 6 (payments).
  { name: 'Pay-per-unlock', monthly_unlocks: 0, monthly_message_cap: 30, price: 0 },
  // 100000 is a stand-in for "effectively unlimited" unlocks, kept as a
  // literal integer (not NULL) so numeric >= / <= comparisons in filter
  // logic elsewhere don't need special-casing for this plan.
  { name: 'Enterprise', monthly_unlocks: 100000, monthly_message_cap: null, price: 0 },
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
    // plans_master
    // ---------------------------------------------------------------
    await queryInterface.createTable('plans_master', {
      id: uuidPk,
      name: { type: DataTypes.STRING, allowNull: false, unique: true },
      monthly_unlocks: { type: DataTypes.INTEGER, allowNull: false },
      // NULL = unlimited messages per month on this plan.
      monthly_message_cap: { type: DataTypes.INTEGER, allowNull: true },
      price: { type: DataTypes.DECIMAL, allowNull: false, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    });

    await queryInterface.bulkInsert('plans_master', PLAN_ROWS);

    // ---------------------------------------------------------------
    // unlocks
    // ---------------------------------------------------------------
    await queryInterface.createTable('unlocks', {
      id: uuidPk,
      company_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
      },
      candidate_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
      },
      unlocked_at: createdAtNow,
      note: { type: DataTypes.TEXT, allowNull: true },
    });
    await queryInterface.addConstraint('unlocks', {
      fields: ['company_id', 'candidate_id'],
      type: 'unique',
      name: 'unlocks_company_id_candidate_id_unique',
    });

    // ---------------------------------------------------------------
    // company_blocks
    // ---------------------------------------------------------------
    await queryInterface.createTable('company_blocks', {
      id: uuidPk,
      company_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
      },
      candidate_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
      },
      reason: { type: DataTypes.TEXT, allowNull: true },
      created_at: createdAtNow,
    });
    await queryInterface.addConstraint('company_blocks', {
      fields: ['company_id', 'candidate_id'],
      type: 'unique',
      name: 'company_blocks_company_id_candidate_id_unique',
    });

    // ---------------------------------------------------------------
    // candidate_profiles: new nullable columns
    // ---------------------------------------------------------------
    await queryInterface.addColumn('candidate_profiles', 'location', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('candidate_profiles', 'notice_period', {
      type: 'notice_period',
      allowNull: true,
    });

    // ---------------------------------------------------------------
    // company_profiles: new columns
    // ---------------------------------------------------------------
    await queryInterface.addColumn('company_profiles', 'logo_link', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('company_profiles', 'website', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('company_profiles', 'industry', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('company_profiles', 'size', {
      type: 'company_size',
      allowNull: true,
    });
    await queryInterface.addColumn('company_profiles', 'gst_number', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    // Nullable at the DDL level — backfilled below for existing rows;
    // Task 4's company-signup controller sets this explicitly (looking up
    // the Free plan) for all future signups rather than relying on a magic
    // DB default.
    await queryInterface.addColumn('company_profiles', 'plan_id', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'plans_master', key: 'id' },
    });
    await queryInterface.addColumn('company_profiles', 'remaining_unlocks', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('company_profiles', 'unlocks_reset_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('company_profiles', 'messages_sent_this_period', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('company_profiles', 'messages_period_reset_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });

    // ---------------------------------------------------------------
    // Data step: backfill every pre-existing company_profiles row (Phase
    // 1/2 signups, including live test accounts) onto the Free plan with a
    // small dev-friendly starter allotment. Real quota top-ups via payment
    // are Phase 6.
    // ---------------------------------------------------------------
    await queryInterface.sequelize.query(`
      UPDATE company_profiles
      SET plan_id = (SELECT id FROM plans_master WHERE name = 'Free'),
          remaining_unlocks = 3
      WHERE plan_id IS NULL;
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('company_profiles', 'messages_period_reset_at');
    await queryInterface.removeColumn('company_profiles', 'messages_sent_this_period');
    await queryInterface.removeColumn('company_profiles', 'unlocks_reset_at');
    await queryInterface.removeColumn('company_profiles', 'remaining_unlocks');
    // Null out plan_id (drops the FK dependency on plans_master) before
    // dropping plans_master itself below.
    await queryInterface.removeColumn('company_profiles', 'plan_id');
    await queryInterface.removeColumn('company_profiles', 'gst_number');
    await queryInterface.removeColumn('company_profiles', 'size');
    await queryInterface.removeColumn('company_profiles', 'industry');
    await queryInterface.removeColumn('company_profiles', 'website');
    await queryInterface.removeColumn('company_profiles', 'logo_link');

    await queryInterface.removeColumn('candidate_profiles', 'notice_period');
    await queryInterface.removeColumn('candidate_profiles', 'location');

    await queryInterface.dropTable('company_blocks');
    await queryInterface.dropTable('unlocks');
    await queryInterface.dropTable('plans_master');

    for (const enumType of [...ENUM_TYPES].reverse()) {
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS ${enumType.name} CASCADE;`);
    }
  },
};
