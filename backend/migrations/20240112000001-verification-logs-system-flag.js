'use strict';

/**
 * Phase 7 security hardening: cross-account duplicate resume-link detection.
 *
 * candidateController.submitMyProfile now checks, at the moment a candidate
 * asserts their profile is ready for review, whether some OTHER (non-draft)
 * candidate_profiles row already carries the exact same resume_link. This is
 * a fraud/multi-accounting signal (see the Phase 1 spec's "duplicate-account
 * detection" bullet) — not something to hard-block on, since a genuine
 * coincidental collision (shared portfolio site, a copy-paste mistake) is a
 * real possibility and hard-blocking a legitimate candidate over it would be
 * a worse failure mode than just surfacing it for a human. So it's written as
 * a `verification_logs` row with `decision = 'flagged'`, reusing the exact
 * same convention the verifier portal's existing "Flag as Suspicious" action
 * already uses (see verifierController.decideProfile) — that's what makes it
 * show up in adminController.getAnalyticsOverview's `flaggedVerifications`
 * count and in a profile's own decision timeline, with no new surface to
 * build.
 *
 * Three RLS changes needed to let this actually run, all additive:
 *
 *  1. `reviewer_id` was NOT NULL with no "system" actor concept. This check
 *     runs on behalf of the submitting candidate, who is not a reviewer —
 *     fabricating a fake reviewer id (or reusing the candidate's own id as if
 *     they reviewed themselves) would misrepresent who made this call. Nobody
 *     did — the system did. So `reviewer_id` becomes nullable, exclusively
 *     for this one system-generated case; every human verifier decision still
 *     always sets it (see the VerificationLog model doc comment).
 *
 *  2. Finding the OTHER candidate's profile is the hard part: candidate_profiles
 *     has never had any policy letting one candidate's session read another
 *     candidate's row (verify-phase1.ts even has an explicit regression test,
 *     "candidate CANNOT read another candidate's candidate_profiles row" —
 *     rightly so, and this migration must not weaken that). So the duplicate
 *     lookup does NOT run under the submitting candidate's own session
 *     context at all — it runs under runInRequestContext(null, ...), the same
 *     "no session yet" context authController already uses for pre-auth
 *     lookups (see whereEmailEquals's call sites), which only ever activates
 *     for code that explicitly chooses it. The new
 *     candidate_profiles_system_duplicate_check_select policy below grants
 *     that null-context read, restricted to non-draft rows (a draft resume
 *     link isn't a real claim yet) — every currently-authenticated
 *     candidate/company/verifier/admin session is completely unaffected,
 *     since their session role is never NULL.
 *
 *  3. The actual INSERT of the flagged verification_logs row DOES run under
 *     the submitting candidate's own session (reviewer_id must be attributable
 *     to *a* session for the audit trail's SET LOCAL story to make sense, and
 *     the row's target has to be the candidate's own profile anyway). Before
 *     this, verification_logs only had an INSERT policy for the verifier role
 *     (own reviewer_id) plus the admin FOR ALL policy — nothing let a
 *     candidate-role session insert a row at all, and for good reason: a
 *     candidate must never be able to write themselves an 'approved' entry.
 *     verification_logs_candidate_system_flag_insert below is deliberately
 *     narrow: it only ever admits a NULL-reviewer, decision = 'flagged' row,
 *     targeting a candidate_profiles row the candidate actually owns (same
 *     ownership subquery shape as verification_logs_candidate_select in
 *     20240111000001) — it cannot be used to write any other decision or
 *     target somebody else's profile.
 *
 * Purely additive: no existing row, policy, or other column is touched.
 */

const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;

module.exports = {
  up: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`ALTER TABLE verification_logs ALTER COLUMN reviewer_id DROP NOT NULL;`);

    await query(`
      CREATE POLICY candidate_profiles_system_duplicate_check_select ON candidate_profiles FOR SELECT
        USING (
          current_setting('app.current_user_role', true) IS NULL
          AND status != 'draft'
        );
    `);

    await query(`
      CREATE POLICY verification_logs_candidate_system_flag_insert ON verification_logs FOR INSERT
        WITH CHECK (
          ${roleIs('candidate')}
          AND reviewer_id IS NULL
          AND decision = 'flagged'
          AND target_type = 'candidate_profile'
          AND target_id IN (SELECT id FROM candidate_profiles WHERE user_id = ${selfId})
        );
    `);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`DROP POLICY IF EXISTS verification_logs_candidate_system_flag_insert ON verification_logs;`);
    await query(`DROP POLICY IF EXISTS candidate_profiles_system_duplicate_check_select ON candidate_profiles;`);

    // Any NULL reviewer_id rows written under the policy above must be
    // resolved before NOT NULL can be restored, or this ALTER fails loudly —
    // never guess-fill a reviewer.
    await query(`ALTER TABLE verification_logs ALTER COLUMN reviewer_id SET NOT NULL;`);
  },
};
