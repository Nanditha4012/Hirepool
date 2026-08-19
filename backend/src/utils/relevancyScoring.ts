import { Transaction } from 'sequelize';
import {
  CandidateProfile,
  CandidateSkill,
  SkillMaster,
  CandidateSecondaryRole,
  RoleMaster,
  DomainMaster,
  Job,
  JobRequirementParsed,
  CandidateRelevancyScore,
} from '../models';
import type { CandidateProfileAttributes } from '../models/CandidateProfile';
import type { JobAttributes } from '../models/Job';
import type { RoleMasterAttributes } from '../models/RoleMaster';
import type { DomainMasterAttributes } from '../models/DomainMaster';
import type { CandidateSecondaryRoleAttributes } from '../models/CandidateSecondaryRole';
import type { CandidateSkillAttributes } from '../models/CandidateSkill';
import type { SkillMasterAttributes } from '../models/SkillMaster';
import type { JobRequirementParsedAttributes } from '../models/JobRequirementParsed';
import type { RelevancyTier } from '../models/CandidateRelevancyScore';

/**
 * AI Relevancy Packages (Feature 1) — Phase 2: the deterministic, rule-based
 * scoring engine the spec calls for ("not the AI guessing"). Groq only
 * extracts structured requirements (Phase 1); everything here is plain
 * comparison logic against a candidate's already-structured profile data.
 *
 * Weights are a judgment call, not spelled out numerically in the spec
 * (which only says "each weighted"). Skills and role carry the most signal
 * for "would this candidate actually fit the role", experience and domain
 * are secondary. Tune here only — nothing else depends on these exact
 * numbers.
 */
const WEIGHTS = { skills: 40, role: 30, experience: 15, domain: 15 } as const;

/** Below this, no candidate_relevancy_scores row is kept — the spec's four
 * batches bottom out at 50%+; a non-match isn't worth storing or showing. */
const MIN_QUALIFYING_PERCENT = 50;

/**
 * Safety cap on how many candidates one recomputeScoresForJob() call will
 * score synchronously inside a request. The candidate pool is small today,
 * but this keeps a JD-edit request from blocking indefinitely if it grows —
 * flagged explicitly (returned in the result, not silently dropped) rather
 * than an invisible truncation.
 */
const MAX_CANDIDATES_PER_JOB_RECOMPUTE = 500;

/** Same idea, the other direction — capping how many jobs one candidate
 * approval recomputes against in a single request. */
const MAX_JOBS_PER_CANDIDATE_RECOMPUTE = 500;

interface ParsedRequirements {
  extractedSkills: string[];
  extractedRole: string | null;
  extractedExperienceLevel: number | null;
  extractedDomain: string | null;
}

