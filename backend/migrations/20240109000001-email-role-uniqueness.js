'use strict';

/**
 * One email = one account = one role.
 *
 * `users.email` already carried a UNIQUE constraint, but Postgres' unique
 * index is case-SENSITIVE: 'Manoj@gmail.com' and 'manoj@gmail.com' are two
 * distinct values as far as it is concerned. So the exact bug this fixes was
 * reachable in practice — sign up as a candidate with one casing, then sign
 * up again as a company (or consume a verifier invite) with another casing of
 * the same mailbox, and both accounts exist happily side by side.
 *
 * Fix is two-sided:
 *   - the app now normalizes every email to lowercase before it ever reaches
 *     the DB (see authController.normalizeEmail), and
 *   - this migration adds a functional UNIQUE index on lower(email) so the
 *     invariant is enforced by the database itself, not just by the one code
 *     path that happens to remember to normalize.
 *
 * Existing rows are folded to lowercase first. If two rows already differ
 * only by case, lowercasing both would violate the new index — rather than
 * silently deleting somebody's account, those rows are left alone and the
 * CREATE INDEX below fails loudly so a human can decide which account wins.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE users u
      SET email = lower(u.email)
      WHERE u.email <> lower(u.email)
        AND NOT EXISTS (
          SELECT 1 FROM users other
          WHERE other.id <> u.id
            AND lower(other.email) = lower(u.email)
        );
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
        ON users (lower(email));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS users_email_lower_unique;
    `);
  },
};
