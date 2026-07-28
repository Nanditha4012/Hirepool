'use strict';

const bcrypt = require('bcryptjs');

/**
 * Seeds a default admin account for development, mirroring
 * 20240105000001-seed-verifier-account.js exactly — same synthetic
 * `.local` email + username-based login, same idempotent
 * find-or-reset-password behaviour.
 *
 * Credentials: admin01 / admin1234
 *
 * Admin accounts require TOTP 2FA (verifiers no longer do, per the
 * Phase 5 verifier-workflow change) — this seeder does NOT create a
 * `user_totp_secrets` row, so the first login after seeding will
 * correctly land on the enrollment screen (scan QR, confirm code) rather
 * than skip 2FA entirely.
 *
 * These are development defaults and are checked into the repo — rotate
 * the password before this ever runs against a real deployment.
 *
 * Idempotent: re-running `db:seed:all` (which does NOT track which
 * seeders already ran, unlike migrations) must not blow up on the
 * unique constraint, so this checks for the row first.
 */

const USERNAME = 'admin01';
const EMAIL = 'admin01@hirepool.local';
const PASSWORD = 'admin1234';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM users WHERE username = :username OR email = :email LIMIT 1;`,
      { replacements: { username: USERNAME, email: EMAIL }, type: Sequelize.QueryTypes.SELECT },
    );

    if (existing) {
      // Already provisioned — re-apply the known password so a forgotten
      // dev credential can be reset by re-running the seeder, but leave
      // everything else (id, TOTP enrollment state, and therefore every FK
      // pointing at it) alone.
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
        role: 'admin',
        email: EMAIL,
        username: USERNAME,
        password_hash: passwordHash,
        full_name: 'Admin One',
      },
    ]);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('users', { username: USERNAME });
  },
};
