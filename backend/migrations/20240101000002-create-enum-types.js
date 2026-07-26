'use strict';

/**
 * Creates all native Postgres ENUM types used by the schema. These are
 * created up front (rather than inline via Sequelize.DataTypes.ENUM inside
 * createTable, which would create-and-name the type implicitly) so that the
 * table-creation migration can reference them explicitly by name, and so
 * enum values stay centrally defined in one place.
 *
 * Each CREATE TYPE is wrapped in a DO block with an exception handler
 * because Postgres has no native `CREATE TYPE IF NOT EXISTS` syntax.
 */

const ENUM_TYPES = [
  { name: 'user_role', values: ['candidate', 'company', 'verifier', 'admin'] },
  { name: 'candidate_category', values: ['fresher', 'experienced', 'executive'] },
  {
    name: 'candidate_status',
    values: ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'needs_info'],
  },
  {
    name: 'verification_target_type',
    values: ['candidate_profile', 'platform_badge', 'achievement'],
  },
  {
    name: 'verification_decision',
    values: ['approved', 'rejected', 'needs_info', 'flagged', 'verified', 'incorrect'],
  },
  { name: 'badge_verification_status', values: ['pending', 'verified', 'rejected'] },
  { name: 'achievement_type', values: ['project', 'research', 'achievement'] },
  { name: 'achievement_verification_status', values: ['pending', 'verified', 'rejected'] },
  { name: 'message_sender_role', values: ['company', 'candidate'] },
];

module.exports = {
  up: async (queryInterface) => {
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
  },

  down: async (queryInterface) => {
    for (const enumType of [...ENUM_TYPES].reverse()) {
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS ${enumType.name} CASCADE;`);
    }
  },
};
