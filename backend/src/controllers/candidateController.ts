import { Request, Response } from 'express';
import { Transaction } from 'sequelize';
import { z } from 'zod';
import {
  CandidateProfile,
  User,
  RoleMaster,
  DomainMaster,
  CompanyMaster,
  CandidateSecondaryRole,
  CandidateSkill,
  SkillMaster,
  VerificationLog,
  CandidateAchievement,
  CandidatePlatformBadge,
  Unlock,
  CompanyProfile,
  ProfileFieldCheck,
} from '../models';
import type {
  CandidateProfileAttributes,
  CandidateCategory,
  CandidateStatus,
  CompanyType,
  NoticePeriod,
} from '../models/CandidateProfile';
import type { RoleMasterAttributes } from '../models/RoleMaster';
import type { DomainMasterAttributes } from '../models/DomainMaster';
import type { CompanyMasterAttributes } from '../models/CompanyMaster';
import type { CandidateSecondaryRoleAttributes } from '../models/CandidateSecondaryRole';
import type { CandidateSkillAttributes } from '../models/CandidateSkill';
import type { SkillMasterAttributes } from '../models/SkillMaster';
import type { ProfileFieldCheckAttributes } from '../models/ProfileFieldCheck';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';

const setCategorySchema = z.object({
  category: z.enum(['fresher', 'experienced', 'executive']),
});

export const setCategory = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { category } = setCategorySchema.parse(req.body);

  const profile = await runInRequestContext(authUser, async (t) => {
    const existing = await CandidateProfile.findOne({
      where: { userId: authUser.id },
      transaction: t,
    });

    if (!existing) {
      throw ApiError.notFound('Candidate profile not found');
    }

    existing.category = category;
    await existing.save({ transaction: t });
    return existing;
  });

  res.json(profile);
});

export const ping = asyncHandler(async (req: Request, res: Response) => {
  res.json({ message: 'Signed in as candidate', userId: req.user!.id });
});

// ---------------------------------------------------------------------
// Shared response shape for GET/PUT/POST .../me/profile
// ---------------------------------------------------------------------

interface CandidateProfileResponse {
  id: string;
  userId: string;
  fullName: string | null;
  phone: string | null;
  email: string;
  category: CandidateCategory | null;
  status: CandidateStatus;
  primaryRole: { id: string; roleName: string } | null;
  designationRole: { id: string; roleName: string } | null;
  domain: { id: string; domainName: string } | null;
  currentCompany: { id: string; companyName: string } | null;
  resumeLink: string | null;
  portfolioLink: string | null;
  yearsOfExperience: number | null;
  offerLetterOrLinkedinLink: string | null;
  companyType: CompanyType | null;
  teamSizeManaged: number | null;
  budgetOwned: string | null;
  titleLevel: string | null;
  location: string | null;
  noticePeriod: NoticePeriod | null;
  isActivelyLooking: boolean;
  isBoosted: boolean;
  boostExpiresAt: Date | null;
  secondaryRoles: { id: string; roleName: string }[];
  skills: { id: string; skillName: string }[];
  latestVerificationNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Phase 5: everything the candidate needs to read their own submission
  // back — what they sent, what the verifier said about each field, and
  // when. Previously a rejected candidate only got a single free-text note.
  submittedAt: Date | null;
  pendingReverification: boolean;
  reverificationRequestedAt: Date | null;
  fieldReview: CandidateFieldReviewItem[];
  history: CandidateHistoryEntry[];
}

/**
 * One verifier verdict, flattened for the candidate's report.
 *
 * Deliberately omits the reviewer's identity: the candidate is told what was
 * wrong, not who decided it.
 */
interface CandidateFieldReviewItem {
  fieldKey: string;
  fieldLabel: string | null;
  passed: boolean;
  reason: string | null;
  checkedAt: Date;
}

interface CandidateHistoryEntry {
  id: string;
  at: Date;
  title: string;
  detail: string | null;
  tone: 'pass' | 'fail' | 'neutral';
}

