import { Transaction } from 'sequelize';
import { CandidateEducation } from '../models';
import { EDUCATION_LEVEL_ORDER, type EducationLevel } from '../models/CandidateEducation';

/**
 * The single definition of what a company is allowed to see about a candidate.
 *
 * Five things, and nothing else:
 *
 *   name · role(s) · skills · experience · education
 *
 * plus the operational fields a company needs to act at all (location, notice
 * period, category) and the contact details it has paid to unlock.
 *
 * What is deliberately withheld, and why:
 *
 *   projects, research, certificates   A candidate's project links point at
 *                                      their GitHub, their personal site,
 *                                      their client's repo. Handing those to
 *                                      every subscribed company turns a
 *                                      hiring profile into a lead list and
 *                                      lets a company reach the candidate
 *                                      around the platform without unlocking.
 *
 *   coding-platform profile links      Same, and worse: a LeetCode or GitHub
 *                                      handle is usually the candidate's real
 *                                      identity elsewhere.
 *
 *   resume link                        The one that looks like an omission and
 *                                      is not. A resume PDF contains all of
 *                                      the above and a personal phone number
 *                                      and address besides — the platform
 *                                      cannot redact a file it does not own.
 *                                      Companies get the generated profile
 *                                      sheet instead, built from exactly the
 *                                      fields listed here.
 *
 *   portfolio link                     Direct contact route. Same reasoning.
 *
 * This module exists so that rule lives in one place rather than being
 * re-derived (and drifted from) in every company-facing endpoint. Search and
 * the unlocked list both build their payloads from here.
 */

/** One qualification, as a company sees it. */
export interface CompanyVisibleEducation {
  id: string;
  level: EducationLevel;
  institution: string;
  boardOrUniversity: string | null;
  degree: string | null;
  branch: string | null;
  startYear: number | null;
  endYear: number | null;
  isOngoing: boolean;
  scoreValue: number | null;
  scoreType: string | null;
  /** True when a human verifier signed off, as opposed to the document checker. */
  humanVerified: boolean;
}

/**
 * A candidate's education, filtered to what has actually been verified.
 *
 * Pending and rejected rows are omitted entirely rather than shown with a
 * "pending" chip. A company reading a qualification on this platform should be
 * able to take it as checked — that is the product's whole claim — and a
 * greyed-out unverified degree still puts the claim in front of them.
 *
 * `marksCardLink` is never included: it is a document with a roll number and
 * often a date of birth on it, and the verdict is what the company needs, not
 * the evidence behind it.
 */
export async function loadCompanyVisibleEducation(
  candidateUserId: string,
  t: Transaction,
): Promise<CompanyVisibleEducation[]> {
  const rows = await CandidateEducation.findAll({
    where: { candidateId: candidateUserId },
    transaction: t,
  });

  return rows
    .filter(
      (row) =>
        row.verificationStatus === 'verified' || row.verificationStatus === 'auto_verified',
    )
    .map((row) => ({
      id: row.id,
      level: row.level,
      institution: row.institution,
      boardOrUniversity: row.boardOrUniversity,
      degree: row.degree,
      branch: row.branch,
      startYear: row.startYear,
      endYear: row.endYear,
      isOngoing: row.isOngoing,
      scoreValue: row.scoreValue,
      scoreType: row.scoreType,
      humanVerified: row.verificationStatus === 'verified',
    }))
    .sort(
      (a, b) =>
        EDUCATION_LEVEL_ORDER[a.level] - EDUCATION_LEVEL_ORDER[b.level] ||
        (a.endYear ?? 0) - (b.endYear ?? 0),
    );
}