interface CandidateSnapshot {
  yearsOfExperience: number | null;
  primaryRoleName: string | null;
  secondaryRoleNames: string[];
  domainName: string | null;
  skillNames: string[];
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function scoreSkills(required: string[], candidateSkills: string[]): number {
  // Nothing specified to check against — don't penalize for an unstated
  // requirement.
  if (required.length === 0) return WEIGHTS.skills;
  const have = new Set(candidateSkills.map(normalize));
  const matched = required.filter((s) => have.has(normalize(s))).length;
  return Math.round((matched / required.length) * WEIGHTS.skills);
}

function scoreRole(
  requiredRole: string | null,
  primaryRoleName: string | null,
  secondaryRoleNames: string[],
): number {
  if (!requiredRole) return WEIGHTS.role;
  const req = normalize(requiredRole);
  if (primaryRoleName && normalize(primaryRoleName) === req) return WEIGHTS.role;
  // A secondary-role match is real signal but weaker than the candidate's
  // actual primary role — partial credit, not full.
  if (secondaryRoleNames.some((r) => normalize(r) === req)) return Math.round(WEIGHTS.role * 0.7);
  return 0;
}

function scoreExperience(requiredYears: number | null, candidateYears: number | null): number {
  if (requiredYears === null || requiredYears <= 0) return WEIGHTS.experience;
  if (candidateYears === null) return 0;
  if (candidateYears >= requiredYears) return WEIGHTS.experience;
  // Under the bar gets partial credit proportional to how close they are,
  // rather than an all-or-nothing cliff.
  const ratio = Math.max(candidateYears / requiredYears, 0);
  return Math.round(WEIGHTS.experience * ratio);
}

function scoreDomain(requiredDomain: string | null, candidateDomain: string | null): number {
  if (!requiredDomain) return WEIGHTS.domain;
  if (!candidateDomain) return 0;
  return normalize(requiredDomain) === normalize(candidateDomain) ? WEIGHTS.domain : 0;
}

/**
 * The four weighted signals summed into one 0-100 score. Exported for
 * testability — the recompute orchestration functions below are the ones
 * controllers actually call.
 *
 * `includeDomain` defaults true (real candidates always have a domain field
 * available, even if unset). External applicants (Phase 6) never get asked
 * for one — none of the Simple/Detailed/Foreign application forms collect
 * it, per spec's own description of the Simple form as covering only
 * "skills, role, experience" — so scoring an external applicant passes
 * `includeDomain: false`, which redistributes domain's weight as automatic
 * full credit rather than structurally capping every external applicant
 * below otherwise-identical real candidates for a field they were never
 * asked to provide.
 */
export function computeRelevancyPercent(
  requirements: ParsedRequirements,
  candidate: CandidateSnapshot,
  includeDomain = true,
): number {
  const total =
    scoreSkills(requirements.extractedSkills, candidate.skillNames) +
    scoreRole(requirements.extractedRole, candidate.primaryRoleName, candidate.secondaryRoleNames) +
    scoreExperience(requirements.extractedExperienceLevel, candidate.yearsOfExperience) +
    (includeDomain ? scoreDomain(requirements.extractedDomain, candidate.domainName) : WEIGHTS.domain);
  return Math.max(0, Math.min(100, Math.round(total)));
}

/**
 * Percent -> spec's four batch tiers. The spec's own wording for the top
 * tier ("100% — near-exact match on skills, role, and experience") reads as
 * excluding domain, while its DB/scoring section lists domain as a fourth
 * weighted factor alongside the other three. Those two parts of the spec
 * don't quite agree with each other; resolved here by treating the scoring
 * section (domain included, one weighted percent) as authoritative and
 * bucketing that single percent into tiers, with the top tier's cutoff
 * loosened slightly (95, not literally 100) so a small domain mismatch
 * doesn't alone knock an otherwise-perfect candidate out of it. Worth
 * revisiting if that's not what was intended.
 */
export function tierForPercent(percent: number): RelevancyTier | null {
  if (percent >= 95) return '100_percent';
  if (percent >= 90) return '90_plus';
  if (percent >= 75) return '75_plus';
  if (percent >= MIN_QUALIFYING_PERCENT) return '50_plus';
  return null;
}

export async function loadParsedRequirements(jobId: string, t: Transaction): Promise<ParsedRequirements | null> {
  const row = await JobRequirementParsed.findOne({
    where: { jobId, parseStatus: 'success' },
    transaction: t,
  });
  if (!row) return null;
  return {
    extractedSkills: row.extractedSkills,
    extractedRole: row.extractedRole,
    extractedExperienceLevel: row.extractedExperienceLevel,
    extractedDomain: row.extractedDomain,
  };
}

async function loadCandidateSnapshot(
  candidateId: string,
  t: Transaction,
): Promise<CandidateSnapshot | null> {
  const profile = await CandidateProfile.findOne({
    where: { userId: candidateId, status: 'approved', isActivelyLooking: true },
    include: [
      { model: RoleMaster, as: 'primaryRole' },
      { model: DomainMaster, as: 'domain' },
    ],
    transaction: t,
  });
  if (!profile) return null;

  const plain = profile.get({ plain: true }) as CandidateProfileAttributes & {
    primaryRole: RoleMasterAttributes | null;
    domain: DomainMasterAttributes | null;
  };

  const secondaryRoleRows = await CandidateSecondaryRole.findAll({
    where: { candidateId },
    include: [{ model: RoleMaster, as: 'role' }],
    transaction: t,
  });
  const skillRows = await CandidateSkill.findAll({
    where: { candidateId },
    include: [{ model: SkillMaster, as: 'skill' }],
    transaction: t,
  });

  return {
    yearsOfExperience: plain.yearsOfExperience,
    primaryRoleName: plain.primaryRole?.roleName ?? null,
    secondaryRoleNames: secondaryRoleRows.map((row) => {
      const p = row.get({ plain: true }) as CandidateSecondaryRoleAttributes & {
        role: RoleMasterAttributes;
      };
      return p.role.roleName;
    }),
    domainName: plain.domain?.domainName ?? null,
    skillNames: skillRows.map((row) => {
      const p = row.get({ plain: true }) as CandidateSkillAttributes & { skill: SkillMasterAttributes };
      return p.skill.skillName;
    }),
  };
}

/** Upserts, or removes an existing row that no longer qualifies (a profile
 * edit can just as easily drop a score below 50 as raise one above it). */
async function saveScore(
  jobId: string,
  candidateId: string,
  percent: number,
  t: Transaction,
): Promise<void> {
  const tier = tierForPercent(percent);
  if (!tier) {
    await CandidateRelevancyScore.destroy({ where: { jobId, candidateId }, transaction: t });
    return;
  }

  const [row] = await CandidateRelevancyScore.findOrCreate({
    where: { jobId, candidateId },
    defaults: { jobId, candidateId, relevancyPercent: percent, tier },
    transaction: t,
  });
  row.relevancyPercent = percent;
  row.tier = tier;
  row.updatedAt = new Date();
  await row.save({ transaction: t });
}

export interface RecomputeResult {
  scored: number;
  eligible: number;
  capped: boolean;
}

/**
 * Scores every eligible (approved + actively looking) candidate against one
 * job's parsed requirements. Called when a job is created/edited with a
 * description (jdController). No-ops (returns zero counts) if the job has
 * no successfully parsed requirements yet — nothing to score against.
 */
export async function recomputeScoresForJob(jobId: string, t: Transaction): Promise<RecomputeResult> {
  const requirements = await loadParsedRequirements(jobId, t);
  if (!requirements) return { scored: 0, eligible: 0, capped: false };

  const eligible = await CandidateProfile.count({
    where: { status: 'approved', isActivelyLooking: true },
    transaction: t,
  });
  const candidates = await CandidateProfile.findAll({
    where: { status: 'approved', isActivelyLooking: true },
    attributes: ['userId'],
    limit: MAX_CANDIDATES_PER_JOB_RECOMPUTE,
    transaction: t,
  });

  let scored = 0;
  for (const candidate of candidates) {
    const snapshot = await loadCandidateSnapshot(candidate.userId, t);
    if (!snapshot) continue;
    const percent = computeRelevancyPercent(requirements, snapshot);
    await saveScore(jobId, candidate.userId, percent, t);
    scored++;
  }

  return { scored, eligible, capped: eligible > MAX_CANDIDATES_PER_JOB_RECOMPUTE };
}

/**
 * Scores one candidate against every job that currently has successfully
 * parsed requirements. Called when a verifier approves a candidate's
 * profile (verifierController.decideProfile) — the event-triggered
 * recompute agreed on in place of a scheduler.
 */
export async function recomputeScoresForCandidate(
  candidateId: string,
  t: Transaction,
): Promise<RecomputeResult> {
  const snapshot = await loadCandidateSnapshot(candidateId, t);
  if (!snapshot) return { scored: 0, eligible: 0, capped: false };

  const eligible = await Job.count({
    include: [
      {
        model: JobRequirementParsed,
        as: 'requirementsParsed',
        where: { parseStatus: 'success' },
        required: true,
      },
    ],
    transaction: t,
  });
  const jobs = await Job.findAll({
    include: [
      {
        model: JobRequirementParsed,
        as: 'requirementsParsed',
        where: { parseStatus: 'success' },
        required: true,
      },
    ],
    limit: MAX_JOBS_PER_CANDIDATE_RECOMPUTE,
    transaction: t,
  });

  let scored = 0;
  for (const job of jobs) {
    const plain = job.get({ plain: true }) as JobAttributes & {
      requirementsParsed: JobRequirementParsedAttributes;
    };
    const requirements: ParsedRequirements = {
      extractedSkills: plain.requirementsParsed.extractedSkills,
      extractedRole: plain.requirementsParsed.extractedRole,
      extractedExperienceLevel: plain.requirementsParsed.extractedExperienceLevel,
      extractedDomain: plain.requirementsParsed.extractedDomain,
    };
    const percent = computeRelevancyPercent(requirements, snapshot);
    await saveScore(job.id, candidateId, percent, t);
    scored++;
  }

  return { scored, eligible, capped: eligible > MAX_JOBS_PER_CANDIDATE_RECOMPUTE };
}

/**
 * Builds the same CandidateSnapshot shape (see computeRelevancyPercent)
 * directly from a raw external-application form submission, so external
 * applicants (Phase 6) go through the identical scoring logic real
 * candidates do rather than a parallel implementation. Field keys match
 * the seeded Simple/Detailed/Foreign templates (migrations/20240121000001)
 * — `skills` as a comma-separated string, `role` as free text, plain
 * `years_of_experience`. A custom form is required to use those same keys
 * for the fields it does include (see jdController.generateCareersLink's
 * validation) so this stays a single code path rather than one per form
 * type.
 */
export function scoreExternalApplication(
  requirements: ParsedRequirements,
  formData: Record<string, unknown>,
): number {
  const skillsRaw = typeof formData.skills === 'string' ? formData.skills : '';
  const skillNames = skillsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const roleRaw = formData.role;
  const primaryRoleName = typeof roleRaw === 'string' && roleRaw.trim() ? roleRaw.trim() : null;

  const experienceRaw = formData.years_of_experience;
  const parsedExperience =
    typeof experienceRaw === 'number'
      ? experienceRaw
      : typeof experienceRaw === 'string' && experienceRaw.trim()
        ? Number(experienceRaw)
        : NaN;
  const yearsOfExperience = Number.isFinite(parsedExperience) ? parsedExperience : null;

  const snapshot: CandidateSnapshot = {
    yearsOfExperience,
    primaryRoleName,
    secondaryRoleNames: [],
    domainName: null,
    skillNames,
  };

  return computeRelevancyPercent(requirements, snapshot, false);
}