async function buildProfileResponse(
  userId: string,
  t: Transaction,
): Promise<CandidateProfileResponse> {
  const user = await User.findByPk(userId, { transaction: t });
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const profile = await CandidateProfile.findOne({
    where: { userId },
    include: [
      { model: RoleMaster, as: 'primaryRole' },
      { model: RoleMaster, as: 'designationRole' },
      { model: DomainMaster, as: 'domain' },
      { model: CompanyMaster, as: 'currentCompany' },
    ],
    transaction: t,
  });

  if (!profile) {
    throw ApiError.notFound('Candidate profile not found');
  }

  const plainProfile = profile.get({ plain: true }) as CandidateProfileAttributes & {
    primaryRole: RoleMasterAttributes | null;
    designationRole: RoleMasterAttributes | null;
    domain: DomainMasterAttributes | null;
    currentCompany: CompanyMasterAttributes | null;
  };

  // Sequential, not Promise.all: these all share transaction `t`, which pins
  // them to a single pg connection — that connection can only run one query
  // at a time, so firing them concurrently trips pg's "client already
  // executing a query" deprecation warning (and will be a hard error in a
  // future pg version).
  const secondaryRoleRows = await CandidateSecondaryRole.findAll({
    where: { candidateId: userId },
    include: [{ model: RoleMaster, as: 'role' }],
    transaction: t,
  });
  const skillRows = await CandidateSkill.findAll({
    where: { candidateId: userId },
    include: [{ model: SkillMaster, as: 'skill' }],
    transaction: t,
  });
  const latestVerificationLog = await VerificationLog.findOne({
    where: { targetType: 'candidate_profile', targetId: plainProfile.id },
    order: [['createdAt', 'DESC']],
    transaction: t,
  });

  // profile_field_checks is append-only, so the candidate's current report is
  // the newest row per field — same collapse the verifier portal does, but
  // stripped of reviewer identity (see CandidateFieldReviewItem).
  const fieldCheckRows = await ProfileFieldCheck.findAll({
    where: { profileId: plainProfile.id },
    order: [['createdAt', 'DESC']],
    transaction: t,
  });

  const newestCheckByField = new Map<string, ProfileFieldCheckAttributes>();
  for (const row of fieldCheckRows) {
    const plain = row.get({ plain: true }) as ProfileFieldCheckAttributes;
    if (!newestCheckByField.has(plain.fieldKey)) {
      newestCheckByField.set(plain.fieldKey, plain);
    }
  }

  const fieldReview: CandidateFieldReviewItem[] = Array.from(newestCheckByField.values())
    .map((check) => ({
      fieldKey: check.fieldKey,
      fieldLabel: check.fieldLabel,
      passed: check.passed,
      reason: check.passed ? null : check.reasonText,
      checkedAt: check.createdAt,
    }))
    // Failures first — they are the actionable part of the report.
    .sort((a, b) => Number(a.passed) - Number(b.passed));

  const decisionLogs = await VerificationLog.findAll({
    where: { targetType: 'candidate_profile', targetId: plainProfile.id },
    order: [['createdAt', 'DESC']],
    transaction: t,
  });

  const history: CandidateHistoryEntry[] = [];
  if (plainProfile.submittedAt) {
    history.push({
      id: `submitted:${plainProfile.id}`,
      at: plainProfile.submittedAt,
      title: 'You submitted your profile for verification',
      detail: null,
      tone: 'neutral',
    });
  }
  if (plainProfile.reverificationRequestedAt) {
    history.push({
      id: `reverify:${plainProfile.id}`,
      at: plainProfile.reverificationRequestedAt,
      title: 'You requested re-verification of your new items',
      detail: null,
      tone: 'neutral',
    });
  }
  for (const log of decisionLogs) {
    history.push({
      id: `log:${log.id}`,
      at: log.createdAt,
      title: `Verifier decision: ${log.decision.replace('_', ' ')}`,
      detail: log.notes,
      tone: log.decision === 'approved' ? 'pass' : log.decision === 'flagged' ? 'neutral' : 'fail',
    });
  }
  for (const check of newestCheckByField.values()) {
    history.push({
      id: `check:${check.id}`,
      at: check.createdAt,
      title: `${check.fieldLabel || check.fieldKey} — ${check.passed ? 'accepted' : 'not accepted'}`,
      detail: check.passed ? null : check.reasonText,
      tone: check.passed ? 'pass' : 'fail',
    });
  }
  history.sort((a, b) => b.at.getTime() - a.at.getTime());

  const secondaryRoles = secondaryRoleRows.map((row) => {
    const plain = row.get({ plain: true }) as CandidateSecondaryRoleAttributes & {
      role: RoleMasterAttributes;
    };
    return { id: plain.role.id, roleName: plain.role.roleName };
  });

  const skills = skillRows.map((row) => {
    const plain = row.get({ plain: true }) as CandidateSkillAttributes & {
      skill: SkillMasterAttributes;
    };
    return { id: plain.skill.id, skillName: plain.skill.skillName };
  });

  return {
    id: plainProfile.id,
    userId: plainProfile.userId,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email,
    category: plainProfile.category,
    status: plainProfile.status,
    primaryRole: plainProfile.primaryRole
      ? { id: plainProfile.primaryRole.id, roleName: plainProfile.primaryRole.roleName }
      : null,
    designationRole: plainProfile.designationRole
      ? { id: plainProfile.designationRole.id, roleName: plainProfile.designationRole.roleName }
      : null,
    domain: plainProfile.domain
      ? { id: plainProfile.domain.id, domainName: plainProfile.domain.domainName }
      : null,
    currentCompany: plainProfile.currentCompany
      ? { id: plainProfile.currentCompany.id, companyName: plainProfile.currentCompany.companyName }
      : null,
    resumeLink: plainProfile.resumeLink,
    portfolioLink: plainProfile.portfolioLink,
    yearsOfExperience: plainProfile.yearsOfExperience,
    offerLetterOrLinkedinLink: plainProfile.offerLetterOrLinkedinLink,
    companyType: plainProfile.companyType,
    teamSizeManaged: plainProfile.teamSizeManaged,
    budgetOwned: plainProfile.budgetOwned,
    titleLevel: plainProfile.titleLevel,
    location: plainProfile.location,
    noticePeriod: plainProfile.noticePeriod,
    isActivelyLooking: plainProfile.isActivelyLooking,
    // Effective, not just the stored flag: there's no cron job clearing
    // `isBoosted` once `boostExpiresAt` passes (see Phase 6 scope decisions),
    // so a candidate whose boost lapsed would otherwise show as boosted
    // forever until they buy another one. Compute the true current state
    // here instead of trusting the raw column.
    isBoosted: Boolean(
      plainProfile.isBoosted && (!plainProfile.boostExpiresAt || plainProfile.boostExpiresAt > new Date()),
    ),
    boostExpiresAt: plainProfile.boostExpiresAt,
    secondaryRoles,
    skills,
    latestVerificationNote: latestVerificationLog?.notes ?? null,
    createdAt: plainProfile.createdAt,
    updatedAt: plainProfile.updatedAt,
    submittedAt: plainProfile.submittedAt,
    pendingReverification: plainProfile.pendingReverification,
    reverificationRequestedAt: plainProfile.reverificationRequestedAt,
    fieldReview,
    history,
  };
}

