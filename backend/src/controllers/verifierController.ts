import { Request, Response } from 'express';
import { Op, Transaction, literal } from 'sequelize';
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
  CandidatePlatformBadge,
  CandidateAchievement,
  VerificationLog,
  Notification,
  RejectionReasonMaster,
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
import type { UserAttributes } from '../models/User';
import type { CandidatePlatformBadgeAttributes } from '../models/CandidatePlatformBadge';
import type { CandidateAchievementAttributes } from '../models/CandidateAchievement';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';

export const ping = asyncHandler(async (req: Request, res: Response) => {
  res.json({ message: 'Signed in as verifier', userId: req.user!.id });
});

// ---------------------------------------------------------------------
// GET /queue/profiles
// ---------------------------------------------------------------------

const listProfileQueueSchema = z.object({
  category: z.enum(['fresher', 'experienced', 'executive']),
});

interface ProfileQueueRow {
  id: string;
  userId: string;
  fullName: string | null;
  category: CandidateCategory | null;
  status: CandidateStatus;
  submittedAt: Date | null;
  primaryRole: { id: string; roleName: string } | null;
  assignedVerifierId: string | null;
  assignedVerifierName: string | null;
}

export const listProfileQueue = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { category } = listProfileQueueSchema.parse(req.query);

  const rows = await runInRequestContext(authUser, async (t) => {
    const profiles = await CandidateProfile.findAll({
      where: { category, status: { [Op.in]: ['submitted', 'under_review'] } },
      include: [
        { model: RoleMaster, as: 'primaryRole' },
        { model: User, as: 'user' },
      ],
      // Profiles submitted before this phase shipped have no submittedAt —
      // treat those as lowest priority rather than erroring/crashing.
      order: [literal('submitted_at ASC NULLS LAST')],
      transaction: t,
    });

    const results: ProfileQueueRow[] = [];
    for (const profile of profiles) {
      const plain = profile.get({ plain: true }) as CandidateProfileAttributes & {
        primaryRole: RoleMasterAttributes | null;
        user: UserAttributes | null;
      };

      // Sequential — shares transaction `t` with the findAll above (see the
      // discipline note in candidateController.buildProfileResponse: one pg
      // connection per transaction, only one query at a time).
      let assignedVerifierName: string | null = null;
      if (plain.assignedVerifierId) {
        const verifier = await User.findByPk(plain.assignedVerifierId, { transaction: t });
        assignedVerifierName = verifier?.fullName ?? null;
      }

      results.push({
        id: plain.id,
        userId: plain.userId,
        fullName: plain.user?.fullName ?? null,
        category: plain.category,
        status: plain.status,
        submittedAt: plain.submittedAt,
        primaryRole: plain.primaryRole
          ? { id: plain.primaryRole.id, roleName: plain.primaryRole.roleName }
          : null,
        assignedVerifierId: plain.assignedVerifierId,
        assignedVerifierName,
      });
    }

    return results;
  });

  res.json(rows);
});

// ---------------------------------------------------------------------
// POST /profiles/:id/claim
// ---------------------------------------------------------------------

export const claimProfile = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  const profile = await runInRequestContext(authUser, async (t) => {
    const existing = await CandidateProfile.findByPk(id, { transaction: t });
    if (!existing) {
      throw ApiError.notFound('Candidate profile not found');
    }

    if (existing.assignedVerifierId && existing.assignedVerifierId !== authUser.id) {
      throw ApiError.conflict('Already claimed by another reviewer');
    }

    existing.assignedVerifierId = authUser.id;
    if (existing.status === 'submitted') {
      existing.status = 'under_review';
    }
    await existing.save({ transaction: t });

    return existing;
  });

  res.json(profile);
});

// ---------------------------------------------------------------------
// GET /profiles/:id — rich review shape.
//
// candidateController.buildProfileResponse is a private, non-exported
// function (takes a userId, not a profile id, and isn't part of that
// module's exports) — per the Phase 4 spec, rather than change that
// module's exports, the same field list is replicated here, keyed off the
// profile id from the route param instead of the candidate's own userId.
// ---------------------------------------------------------------------

interface VerifierProfileReviewResponse {
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
  platformBadges: CandidatePlatformBadgeAttributes[];
  achievements: CandidateAchievementAttributes[];
}

