'use strict';

/**
 * Seeds site_settings with the initial admin-editable copy the landing page /
 * header read at runtime via the public GET /masters/site-settings endpoint.
 * `updated_by` is left NULL — nobody has edited these yet — and `updated_at`
 * takes the column default (NOW()).
 *
 * `faq` is stored as a JSON-stringified array (the column itself is TEXT, not
 * JSON/JSONB — every value in site_settings is a plain string by design, so
 * the admin edit form can treat every row the same way) of
 * { question, answer } objects.
 *
 * Idempotent: re-running `db:seed:all` (which does NOT track which seeders
 * already ran) must not blow up on the `key` primary key — same convention as
 * seeders/20240105000001-seed-verifier-account.js's existing-row check.
 */

const FAQ = [
  {
    question: 'How does Hirepool work?',
    answer:
      'Build a verified profile once — your skills, experience, and proof of work — and companies searching for candidates like you can find you directly. No more sending the same application a hundred times.',
  },
  {
    question: 'How is my profile verified?',
    answer:
      'Every profile is reviewed by our verification team before it goes live: resumes, portfolios, work history, and any platform badges or achievements you add are checked against the proof links you provide.',
  },
  {
    question: 'Do companies see my contact details right away?',
    answer:
      "No. Companies see your verified profile first. Your phone number and email only become visible to a company after they use one of their plan's unlocks on your profile.",
  },
  {
    question: 'Is Hirepool free for candidates?',
    answer:
      'Yes — creating and maintaining a verified candidate profile is always free. Companies pay for search and unlock access on a subscription plan.',
  },
];

const ROWS = [
  { key: 'app_name', value: 'Hirepool' },
  { key: 'hero_title', value: 'Companies find you. Not the other way around.' },
  {
    key: 'hero_subtitle',
    value: 'Build a verified profile once. Let companies come to you.',
  },
  { key: 'faq', value: JSON.stringify(FAQ) },
  // Placeholder INR amount, no currency logic yet — Boost payment itself is
  // Phase 6 scope; this just makes the number admin-editable ahead of that.
  { key: 'boost_price_per_day', value: '49' },
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