// ---------------------------------------------------------------------
// GET /me/profile
// ---------------------------------------------------------------------

export const getMyProfile = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const response = await runInRequestContext(authUser, (t) => buildProfileResponse(authUser.id, t));

  res.json(response);
});

// ---------------------------------------------------------------------
// PUT /me/profile (partial draft-autosave — every field optional)
// ---------------------------------------------------------------------

const upsertProfileSchema = z.object({
  category: z.enum(['fresher', 'experienced', 'executive']).optional(),
  fullName: z.string().optional(),
  phone: z.string().optional(),
  // Combobox-backed id fields round-trip as `null` from the frontend
  // (FormState types them `string | null`, defaulting to null until the
  // candidate picks something) — `.nullable()` alongside `.optional()` is
  // required so an unset field validates instead of 400ing on every save
  // until every optional dropdown has been touched.
  primaryRoleId: z.string().uuid().nullable().optional(),
  secondaryRoleIds: z.array(z.string().uuid()).optional(),
  skillIds: z.array(z.string().uuid()).optional(),
  domainId: z.string().uuid().nullable().optional(),
  resumeLink: z.string().optional(),
  portfolioLink: z.string().optional(),
  yearsOfExperience: z.number().int().optional(),
  currentCompanyId: z.string().uuid().nullable().optional(),
  designationRoleId: z.string().uuid().nullable().optional(),
  offerLetterOrLinkedinLink: z.string().optional(),
  companyType: z.enum(['mnc', 'startup', 'agency']).optional(),
  teamSizeManaged: z.number().int().optional(),
  budgetOwned: z.string().optional(),
  titleLevel: z.string().optional(),
  // Phase 3 additions — previously missing from this schema entirely, so
  // the frontend's location/noticePeriod fields were silently dropped
  // (zod ignores unknown keys on a plain z.object()) rather than erroring,
  // but still never persisted.
  location: z.string().optional(),
  noticePeriod: z.enum(['immediate', '15_days', '30_days', '60_days', '90_plus_days']).nullable().optional(),
});

