'use strict';

/**
 * Seeds platform_badges_master with the real, finite badge/rank tiers for
 * each supported coding platform, sort_order ascending from lowest to
 * highest tier. `id` is omitted so gen_random_uuid() populates it.
 *
 * GeeksforGeeks note: GfG doesn't have a single official finite badge set
 * the way LeetCode/Codeforces/CodeChef/HackerRank do — "Institute Rank"
 * bands are used here as an illustrative, editable stand-in. Per the spec's
 * Phase 5 admin capability ("Platform badges master — add/remove/edit"),
 * this list is meant to be curated/replaced by an admin later, not treated
 * as authoritative.
 */

const ROWS = [
  // LeetCode contest badge tiers (low -> high)
  { platform_name: 'LeetCode', badge_name: 'Knight', sort_order: 1 },
  { platform_name: 'LeetCode', badge_name: 'Guardian', sort_order: 2 },

  // Codeforces rating tiers (low -> high)
  { platform_name: 'Codeforces', badge_name: 'Newbie', sort_order: 1 },
  { platform_name: 'Codeforces', badge_name: 'Pupil', sort_order: 2 },
  { platform_name: 'Codeforces', badge_name: 'Specialist', sort_order: 3 },
  { platform_name: 'Codeforces', badge_name: 'Expert', sort_order: 4 },
  { platform_name: 'Codeforces', badge_name: 'Candidate Master', sort_order: 5 },
  { platform_name: 'Codeforces', badge_name: 'Master', sort_order: 6 },
  { platform_name: 'Codeforces', badge_name: 'International Master', sort_order: 7 },
  { platform_name: 'Codeforces', badge_name: 'Grandmaster', sort_order: 8 },
  { platform_name: 'Codeforces', badge_name: 'International Grandmaster', sort_order: 9 },
  { platform_name: 'Codeforces', badge_name: 'Legendary Grandmaster', sort_order: 10 },

  // CodeChef star ratings (low -> high)
  { platform_name: 'CodeChef', badge_name: '1★', sort_order: 1 },
  { platform_name: 'CodeChef', badge_name: '2★', sort_order: 2 },
  { platform_name: 'CodeChef', badge_name: '3★', sort_order: 3 },
  { platform_name: 'CodeChef', badge_name: '4★', sort_order: 4 },
  { platform_name: 'CodeChef', badge_name: '5★', sort_order: 5 },
  { platform_name: 'CodeChef', badge_name: '6★', sort_order: 6 },
  { platform_name: 'CodeChef', badge_name: '7★', sort_order: 7 },

  // GeeksforGeeks institute rank bands (illustrative, see note above; low -> high)
  { platform_name: 'GeeksforGeeks', badge_name: 'Institute Rank 100+', sort_order: 1 },
  { platform_name: 'GeeksforGeeks', badge_name: 'Institute Rank 51-100', sort_order: 2 },
  { platform_name: 'GeeksforGeeks', badge_name: 'Institute Rank 11-50', sort_order: 3 },
  { platform_name: 'GeeksforGeeks', badge_name: 'Institute Rank 1-10', sort_order: 4 },

  // HackerRank skill badge star levels (low -> high)
  { platform_name: 'HackerRank', badge_name: '1 Star', sort_order: 1 },
  { platform_name: 'HackerRank', badge_name: '2 Star', sort_order: 2 },
  { platform_name: 'HackerRank', badge_name: '3 Star', sort_order: 3 },
  { platform_name: 'HackerRank', badge_name: '4 Star', sort_order: 4 },
  { platform_name: 'HackerRank', badge_name: '5 Star', sort_order: 5 },
];

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkInsert('platform_badges_master', ROWS);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('platform_badges_master', {
      platform_name: ['LeetCode', 'Codeforces', 'CodeChef', 'GeeksforGeeks', 'HackerRank'],
    });
  },
};
