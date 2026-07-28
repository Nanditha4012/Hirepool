'use strict';

/**
 * Adds one more site_settings row for Phase 6: `price_per_unlock`, the
 * placeholder INR amount charged per single unlock credit in the
 * pay-per-unlock top-up flow (distinct from the pre-existing
 * `boost_price_per_day` seeded in 20240106000001-seed-site-settings.js).
 *
 * Idempotent for the same reason as that seeder: `db:seed:all` doesn't
 * track which seeders already ran, so re-running this must not blow up on
 * the `key` primary key.
 */

const ROWS = [
  // Placeholder INR amount, no currency logic yet — same "admin-editable
  // ahead of time" rationale as boost_price_per_day.
  { key: 'price_per_unlock', value: '20' },
];

module.exports = {
  up: async (queryInterface) => {
    for (const row of ROWS) {
      const [existing] = await queryInterface.sequelize.query(
        `SELECT "key" FROM site_settings WHERE "key" = :key LIMIT 1;`,
        { replacements: { key: row.key } },
      );
      if (existing.length > 0) continue;
      await queryInterface.bulkInsert('site_settings', [row]);
    }
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('site_settings', {
      key: ROWS.map((r) => r.key),
    });
  },
};