// Handled separately from PROFILE_FIELD_KEYS below — a plain unconditional
// assignment was a real bug: it let an already-approved, live candidate
// silently relabel themselves e.g. Fresher -> Experienced with none of that
// category's required fields filled in and no re-verification of any kind,
// since this endpoint never touched `status`/`pendingReverification`. See
// CATEGORY_CHANGE_DESIGN.md for the reasoning behind upgrade-only + "stays
// live, flagged for re-check" rather than either silently allowing it or
// yanking the profile offline.
const CATEGORY_RANK: Record<CandidateCategory, number> = { fresher: 0, experienced: 1, executive: 2 };

const PROFILE_FIELD_KEYS = [
  'primaryRoleId',
  'domainId',
  'resumeLink',
  'portfolioLink',
  'yearsOfExperience',
  'currentCompanyId',
  'designationRoleId',
  'offerLetterOrLinkedinLink',
  'companyType',
  'teamSizeManaged',
  'budgetOwned',
  'titleLevel',
  'location',
  'noticePeriod',
] as const;

export const upsertMyProfile = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = upsertProfileSchema.parse(req.body);

  const response = await runInRequestContext(authUser, async (t) => {
    const user = await User.findByPk(authUser.id, { transaction: t });
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (body.fullName !== undefined) user.fullName = body.fullName;
    if (body.phone !== undefined) user.phone = body.phone;
    if (body.fullName !== undefined || body.phone !== undefined) {
      await user.save({ transaction: t });
    }

    const profile = await CandidateProfile.findOne({ where: { userId: authUser.id }, transaction: t });
    if (!profile) {
      throw ApiError.notFound('Candidate profile not found');
    }

    let categoryChanged = false;
    if (body.category !== undefined && body.category !== profile.category) {
      if (profile.status === 'approved') {
        // Upgrade-only: fresher -> experienced -> executive. Blocked
        // sideways/backward so a rejected Experienced profile can't be
        // resubmitted as Fresher to dodge the original rejection reason.
        if (profile.category === null || CATEGORY_RANK[body.category] <= CATEGORY_RANK[profile.category]) {
          throw ApiError.badRequest(
            'Once your profile is approved, category can only move forward (Fresher → Experienced → Executive), not sideways or backward. Contact support for anything else.',
          );
        }
        profile.category = body.category;
        // Stays `approved` and visible to companies with its OLD data — see
        // markProfileNeedsReverification's identical convention for
        // badges/achievements. The candidate fills in the new category's
        // required fields, then explicitly asks for a look via
        // requestReverification (which now also validates those fields are
        // actually complete before it lets the ask through).
        profile.pendingReverification = true;
        profile.reverificationRequestedAt = null;
      } else {
        // Not live yet (draft/submitted/under_review/rejected/needs_info) —
        // nothing to protect, freely settable exactly as every other field
        // on this form already is.
        profile.category = body.category;
      }
      categoryChanged = true;
    }

    const profileUpdates: Partial<Record<(typeof PROFILE_FIELD_KEYS)[number], unknown>> = {};
    for (const key of PROFILE_FIELD_KEYS) {
      if (body[key] !== undefined) {
        profileUpdates[key] = body[key];
      }
    }
    if (Object.keys(profileUpdates).length > 0) {
      Object.assign(profile, profileUpdates);
    }
    if (categoryChanged || Object.keys(profileUpdates).length > 0) {
      await profile.save({ transaction: t });
    }

    if (body.secondaryRoleIds !== undefined) {
      await CandidateSecondaryRole.destroy({ where: { candidateId: authUser.id }, transaction: t });
      if (body.secondaryRoleIds.length > 0) {
        await CandidateSecondaryRole.bulkCreate(
          body.secondaryRoleIds.map((roleId) => ({ candidateId: authUser.id, roleId })),
          { transaction: t },
        );
      }
    }

    if (body.skillIds !== undefined) {
      await CandidateSkill.destroy({ where: { candidateId: authUser.id }, transaction: t });
      if (body.skillIds.length > 0) {
        await CandidateSkill.bulkCreate(
          body.skillIds.map((skillId) => ({ candidateId: authUser.id, skillId })),
          { transaction: t },
        );
      }
    }

    return buildProfileResponse(authUser.id, t);
  });

  res.json(response);
});

