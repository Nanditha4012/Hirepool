'use strict';

/**
 * Phase 7 security hardening: two missing SELECT policies on
 * `verification_logs`, found while checking RLS against the Phase 1 spec's
 * "verifiers read/write verification tables" bullet.
 *
 * Since 20240101000004, this table has only ever had:
 *   - verification_logs_verifier_insert (verifier, own reviewer_id only)
 *   - verification_logs_admin (admin, FOR ALL)
 * No policy has EVER let a verifier read the table back, and none has ever
 * let a candidate read their own decision history either — both are real
 * gaps, not new requirements:
 *
 *  - Verifiers write decisions but can't read any back via RLS — the
 *    verifier portal's timeline/history views only "work" today because
 *    verifierController runs plenty of other authorized reads alongside;
 *    any code path that queries VerificationLog directly under a verifier's
 *    own session context (rather than admin) has been silently returning
 *    zero rows.
 *  - candidateController.buildProfileResponse queries VerificationLog for
 *    both `latestVerificationNote` and the full decision timeline, under
 *    the CANDIDATE's own session context — with no candidate policy at
 *    all, this has always silently returned nothing, meaning a
 *    rejected/needs-info candidate's "what to fix" note from THIS code path
 *    never actually reached them via RLS (any note they did see came from
 *    elsewhere, e.g. the notification created alongside the same decision).
 *
 * The candidate policy needs a subquery (verification_logs.target_id is
 * polymorphic — only meaningful as a candidate_profiles.id when
 * target_type = 'candidate_profile') rather than a denormalized column like
 * profile_field_checks.candidate_id uses, since this table already existed
 * before that convention and isn't worth a backfill migration just for this.
 * The subquery resolves fine under RLS: the candidate already has SELECT
 * rights on their own candidate_profiles row via candidate_profiles_owner,
 * so it isn't filtered away by the subquery's own RLS pass.
 */

const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;

module.exports = {
  up: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`
      CREATE POLICY verification_logs_verifier_select ON verification_logs FOR SELECT
        USING (${roleIs('verifier')});
    `);

    await query(`
      CREATE POLICY verification_logs_candidate_select ON verification_logs FOR SELECT
        USING (
          ${roleIs('candidate')}
          AND target_type = 'candidate_profile'
          AND target_id IN (SELECT id FROM candidate_profiles WHERE user_id = ${selfId})
        );
    `);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`DROP POLICY IF EXISTS verification_logs_candidate_select ON verification_logs;`);
    await query(`DROP POLICY IF EXISTS verification_logs_verifier_select ON verification_logs;`);
  },
};
