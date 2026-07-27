'use strict';

/**
 * Seeds domains_master with the ~15 domains from the product spec.
 * `id` is intentionally omitted from every row so the column's DB default
 * (gen_random_uuid(), via pgcrypto) populates it — same pattern as
 * seeders/20240101000001-seed-roles-master.js.
 */

const DOMAIN_NAMES = [
  'Fintech',
  'Healthtech',
  'E-commerce',
  'EdTech',
  'SaaS',
  'Logistics & Supply Chain',
  'Travel & Hospitality',
  'Media & Entertainment',
  'Real Estate (Proptech)',
  'Agritech',
  'Insurtech',
  'Gaming',
  'Cybersecurity',
  'HRTech',
  'Government/Public Sector',
];

module.exports = {
  up: async (queryInterface) => {
    const rows = DOMAIN_NAMES.map((domain_name) => ({ domain_name }));
    await queryInterface.bulkInsert('domains_master', rows);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('domains_master', { domain_name: DOMAIN_NAMES });
  },
};