/**
 * The category-conditional required-field set — shared by the initial
 * submission (submitMyProfile) and by re-verification requests made after an
 * approved profile's category was upgraded (requestReverification). Both
 * cases mean the same thing: "this profile, under its current category, is
 * about to be judged against that category's Track 1 checklist — is it
 * actually complete?"
 */
async function findMissingCategoryFields(
  profile: CandidateProfile,
  candidateUserId: string,
  t: Transaction,
): Promise<string[]> {
  const missing: string[] = [];
  const require = (condition: boolean, field: string) => {
    if (!condition) missing.push(field);
  };

  if (profile.category === 'fresher') {
    require(!!profile.domainId, 'domainId');
    require(!!profile.resumeLink, 'resumeLink');

    const projectCount = await CandidateAchievement.count({
      where: { candidateId: candidateUserId, type: 'project' },
      transaction: t,
    });
    require(projectCount >= 3, 'projects (at least 3 required)');
  } else if (profile.category === 'experienced' || profile.category === 'executive') {
    require(!!profile.domainId, 'domainId');
    require(!!profile.resumeLink, 'resumeLink');
    require(
      profile.yearsOfExperience !== null && profile.yearsOfExperience !== undefined,
      'yearsOfExperience',
    );
    require(!!profile.currentCompanyId, 'currentCompanyId');
    require(!!profile.designationRoleId, 'designationRoleId');
    require(!!profile.offerLetterOrLinkedinLink, 'offerLetterOrLinkedinLink');

    if (profile.category === 'executive') {
      require(
        profile.teamSizeManaged !== null && profile.teamSizeManaged !== undefined,
        'teamSizeManaged',
      );
    }
  }

  return missing;
}

// ---------------------------------------------------------------------
// POST /me/profile/submit
// ---------------------------------------------------------------------

export const submitMyProfile = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const response = await runInRequestContext(authUser, async (t) => {
    // Sequential — see the comment in buildProfileResponse above: queries
    // sharing transaction `t` share one pg connection and can't run concurrently.
    const user = await User.findByPk(authUser.id, { transaction: t });
    const profile = await CandidateProfile.findOne({ where: { userId: authUser.id }, transaction: t });

    if (!user) {
      throw ApiError.notFound('User not found');
    }
    if (!profile) {
      throw ApiError.notFound('Candidate profile not found');
    }

    if (!['draft', 'needs_info', 'rejected'].includes(profile.status)) {
      throw ApiError.conflict('Profile cannot be submitted from its current status');
    }

    if (!profile.category) {
      throw ApiError.badRequest('Candidate category must be set before submitting');
    }

    const missing: string[] = [];
    const require = (condition: boolean, field: string) => {
      if (!condition) missing.push(field);
    };

    require(!!user.fullName, 'fullName');
    require(!!user.phone, 'phone');
    require(!!profile.primaryRoleId, 'primaryRoleId');
    missing.push(...(await findMissingCategoryFields(profile, authUser.id, t)));

    if (missing.length > 0) {
      throw ApiError.badRequest(`Missing required fields: ${missing.join(', ')}`);
    }

    profile.status = 'submitted';
    profile.submittedAt = new Date();
    // A full resubmission supersedes any outstanding re-verification ask —
    // the whole profile is going back through review anyway.
    profile.pendingReverification = false;
    profile.reverificationRequestedAt = null;
    await profile.save({ transaction: t });

    return buildProfileResponse(authUser.id, t);
  });

  res.json(response);
});

