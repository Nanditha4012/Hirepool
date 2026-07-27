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
  Unlock,
  CompanyProfile,
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
  secondaryRoles: { id: string; roleName: string }[];
  skills: { id: string; skillName: string }[];
  latestVerificationNote: string | null;
  createdAt: Date;
  updatedAt: Date;
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
    secondaryRoles,
    skills,
    latestVerificationNote: latestVerificationLog?.notes ?? null,
    createdAt: plainProfile.createdAt,
    updatedAt: plainProfile.updatedAt,
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

const PROFILE_FIELD_KEYS = [
  'category',
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

    const profileUpdates: Partial<Record<(typeof PROFILE_FIELD_KEYS)[number], unknown>> = {};
    for (const key of PROFILE_FIELD_KEYS) {
      if (body[key] !== undefined) {
        profileUpdates[key] = body[key];
      }
    }
    if (Object.keys(profileUpdates).length > 0) {
      Object.assign(profile, profileUpdates);
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

    const missing: string[] = [];
    const require = (condition: boolean, field: string) => {
      if (!condition) missing.push(field);
    };

    require(!!user.fullName, 'fullName');
    require(!!user.phone, 'phone');
    require(!!profile.primaryRoleId, 'primaryRoleId');

    if (profile.category === 'fresher') {
      require(!!profile.domainId, 'domainId');
      require(!!profile.resumeLink, 'resumeLink');

      const projectCount = await CandidateAchievement.count({
        where: { candidateId: authUser.id, type: 'project' },
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
    } else {
      throw ApiError.badRequest('Candidate category must be set before submitting');
    }

    if (missing.length > 0) {
      throw ApiError.badRequest(`Missing required fields: ${missing.join(', ')}`);
    }

    profile.status = 'submitted';
    profile.submittedAt = new Date();
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