async function buildReviewProfileResponse(
  profileId: string,
  t: Transaction,
): Promise<VerifierProfileReviewResponse> {
  const profile = await CandidateProfile.findOne({
    where: { id: profileId },
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

  // Sequential from here on — everything shares transaction `t`.
  const user = await User.findByPk(plainProfile.userId, { transaction: t });
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const secondaryRoleRows = await CandidateSecondaryRole.findAll({
    where: { candidateId: plainProfile.userId },
    include: [{ model: RoleMaster, as: 'role' }],
    transaction: t,
  });
  const skillRows = await CandidateSkill.findAll({
    where: { candidateId: plainProfile.userId },
    include: [{ model: SkillMaster, as: 'skill' }],
    transaction: t,
  });
  const latestVerificationLog = await VerificationLog.findOne({
    where: { targetType: 'candidate_profile', targetId: plainProfile.id },
    order: [['createdAt', 'DESC']],
    transaction: t,
  });
  // ALL platform badges/achievements regardless of verificationStatus — the
  // verifier needs pending/verified/incorrect ones for context. Track 2
  // decisions on these happen via the badge/achievement queue endpoints,
  // not here.
  const platformBadgeRows = await CandidatePlatformBadge.findAll({
    where: { candidateId: plainProfile.userId },
    transaction: t,
  });
  const achievementRows = await CandidateAchievement.findAll({
    where: { candidateId: plainProfile.userId },
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
    platformBadges: platformBadgeRows.map((row) => row.get({ plain: true })),
    achievements: achievementRows.map((row) => row.get({ plain: true })),
  };
}

export const getProfileForReview = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  const response = await runInRequestContext(authUser, (t) => buildReviewProfileResponse(id, t));

  res.json(response);
});

// ---------------------------------------------------------------------
// POST /profiles/:id/decision
// ---------------------------------------------------------------------

const decideProfileSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'needs_info', 'flagged']),
  reasonId: z.string().uuid().optional(),
  note: z.string().optional(),
});

export const decideProfile = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = decideProfileSchema.parse(req.body);

  const profile = await runInRequestContext(authUser, async (t) => {
    const existing = await CandidateProfile.findByPk(id, { transaction: t });
    if (!existing) {
      throw ApiError.notFound('Candidate profile not found');
    }

    let notes: string | null;
    if (body.decision === 'rejected' || body.decision === 'needs_info') {
      if (!body.reasonId) {
        throw ApiError.badRequest('reasonId is required for this decision');
      }
      const reason = await RejectionReasonMaster.findByPk(body.reasonId, { transaction: t });
      if (!reason || reason.scope !== 'profile') {
        throw ApiError.badRequest('reasonId must reference a valid profile-scoped rejection reason');
      }
      notes = `${reason.reasonText}${body.note ? ' — ' + body.note : ''}`;
    } else {
      // 'approved' / 'flagged' — no reason lookup, free-text note only.
      notes = body.note ?? null;
    }

    let statusChanged = true;
    if (body.decision === 'approved') {
      existing.status = 'approved';
    } else if (body.decision === 'rejected') {
      existing.status = 'rejected';
    } else if (body.decision === 'needs_info') {
      existing.status = 'needs_info';
    } else {
      // 'flagged' escalates to Admin per spec — Phase 5 consumes flagged
      // verification_logs rows; this phase just needs the log to exist,
      // profile.status is intentionally left untouched.
      statusChanged = false;
    }

    if (statusChanged) {
      await existing.save({ transaction: t });
    }

    await VerificationLog.create(
      {
        targetType: 'candidate_profile',
        targetId: existing.id,
        reviewerId: authUser.id,
        decision: body.decision,
        notes,
      },
      { transaction: t },
    );

    const messageByDecision: Record<typeof body.decision, string> = {
      approved: 'Your profile has been approved.',
      rejected: `Your profile was rejected. Reason: ${notes}`,
      needs_info: `More information is needed on your profile. Reason: ${notes}`,
      flagged: 'Your profile has been flagged for additional review.',
    };

    await Notification.create(
      {
        userId: existing.userId,
        type: 'profile_status_changed',
        message: messageByDecision[body.decision],
        link: '/candidate',
      },
      { transaction: t },
    );

    return existing;
  });

  res.json(profile);
});

// ---------------------------------------------------------------------
// GET /queue/badges
// ---------------------------------------------------------------------

