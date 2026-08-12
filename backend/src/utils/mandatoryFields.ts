import type { CandidateCategory } from '../models/CandidateProfile';

/**
 * "Is a No on this field a blocker, or just a note?"
 *
 * The one declaration of which checklist keys are mandatory, shared by the
 * verifier's checklist (verifierController.buildChecklist, which renders it as
 * `required`) and the candidate's own report (candidateController's
 * fieldReview, which renders it as `mandatory`). Both used to state the rule
 * separately — the verifier page hardcoded a `required` boolean per item and
 * the candidate page had no concept of it at all, so a candidate looking at
 * their rejection saw a flat list of failures with no way to tell "this is why
 * you were turned down" from "fix this when you get a chance".
 *
 * Keys match ProfileFieldCheck.fieldKey. Two of them are prefixed rather than
 * literal, because there is one row per item:
 *
 *   project:<achievementId>   one attached project / research / achievement
 *   badge:<badgeId>           one coding-platform badge
 *
 * The category argument is what makes the answer correct: a project link is
 * gating proof for a fresher (who must submit three) and optional colour for
 * an experienced candidate (whose proof is their offer letter). A null
 * category means the candidate never got as far as picking one, so only the
 * category-independent keys can be mandatory.
 */

/** Mandatory for every candidate, whatever their category. */
const ALWAYS_MANDATORY = new Set([
  'fullName',
  'phone',
  'email',
  'primaryRole',
  'domain',
  'resumeLink',
]);

/** Mandatory only for experienced/executive candidates. */
const EXPERIENCE_MANDATORY = new Set([
  'yearsOfExperience',
  'currentCompany',
  'designationRole',
  'companyType',
  'offerLetterOrLinkedinLink',
]);

export function isMandatoryFieldKey(
  fieldKey: string,
  category: CandidateCategory | null,
): boolean {
  if (ALWAYS_MANDATORY.has(fieldKey)) return true;
  if (!category) return false;

  if (category === 'fresher') {
    // Three live, attributable project links are the whole of a fresher's
    // proof, so each one — and the "did they submit three?" row — gates.
    // Platform badges (badge:*) stay optional: they are corroboration.
    return fieldKey === 'projectCount' || fieldKey.startsWith('project:');
  }

  if (EXPERIENCE_MANDATORY.has(fieldKey)) return true;

  // Executive-only. budgetOwned and titleLevel are explicitly optional — not
  // every executive can disclose a budget figure.
  return category === 'executive' && fieldKey === 'teamSizeManaged';
}