// ---------------------------------------------------------------------
// POST /me/profile/request-reverification
//
// For an already-approved candidate who has added or edited something since
// going live (a new project, an updated badge, or — since the category
// upgrade flow below — a category change like Fresher becoming Experienced).
// The profile does NOT leave the portal — it stays `approved` and visible to
// companies; only what changed is unverified. For badges/achievements those
// items are already sitting in the verifier's own pending-item queues; for a
// category upgrade, `pendingReverification` was already set to true the
// moment the category changed (see upsertMyProfile), which is what the
// `|| profile.pendingReverification` branch below picks up.
//
// What this endpoint adds is the explicit ask. Without it, a candidate could
// keep appending unverified work (or sit on a just-upgraded, half-filled-in
// category) indefinitely and nothing would tell the verifier the candidate
// considers it ready to look at.
// ---------------------------------------------------------------------

export const requestReverification = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const response = await runInRequestContext(authUser, async (t) => {
    const profile = await CandidateProfile.findOne({
      where: { userId: authUser.id },
      transaction: t,
    });
    if (!profile) {
      throw ApiError.notFound('Candidate profile not found');
    }

    if (profile.status !== 'approved') {
      throw ApiError.conflict(
        'Re-verification is only for approved profiles — use Submit for review instead',
      );
    }

    // Sequential — shares transaction `t`.
    const pendingAchievements = await CandidateAchievement.count({
      where: { candidateId: authUser.id, verificationStatus: 'pending' },
      transaction: t,
    });
    const pendingBadges = await CandidatePlatformBadge.count({
      where: { candidateId: authUser.id, verificationStatus: 'pending' },
      transaction: t,
    });

    if (pendingAchievements + pendingBadges === 0 && !profile.pendingReverification) {
      throw ApiError.badRequest('You have no unverified items to submit');
    }

    // Only relevant for the category-upgrade path — a pending badge/
    // achievement doesn't need this (those are validated on their own way in
    // via platformBadgeController/achievementController), but a candidate who
    // upgraded category shouldn't be able to ask a verifier to look before
    // they've actually filled in the new category's required fields (years
    // of experience, current company, etc.) — that would just bounce as
    // needs_info and waste the review pass.
    const missing = await findMissingCategoryFields(profile, authUser.id, t);
    if (missing.length > 0) {
      throw ApiError.badRequest(`Finish these fields before requesting re-verification: ${missing.join(', ')}`);
    }

    profile.pendingReverification = true;
    profile.reverificationRequestedAt = new Date();
    await profile.save({ transaction: t });

    return buildProfileResponse(authUser.id, t);
  });

  res.json(response);
});

// ---------------------------------------------------------------------
// PATCH /me/looking-status
// ---------------------------------------------------------------------

const setLookingStatusSchema = z.object({
  isActivelyLooking: z.boolean(),
});

export const setLookingStatus = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { isActivelyLooking } = setLookingStatusSchema.parse(req.body);

  const profile = await runInRequestContext(authUser, async (t) => {
    const existing = await CandidateProfile.findOne({
      where: { userId: authUser.id },
      transaction: t,
    });

    if (!existing) {
      throw ApiError.notFound('Candidate profile not found');
    }

    existing.isActivelyLooking = isActivelyLooking;
    await existing.save({ transaction: t });
    return existing;
  });

  res.json(profile);
});

// ---------------------------------------------------------------------
// GET /me/unlocked-by — Phase 3: companies who have unlocked this
// candidate's contact info. Relies on the RLS policies added in
// migrations/20240103000002-phase3-rls-policies.js
// (unlocks_candidate_select, company_profiles_candidate_select).
// ---------------------------------------------------------------------

interface UnlockedByCompanyResponse {
  companyId: string;
  companyName: string | null;
  logoLink: string | null;
  industry: string | null;
  unlockedAt: Date;
}

export const listWhoUnlockedMe = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const results = await runInRequestContext(authUser, async (t) => {
    const unlocks = await Unlock.findAll({
      where: { candidateId: authUser.id },
      order: [['unlockedAt', 'DESC']],
      transaction: t,
    });

    const items: UnlockedByCompanyResponse[] = [];
    for (const unlock of unlocks) {
      // Sequential — shares transaction `t` (see buildProfileResponse above).
      const companyProfile = await CompanyProfile.findOne({
        where: { userId: unlock.companyId },
        transaction: t,
      });

      items.push({
        companyId: unlock.companyId,
        companyName: companyProfile?.companyName ?? null,
        logoLink: companyProfile?.logoLink ?? null,
        industry: companyProfile?.industry ?? null,
        unlockedAt: unlock.unlockedAt,
      });
    }

    return items;
  });

  res.json(results);
});