export const listBadgeQueue = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const rows = await runInRequestContext(authUser, async (t) => {
    const badges = await CandidatePlatformBadge.findAll({
      where: { verificationStatus: 'pending' },
      order: [['createdAt', 'ASC']],
      transaction: t,
    });

    const results: (CandidatePlatformBadgeAttributes & { candidateFullName: string | null })[] = [];
    for (const badge of badges) {
      // Sequential — shares transaction `t`.
      const candidate = await User.findByPk(badge.candidateId, { transaction: t });
      results.push({
        ...(badge.get({ plain: true }) as CandidatePlatformBadgeAttributes),
        candidateFullName: candidate?.fullName ?? null,
      });
    }

    return results;
  });

  res.json(rows);
});

// ---------------------------------------------------------------------
// POST /badges/:id/decision
// ---------------------------------------------------------------------

const decideBadgeSchema = z.object({
  decision: z.enum(['verified', 'incorrect']),
  reasonId: z.string().uuid().optional(),
  note: z.string().optional(),
});

export const decideBadge = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = decideBadgeSchema.parse(req.body);

  const badge = await runInRequestContext(authUser, async (t) => {
    const existing = await CandidatePlatformBadge.findByPk(id, { transaction: t });
    if (!existing) {
      throw ApiError.notFound('Platform badge not found');
    }

    let notes: string | null;
    if (body.decision === 'incorrect') {
      if (!body.reasonId) {
        throw ApiError.badRequest('reasonId is required for this decision');
      }
      const reason = await RejectionReasonMaster.findByPk(body.reasonId, { transaction: t });
      if (!reason || reason.scope !== 'item') {
        throw ApiError.badRequest('reasonId must reference a valid item-scoped rejection reason');
      }
      notes = `${reason.reasonText}${body.note ? ' — ' + body.note : ''}`;
    } else {
      notes = body.note ?? null;
    }

    // The badge's own verificationStatus enum is 'pending'|'verified'|'rejected'
    // (distinct from the VerificationLog decision enum, which uses
    // 'verified'/'incorrect') — map the verifier's 'incorrect' decision onto
    // the model's 'rejected' status.
    existing.verificationStatus = body.decision === 'incorrect' ? 'rejected' : 'verified';
    existing.rejectionReason = body.decision === 'incorrect' ? notes : null;
    await existing.save({ transaction: t });

    await VerificationLog.create(
      {
        targetType: 'platform_badge',
        targetId: existing.id,
        reviewerId: authUser.id,
        decision: body.decision,
        notes,
      },
      { transaction: t },
    );

    await Notification.create(
      {
        userId: existing.candidateId,
        type: 'badge_status_changed',
        message:
          body.decision === 'verified'
            ? `Your ${existing.platformName} badge has been verified.`
            : `Your ${existing.platformName} badge was marked incorrect. Reason: ${notes}`,
        link: '/candidate',
      },
      { transaction: t },
    );

    return existing;
  });

  res.json(badge);
});

// ---------------------------------------------------------------------
// GET /queue/achievements
// ---------------------------------------------------------------------

const listAchievementQueueSchema = z.object({
  type: z.enum(['project', 'research', 'achievement']).optional(),
});

export const listAchievementQueue = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { type } = listAchievementQueueSchema.parse(req.query);

  const rows = await runInRequestContext(authUser, async (t) => {
    const achievements = await CandidateAchievement.findAll({
      where: { verificationStatus: 'pending', ...(type ? { type } : {}) },
      order: [['createdAt', 'ASC']],
      transaction: t,
    });

    const results: (CandidateAchievementAttributes & { candidateFullName: string | null })[] = [];
    for (const achievement of achievements) {
      // Sequential — shares transaction `t`.
      const candidate = await User.findByPk(achievement.candidateId, { transaction: t });
      results.push({
        ...(achievement.get({ plain: true }) as CandidateAchievementAttributes),
        candidateFullName: candidate?.fullName ?? null,
      });
    }

    return results;
  });

  res.json(rows);
});

// ---------------------------------------------------------------------
// POST /achievements/:id/decision
// ---------------------------------------------------------------------

const decideAchievementSchema = z.object({
  decision: z.enum(['verified', 'incorrect']),
  reasonId: z.string().uuid().optional(),
  note: z.string().optional(),
});

