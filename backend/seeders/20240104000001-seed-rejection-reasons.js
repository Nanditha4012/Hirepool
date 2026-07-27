'use strict';

/**
 * Seeds rejection_reasons_master with the standard set of profile-level and
 * item-level (platform badge / achievement) rejection reasons the
 * Verification Portal offers reviewers. `id` is intentionally omitted from
 * every row so the column's DB default (gen_random_uuid(), via pgcrypto)
 * populates it — same pattern as seeders/20240102000001-seed-skills-master.js.
 */

const PROFILE_REASONS = [
  'Project links are broken or unreachable',
  'GitHub shows no real commit history',
  "Resume link doesn't open",
  "LinkedIn profile doesn't match claimed company/title/years",
  'Offer or experience letter looks inauthentic',
  "Company type tag doesn't match actual employer",
  'Other (see note)',
];

const ITEM_REASONS = [
  "Platform profile link doesn't show this badge/rank",
  'Certificate or proof link is invalid or inaccessible',
  "Claim doesn't match the linked proof",
  'Other (see note)',
];

module.exports = {
  up: async (queryInterface) => {
    const rows = [
      ...PROFILE_REASONS.map((reason_text) => ({ scope: 'profile', reason_text })),
      ...ITEM_REASONS.map((reason_text) => ({ scope: 'item', reason_text })),
    ];
    await queryInterface.bulkInsert('rejection_reasons_master', rows);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('rejection_reasons_master', {
      reason_text: [...PROFILE_REASONS, ...ITEM_REASONS],
    });
  },
};
