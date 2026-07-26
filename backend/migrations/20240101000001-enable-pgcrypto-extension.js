'use strict';

/**
 * Enables the pgcrypto extension, which provides gen_random_uuid() used as
 * the default value for every table's uuid primary key. Supabase projects
 * usually ship with this enabled already, but we do it defensively so the
 * migration set is self-contained and reproducible on any fresh Postgres
 * instance (e.g. a local dev DB or a different Supabase project).
 */
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query('DROP EXTENSION IF EXISTS pgcrypto;');
  },
};
