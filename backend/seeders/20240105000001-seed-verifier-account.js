'use strict';

const bcrypt = require('bcryptjs');

/**
 * Seeds the default verifier account.
 *
 * Verifiers are provisioned by us rather than self-signing-up, so they log in
 * with a handle instead of an email. `users.email` is NOT NULL + unique and
 * validated as an email by the Sequelize model, so the row still carries a
 * synthetic address on the reserved-for-documentation `.local` suffix; the
 * handle in `users.username` is what the login form actually takes.
 *
 * Credentials: verifier01 / veri1234
 *
 * These are development defaults and are checked into the repo — rotate the
 * password before this ever runs against a real deployment.
 *
 * Idempotent: re-running `db:seed:all` (which does NOT track which seeders
 * already ran, unlike migrations) must not blow up on the unique constraint,
 * so this checks for the row first.
 */

const USERNAME = 'verifier01';
const EMAIL = 'verifier01@hirepool.local';
const PASSWORD = 'veri1234';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM users WHERE username = :username OR email = :email LIMIT 1;`,
      { replacements: { username: USERNAME, email: EMAIL }, type: Sequelize.QueryTypes.SELECT },
    );

    if (existing) {
      // Already provisioned — re-apply the known password so a forgotten
      // dev credential can be reset by re-running the seeder, but leave
      // everything else (id, and therefore every FK pointing at it) alone.
      const passwordHash = await bcrypt.hash(PASSWORD, 10);
      await queryInterface.sequelize.query(
        `UPDATE users SET password_hash = :passwordHash, username = :username WHERE id = :id;`,
        { replacements: { passwordHash, username: USERNAME, id: existing.id } },
      );
      return;
    }

    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await queryInterface.bulkInsert('users', [
      {
        role: 'verifier',
        email: EMAIL,
        username: USERNAME,
        password_hash: passwordHash,
        full_name: 'Verifier One',
      },
    ]);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('users', { username: USERNAME });
  },
};
