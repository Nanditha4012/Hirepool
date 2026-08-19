'use strict';

/**
 * AI Relevancy Packages (Feature 1) — Phase 2.
 *
 * Phase 1's migration (20240118000001) scoped the company's policy on
 * candidate_relevancy_scores to SELECT-only, flagging in its header comment
 * that this would need revisiting once the actual recompute logic existed.
 * Phase 2 runs JD-edit-triggered recompute (recomputeScoresForJob, see
 * utils/relevancyScoring.ts) inside the company's own request context, which
 * needs INSERT/UPDATE/DELETE on scores for jobs the company owns (DELETE
 * specifically because a recompute removes a row that's dropped below the
 * 50% qualifying floor). Verifier/admin policies are unchanged — this only
 * replaces the company policy.
 */

const roleIs = (role) => `current_setting('app.current_user_role', true) = '${role}'`;
const selfId = `current_setting('app.current_user_id', true)::uuid`;

module.exports = {
  up: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`DROP POLICY IF EXISTS candidate_relevancy_scores_select_company ON candidate_relevancy_scores;`);

    await query(`
      CREATE POLICY candidate_relevancy_scores_company ON candidate_relevancy_scores FOR ALL
        USING (
          ${roleIs('company')} AND EXISTS (
            SELECT 1 FROM jobs j WHERE j.id = job_id AND j.company_id = ${selfId}
          )
        )
        WITH CHECK (
          ${roleIs('company')} AND EXISTS (
            SELECT 1 FROM jobs j WHERE j.id = job_id AND j.company_id = ${selfId}
          )
        );
    `);
  },

  down: async (queryInterface) => {
    const query = (sql) => queryInterface.sequelize.query(sql);

    await query(`DROP POLICY IF EXISTS candidate_relevancy_scores_company ON candidate_relevancy_scores;`);

    await query(`
      CREATE POLICY candidate_relevancy_scores_select_company ON candidate_relevancy_scores FOR SELECT
        USING (
          ${roleIs('company')} AND EXISTS (
            SELECT 1 FROM jobs j WHERE j.id = job_id AND j.company_id = ${selfId}
          )
        );
    `);
  },
};
