'use strict';

/**
 * The community catalogue.
 *
 * Communities are admin-curated rather than user-created (see the RLS in
 * 20240113000001-social-module.js), so the list has to exist before anyone
 * can join one — an empty catalogue makes the whole tab a dead end.
 *
 * Idempotent by slug, like the other seeders in this directory: `db:seed:all`
 * does not track what has already run, so this upserts on the unique slug
 * instead of bailing on the first duplicate. That way adding a community to
 * the array below and re-running is a supported way to extend the catalogue.
 */

const COMMUNITIES = [
  {
    slug: 'freshers',
    name: 'Freshers',
    icon: '🌱',
    description: 'First job, first interview, first offer. Ask anything — no question is too basic here.',
  },
  {
    slug: 'off-campus',
    name: 'Off-Campus Drives',
    icon: '📢',
    description: 'Off-campus hiring drives, referral threads and mass-recruitment openings as they go live.',
  },
  {
    slug: 'interview-experiences',
    name: 'Interview Experiences',
    icon: '🎤',
    description: 'Round-by-round write-ups of real interviews: what was asked, what worked, what did not.',
  },
  {
    slug: 'it-jobs',
    name: 'IT & Software',
    icon: '💻',
    description: 'Developer, QA, DevOps, data and everything else that ships from an IDE.',
  },
  {
    slug: 'non-it-jobs',
    name: 'Non-IT Jobs',
    icon: '🏭',
    description: 'Core, mechanical, civil, sales, operations, BPO and every role that is not a software role.',
  },
  {
    slug: 'govt-jobs',
    name: 'Government Jobs',
    icon: '🏛️',
    description: 'Notifications, exam dates and preparation threads for public-sector recruitment.',
  },
  {
    slug: 'remote',
    name: 'Remote Work',
    icon: '🌍',
    description: 'Work-from-home and remote-first openings, plus the reality of actually doing the job.',
  },
  {
    slug: 'memes',
    name: 'Job Hunt Memes',
    icon: '😂',
    description: 'The rejection emails, the "we will get back to you", the 5-years-experience-for-a-fresher-role. Laugh it off here.',
  },
  {
    slug: 'salary-talk',
    name: 'Salary & Negotiation',
    icon: '💰',
    description: 'CTC breakdowns, hike expectations and how to negotiate without blowing up the offer.',
  },
  {
    slug: 'career-switch',
    name: 'Career Switch',
    icon: '🔁',
    description: 'Changing domain, changing stack, changing industry — and what it costs to do it.',
  },
];

module.exports = {
  up: async (queryInterface) => {
    const query = (sql, options) => queryInterface.sequelize.query(sql, options);

    for (const community of COMMUNITIES) {
      await query(
        `
          INSERT INTO communities (slug, name, icon, description)
          VALUES (:slug, :name, :icon, :description)
          ON CONFLICT (slug) DO UPDATE
            SET name = EXCLUDED.name,
                icon = EXCLUDED.icon,
                description = EXCLUDED.description,
                updated_at = now();
        `,
        { replacements: community },
      );
    }
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `DELETE FROM communities WHERE slug IN (:slugs);`,
      { replacements: { slugs: COMMUNITIES.map((c) => c.slug) } },
    );
  },
};