export const decideAchievement = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = decideAchievementSchema.parse(req.body);

  const achievement = await runInRequestContext(authUser, async (t) => {
    const existing = await CandidateAchievement.findByPk(id, { transaction: t });
    if (!existing) {
      throw ApiError.notFound('Achievement not found');
    }

    let notes: string | null;
    if (body.decision === 'incorrect') {
      if (!body.reasonId) {
        throw ApiError.badRequest('reasonId is required for this decision');
      }
      const reason = await RejectionReasonMaster.findByPk(body.reasonId, { transaction: t });
      if (!reason || reason.scope !== 'item') {
        throw ApiError.badRequest('reasonId must reference a valid item-scoped rejection reason');
      }
      notes = `${reason.reasonText}${body.note ? ' — ' + body.note : ''}`;
    } else {
      notes = body.note ?? null;
    }

    // Same enum mapping note as decideBadge above: the achievement's own
    // verificationStatus is 'pending'|'verified'|'rejected'.
    existing.verificationStatus = body.decision === 'incorrect' ? 'rejected' : 'verified';
    existing.rejectionReason = body.decision === 'incorrect' ? notes : null;
    await existing.save({ transaction: t });

    await VerificationLog.create(
      {
        targetType: 'achievement',
        targetId: existing.id,
        reviewerId: authUser.id,
        decision: body.decision,
        notes,
      },
      { transaction: t },
    );

    await Notification.create(
      {
        userId: existing.candidateId,
        type: 'achievement_status_changed',
        message:
          body.decision === 'verified'
            ? `Your "${existing.title}" ${existing.type} has been verified.`
            : `Your "${existing.title}" ${existing.type} was marked incorrect. Reason: ${notes}`,
        link: '/candidate',
      },
      { transaction: t },
    );

    return existing;
  });

  res.json(achievement);
});

// ---------------------------------------------------------------------
// GET /analytics
// ---------------------------------------------------------------------

interface AnalyticsResponse {
  avgTimeToApproveHours: number | null;
  backlog: {
    profilesSubmitted: number;
    badgesPending: number;
    achievementsPending: number;
  };
  rejectionReasonBreakdown: { notes: string | null; count: number }[];
}

export const getAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const result = await runInRequestContext(authUser, async (t) => {
    // avgTimeToApproveHours: no clean single Sequelize aggregate for a
    // cross-table datetime diff at this scale — load the small working set
    // and average in JS (hobby/demo scale, prioritizing correctness/simplicity).
    const approvedLogs = await VerificationLog.findAll({
      where: { decision: 'approved', targetType: 'candidate_profile' },
      transaction: t,
    });

    const diffsHours: number[] = [];
    for (const log of approvedLogs) {
      // Sequential — shares transaction `t`.
      const profile = await CandidateProfile.findByPk(log.targetId, { transaction: t });
      if (profile?.submittedAt) {
        const diffMs = log.createdAt.getTime() - profile.submittedAt.getTime();
        diffsHours.push(diffMs / (1000 * 60 * 60));
      }
    }
    const avgTimeToApproveHours =
      diffsHours.length > 0 ? diffsHours.reduce((a, b) => a + b, 0) / diffsHours.length : null;

    const profilesSubmitted = await CandidateProfile.count({
      where: { status: { [Op.in]: ['submitted', 'under_review'] } },
      transaction: t,
    });
    const badgesPending = await CandidatePlatformBadge.count({
      where: { verificationStatus: 'pending' },
      transaction: t,
    });
    const achievementsPending = await CandidateAchievement.count({
      where: { verificationStatus: 'pending' },
      transaction: t,
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentDecisionLogs = await VerificationLog.findAll({
      where: {
        decision: { [Op.in]: ['rejected', 'needs_info', 'incorrect'] },
        createdAt: { [Op.gte]: thirtyDaysAgo },
      },
      transaction: t,
    });

    const counts = new Map<string | null, number>();
    for (const log of recentDecisionLogs) {
      counts.set(log.notes, (counts.get(log.notes) ?? 0) + 1);
    }
    const rejectionReasonBreakdown = Array.from(counts.entries())
      .map(([notes, count]) => ({ notes, count }))
      .sort((a, b) => b.count - a.count);

    const response: AnalyticsResponse = {
      avgTimeToApproveHours,
      backlog: { profilesSubmitted, badgesPending, achievementsPending },
      rejectionReasonBreakdown,
    };
    return response;
  });

  res.json(result);
});
