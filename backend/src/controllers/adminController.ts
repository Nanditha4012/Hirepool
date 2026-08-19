import { Request, Response } from 'express';
import { Op, Transaction, UniqueConstraintError } from 'sequelize';
import { z } from 'zod';
import {
  User,
  CandidateProfile,
  CompanyProfile,
  VerificationLog,
  AdminAuditLog,
  RoleMaster,
  PlatformBadgeMaster,
  CompanyMaster,
  Message,
  Notification,
  CandidatePlatformBadge,
  CandidateAchievement,
  SkillMaster,
  DomainMaster,
  CompanyRequest,
  PlanMaster,
  Unlock,
  CompanyBlock,
  RejectionReasonMaster,
  ProfileFieldCheck,
  Announcement,
  SiteSetting,
  Payment,
  VerifierInvite,
  RelevancyPackagePriceBand,
  McqMaster,
} from '../models';
import type { CandidateProfileAttributes, CandidateStatus } from '../models/CandidateProfile';
import type { UserAttributes } from '../models/User';
import type { CompanyProfileAttributes } from '../models/CompanyProfile';
import type { PlanMasterAttributes } from '../models/PlanMaster';
import type { PaymentAttributes } from '../models/Payment';
import type { VerifierInviteAttributes } from '../models/VerifierInvite';
import type { AdminAuditLogAttributes } from '../models/AdminAuditLog';
import type { VerificationDecision } from '../models/VerificationLog';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { hashPassword } from '../utils/password';
import { signAccessToken } from '../utils/jwt';

export const ping = asyncHandler(async (req: Request, res: Response) => {
  res.json({ message: 'Signed in as admin', userId: req.user!.id });
});

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------

/** Every list endpoint below defaults to 20/page, capped at 50. */
function parsePagination(page?: number, limit?: number): { page: number; limit: number } {
  const resolvedPage = page && page > 0 ? page : 1;
  const resolvedLimit = Math.min(limit && limit > 0 ? limit : 20, 50);
  return { page: resolvedPage, limit: resolvedLimit };
}

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
});

/**
 * Every state-mutating handler in this file writes one of these in the same
 * transaction as its main write — see the Phase 5 spec's convention list.
 * `admin_audit_logs` has had zero writers before this file; this is the one
 * place that changes.
 */
async function logAdminAction(
  adminId: string,
  action: string,
  target: string | null,
  t: Transaction,
): Promise<void> {
  await AdminAuditLog.create({ adminId, action, target }, { transaction: t });
}

// =======================================================================
// Candidates
// =======================================================================

const listCandidatesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['draft', 'submitted', 'under_review', 'approved', 'rejected', 'needs_info']).optional(),
  category: z.enum(['fresher', 'experienced', 'executive']).optional(),
  q: z.string().trim().min(1).optional(),
});

function buildCandidateListWhere(filters: { status?: CandidateStatus; category?: string }) {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.category) where.category = filters.category;
  return where;
}

function buildCandidateUserInclude(q: string | undefined) {
  return {
    model: User,
    as: 'user',
    ...(q
      ? {
          where: {
            [Op.or]: [{ email: { [Op.iLike]: `%${q}%` } }, { fullName: { [Op.iLike]: `%${q}%` } }],
          },
          required: true,
        }
      : {}),
  };
}

export const listCandidates = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const query = listCandidatesQuerySchema.parse(req.query);
  const { page, limit } = parsePagination(query.page, query.limit);

  const result = await runInRequestContext(authUser, async (t) => {
    const where = buildCandidateListWhere(query);
    const include = [buildCandidateUserInclude(query.q)];

    const profiles = await CandidateProfile.findAll({
      where,
      include,
      order: [['updatedAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      transaction: t,
    });
    const totalCount = await CandidateProfile.count({ where, include, transaction: t });

    const results = profiles.map((profile) => {
      const plain = profile.get({ plain: true }) as CandidateProfileAttributes & {
        user: UserAttributes | null;
      };
      return {
        id: plain.userId,
        profileId: plain.id,
        email: plain.user?.email ?? null,
        fullName: plain.user?.fullName ?? null,
        category: plain.category,
        status: plain.status,
        assignedVerifierId: plain.assignedVerifierId,
        createdAt: plain.createdAt,
        updatedAt: plain.updatedAt,
      };
    });

    return { results, page, limit, totalCount };
  });

  res.json(result);
});

export const getCandidateDetail = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  const result = await runInRequestContext(authUser, async (t) => {
    const user = await User.findByPk(id, { transaction: t });
    if (!user || user.role !== 'candidate') {
      throw ApiError.notFound('Candidate not found');
    }

    const profile = await CandidateProfile.findOne({
      where: { userId: id },
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

    const badges = await CandidatePlatformBadge.findAll({
      where: { candidateId: id },
      order: [['createdAt', 'DESC']],
      transaction: t,
    });
    const achievements = await CandidateAchievement.findAll({
      where: { candidateId: id },
      order: [['createdAt', 'DESC']],
      transaction: t,
    });
    const verificationLogs = await VerificationLog.findAll({
      where: { targetType: 'candidate_profile', targetId: profile.id },
      order: [['createdAt', 'DESC']],
      limit: 20,
      transaction: t,
    });
    const fieldChecks = await ProfileFieldCheck.findAll({
      where: { profileId: profile.id },
      order: [['createdAt', 'DESC']],
      limit: 50,
      transaction: t,
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      accountStatus: user.accountStatus,
      statusReason: user.statusReason,
      profile,
      badges,
      achievements,
      verificationLogs,
      fieldChecks,
    };
  });

  res.json(result);
});

const updateCandidateSchema = z.object({
  category: z.enum(['fresher', 'experienced', 'executive']).optional(),
  status: z.enum(['draft', 'submitted', 'under_review', 'approved', 'rejected', 'needs_info']).optional(),
  assignedVerifierId: z.string().uuid().nullable().optional(),
});

// Only these candidate_profiles.status values have a matching
// VerificationLog.decision — draft/submitted/under_review are pre-review
// states an admin override can still move a profile through, but they don't
// correspond to a reviewer "decision" worth logging.
const STATUS_TO_DECISION: Partial<Record<CandidateStatus, VerificationDecision>> = {
  approved: 'approved',
  rejected: 'rejected',
  needs_info: 'needs_info',
};

export const updateCandidate = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = updateCandidateSchema.parse(req.body);

  const result = await runInRequestContext(authUser, async (t) => {
    const profile = await CandidateProfile.findOne({ where: { userId: id }, transaction: t });
    if (!profile) {
      throw ApiError.notFound('Candidate profile not found');
    }

    if (body.assignedVerifierId !== undefined) {
      if (body.assignedVerifierId) {
        const verifier = await User.findByPk(body.assignedVerifierId, { transaction: t });
        if (!verifier || verifier.role !== 'verifier') {
          throw ApiError.badRequest('assignedVerifierId must reference a verifier account');
        }
      }
      profile.assignedVerifierId = body.assignedVerifierId;
    }

    if (body.category !== undefined) {
      profile.category = body.category;
    }

    if (body.status !== undefined) {
      profile.status = body.status;
    }

    await profile.save({ transaction: t });

    if (body.status !== undefined) {
      const decision = STATUS_TO_DECISION[body.status];
      if (decision) {
        await VerificationLog.create(
          {
            targetType: 'candidate_profile',
            targetId: profile.id,
            reviewerId: authUser.id,
            decision,
            notes: 'Admin override',
          },
          { transaction: t },
        );
      }
    }

    await logAdminAction(authUser.id, 'candidate_status_override', `candidate:${id}`, t);

    return profile;
  });

  res.json(result);
});

const updateCandidateBadgeSchema = z.object({
  verificationStatus: z.enum(['pending', 'verified', 'rejected']),
  rejectionReason: z.string().optional(),
});

export const updateCandidateBadge = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id, badgeId } = req.params;
  const body = updateCandidateBadgeSchema.parse(req.body);

  const result = await runInRequestContext(authUser, async (t) => {
    const badge = await CandidatePlatformBadge.findOne({
      where: { id: badgeId, candidateId: id },
      transaction: t,
    });
    if (!badge) {
      throw ApiError.notFound('Platform badge not found for this candidate');
    }

    badge.verificationStatus = body.verificationStatus;
    badge.rejectionReason = body.verificationStatus === 'rejected' ? body.rejectionReason ?? null : null;
    await badge.save({ transaction: t });

    // Badge verificationStatus ('pending'|'verified'|'rejected') differs from
    // the VerificationLog decision enum ('verified'|'incorrect') — same
    // mapping verifierController.decideBadge already uses. 'pending' has no
    // decision equivalent (an admin resetting a badge back to pending isn't
    // itself a reviewer decision worth logging).
    const decision: VerificationDecision | null =
      body.verificationStatus === 'rejected' ? 'incorrect' : body.verificationStatus === 'verified' ? 'verified' : null;
    if (decision) {
      await VerificationLog.create(
        {
          targetType: 'platform_badge',
          targetId: badge.id,
          reviewerId: authUser.id,
          decision,
          notes: body.rejectionReason ?? 'Admin override',
        },
        { transaction: t },
      );
    }

    await logAdminAction(authUser.id, 'candidate_badge_override', `platform_badge:${badgeId}`, t);

    return badge;
  });

  res.json(result);
});

const exportCandidatesQuerySchema = listCandidatesQuerySchema.pick({ status: true, category: true, q: true });

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const exportCandidates = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const query = exportCandidatesQuerySchema.parse(req.query);

  const rows = await runInRequestContext(authUser, async (t) => {
    const where = buildCandidateListWhere(query);
    const include = [buildCandidateUserInclude(query.q)];

    const profiles = await CandidateProfile.findAll({
      where,
      include,
      order: [['createdAt', 'DESC']],
      transaction: t,
    });

    return profiles.map(
      (profile) =>
        profile.get({ plain: true }) as CandidateProfileAttributes & { user: UserAttributes | null },
    );
  });

  const header = 'id,email,fullName,category,status,createdAt';
  const lines = rows.map((row) =>
    [
      row.userId,
      row.user?.email ?? '',
      row.user?.fullName ?? '',
      row.category ?? '',
      row.status,
      row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    ]
      .map(csvEscape)
      .join(','),
  );
  const csv = [header, ...lines].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="candidates.csv"');
  res.send(csv);
});

// =======================================================================
// Users (generic account moderation — candidate/company/verifier all live
// in `users`, so suspend/ban/reactivate/delete/impersonate are role-agnostic)
// =======================================================================

const statusChangeSchema = z.object({
  reason: z.string().trim().min(1),
});

export const suspendUser = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const { reason } = statusChangeSchema.parse(req.body);

  await runInRequestContext(authUser, async (t) => {
    const user = await User.findByPk(id, { transaction: t });
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    user.accountStatus = 'suspended';
    user.statusReason = reason;
    user.statusChangedAt = new Date();
    user.statusChangedBy = authUser.id;
    // Bumping this invalidates every outstanding refresh token for the user
    // on its next use — see authController.refresh.
    user.tokenVersion += 1;
    await user.save({ transaction: t });

    await logAdminAction(authUser.id, 'user_suspend', `user:${id}`, t);
  });

  res.status(204).send();
});

export const banUser = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const { reason } = statusChangeSchema.parse(req.body);

  await runInRequestContext(authUser, async (t) => {
    const user = await User.findByPk(id, { transaction: t });
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    user.accountStatus = 'banned';
    user.statusReason = reason;
    user.statusChangedAt = new Date();
    user.statusChangedBy = authUser.id;
    user.tokenVersion += 1;
    await user.save({ transaction: t });

    await logAdminAction(authUser.id, 'user_ban', `user:${id}`, t);
  });

  res.status(204).send();
});

export const reactivateUser = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const user = await User.findByPk(id, { transaction: t });
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    user.accountStatus = 'active';
    user.statusReason = null;
    user.statusChangedAt = new Date();
    user.statusChangedBy = authUser.id;
    // No tokenVersion bump — reactivation doesn't need to force a logout.
    await user.save({ transaction: t });

    await logAdminAction(authUser.id, 'user_reactivate', `user:${id}`, t);
  });

  res.status(204).send();
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  if (authUser.id === id) {
    throw ApiError.forbidden('You cannot delete your own account');
  }

  await runInRequestContext(authUser, async (t) => {
    const user = await User.findByPk(id, { transaction: t });
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (user.role === 'admin') {
      const adminCount = await User.count({ where: { role: 'admin' }, transaction: t });
      if (adminCount <= 1) {
        throw ApiError.conflict('Cannot delete the last remaining admin account');
      }
    }

    // Written before the delete, per spec — the row (and its id) won't exist
    // to reference afterward.
    await logAdminAction(authUser.id, 'user_delete', `user:${id}`, t);

    await user.destroy({ transaction: t });
  });

  res.status(204).send();
});

export const impersonateUser = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  const accessToken = await runInRequestContext(authUser, async (t) => {
    const user = await User.findByPk(id, { transaction: t });
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    await logAdminAction(authUser.id, 'user_impersonate', `user:${id}`, t);

    // Short-lived, access-token only — no refresh cookie is set, so this
    // never creates a persistent session for the admin to leave lying
    // around as the impersonated user.
    return signAccessToken({ sub: user.id, role: user.role, tokenVersion: user.tokenVersion }, '5m');
  });

  res.json({ accessToken });
});

// =======================================================================
// Companies
// =======================================================================

const listCompaniesQuerySchema = paginationQuerySchema.extend({
  verified: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  planId: z.string().uuid().optional(),
});

export const listCompanies = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const query = listCompaniesQuerySchema.parse(req.query);
  const { page, limit } = parsePagination(query.page, query.limit);

  const result = await runInRequestContext(authUser, async (t) => {
    const where: Record<string, unknown> = {};
    if (query.verified !== undefined) where.verified = query.verified;
    if (query.planId) where.planId = query.planId;

    const profiles = await CompanyProfile.findAll({
      where,
      include: [{ model: User, as: 'user' }, { model: PlanMaster, as: 'plan' }],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      transaction: t,
    });
    const totalCount = await CompanyProfile.count({ where, transaction: t });

    const results = profiles.map((profile) => {
      const plain = profile.get({ plain: true }) as CompanyProfileAttributes & {
        user: UserAttributes | null;
        plan: PlanMasterAttributes | null;
      };
      return {
        id: plain.userId,
        profileId: plain.id,
        email: plain.user?.email ?? null,
        companyName: plain.companyName,
        verified: plain.verified,
        plan: plain.plan ? { id: plain.plan.id, name: plain.plan.name } : null,
        remainingUnlocks: plain.remainingUnlocks,
        createdAt: plain.createdAt,
      };
    });

    return { results, page, limit, totalCount };
  });

  res.json(result);
});

export const getCompanyDetail = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  const result = await runInRequestContext(authUser, async (t) => {
    const user = await User.findByPk(id, { transaction: t });
    if (!user || user.role !== 'company') {
      throw ApiError.notFound('Company not found');
    }

    const profile = await CompanyProfile.findOne({
      where: { userId: id },
      include: [{ model: PlanMaster, as: 'plan' }],
      transaction: t,
    });
    if (!profile) {
      throw ApiError.notFound('Company profile not found');
    }

    const unlocks = await Unlock.findAll({
      where: { companyId: id },
      order: [['unlockedAt', 'DESC']],
      transaction: t,
    });
    const blocks = await CompanyBlock.findAll({
      where: { companyId: id },
      order: [['createdAt', 'DESC']],
      transaction: t,
    });
    const messageCount = await Message.count({ where: { companyId: id }, transaction: t });

    return {
      id: user.id,
      email: user.email,
      accountStatus: user.accountStatus,
      statusReason: user.statusReason,
      profile,
      unlocks,
      blocks,
      messageCount,
    };
  });

  res.json(result);
});

const updateCompanySchema = z.object({
  verified: z.boolean().optional(),
  planId: z.string().uuid().nullable().optional(),
});

export const updateCompany = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = updateCompanySchema.parse(req.body);

  const result = await runInRequestContext(authUser, async (t) => {
    const profile = await CompanyProfile.findOne({ where: { userId: id }, transaction: t });
    if (!profile) {
      throw ApiError.notFound('Company profile not found');
    }

    if (body.planId !== undefined) {
      if (body.planId) {
        const plan = await PlanMaster.findByPk(body.planId, { transaction: t });
        if (!plan) {
          throw ApiError.badRequest('planId must reference a valid plan');
        }
      }
      profile.planId = body.planId;
    }
    if (body.verified !== undefined) {
      profile.verified = body.verified;
    }
    await profile.save({ transaction: t });

    await logAdminAction(authUser.id, 'company_verify', `company:${id}`, t);

    return profile;
  });

  res.json(result);
});

const grantUnlocksSchema = z.object({
  amount: z.number().int().positive(),
  note: z.string().optional(),
});

export const grantUnlocks = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = grantUnlocksSchema.parse(req.body);

  const result = await runInRequestContext(authUser, async (t) => {
    const profile = await CompanyProfile.findOne({ where: { userId: id }, transaction: t });
    if (!profile) {
      throw ApiError.notFound('Company profile not found');
    }

    profile.remainingUnlocks += body.amount;
    await profile.save({ transaction: t });

    await logAdminAction(
      authUser.id,
      'company_grant_unlocks',
      `company:${id} amount=${body.amount}${body.note ? ` note="${body.note}"` : ''}`,
      t,
    );

    return profile;
  });

  res.json(result);
});

// =======================================================================
// Verifiers
// =======================================================================

export const listVerifiers = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const result = await runInRequestContext(authUser, async (t) => {
    const verifiers = await User.findAll({
      where: { role: 'verifier' },
      order: [['fullName', 'ASC']],
      transaction: t,
    });

    const rows = [];
    for (const verifier of verifiers) {
      // Sequential — shares transaction `t` (same discipline as
      // verifierController.getAnalytics / buildVerifierAccount: small
      // working set, averaged in JS rather than a raw cross-table SQL
      // aggregate).
      const logs = await VerificationLog.findAll({
        where: { reviewerId: verifier.id, targetType: 'candidate_profile' },
        transaction: t,
      });

      const diffsHours: number[] = [];
      for (const log of logs) {
        const profile = await CandidateProfile.findByPk(log.targetId, { transaction: t });
        if (profile?.submittedAt) {
          diffsHours.push((log.createdAt.getTime() - profile.submittedAt.getTime()) / (1000 * 60 * 60));
        }
      }
      const avgTurnaroundHours =
        diffsHours.length > 0 ? diffsHours.reduce((a, b) => a + b, 0) / diffsHours.length : null;

      rows.push({
        id: verifier.id,
        username: verifier.username,
        fullName: verifier.fullName,
        email: verifier.email,
        accountStatus: verifier.accountStatus,
        decisionCount: logs.length,
        avgTurnaroundHours,
      });
    }

    return rows;
  });

  res.json(result);
});

const createVerifierSchema = z.object({
  username: z.string().trim().min(3),
  fullName: z.string().trim().min(1),
  password: z.string().min(8),
});

export const createVerifier = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = createVerifierSchema.parse(req.body);
  const passwordHash = await hashPassword(body.password);

  let user: User;
  try {
    user = await runInRequestContext(authUser, async (t) => {
      // users.email is NOT NULL + unique and validated as an email by the
      // model — verifiers log in by username, but still need a synthetic
      // address on the reserved-for-documentation .local suffix. Same
      // pattern as seeders/20240105000001-seed-verifier-account.js.
      const created = await User.create(
        {
          role: 'verifier',
          email: `${body.username}@hirepool.local`,
          username: body.username,
          passwordHash,
          fullName: body.fullName,
        },
        { transaction: t },
      );

      await logAdminAction(authUser.id, 'verifier_create', `user:${created.id}`, t);

      return created;
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      throw ApiError.conflict('A user with this username already exists');
    }
    throw err;
  }

  res.status(201).json({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
  });
});

// =======================================================================
// Verifier invites (email whitelist) — the self-signup alternative to
// createVerifier above. An admin whitelists an email instead of choosing a
// password on the verifier's behalf; the invited person signs up themselves
// through POST /auth/signup with role:'verifier' (see authController.ts,
// which enforces the whitelist check).
// =======================================================================

const listVerifierInvitesSchema = paginationQuerySchema.extend({
  status: z.enum(['pending', 'consumed']).optional(),
});

export const listVerifierInvites = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const query = listVerifierInvitesSchema.parse(req.query);
  const { page, limit } = parsePagination(query.page, query.limit);

  const result = await runInRequestContext(authUser, async (t) => {
    const where: Record<string, unknown> = {};
    if (query.status === 'pending') where.consumedAt = null;
    if (query.status === 'consumed') where.consumedAt = { [Op.ne]: null };

    const invites = await VerifierInvite.findAll({
      where,
      include: [
        { model: User, as: 'inviter' },
        { model: User, as: 'consumedByUser' },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      transaction: t,
    });
    const totalCount = await VerifierInvite.count({ where, transaction: t });

    return {
      results: invites.map((invite) => {
        const plain = invite.get({ plain: true }) as VerifierInviteAttributes & {
          inviter: UserAttributes | null;
          consumedByUser: UserAttributes | null;
        };
        return {
          id: plain.id,
          email: plain.email,
          invitedByEmail: plain.inviter?.email ?? null,
          createdAt: plain.createdAt,
          consumedAt: plain.consumedAt,
          consumedByUserFullName: plain.consumedByUser?.fullName ?? plain.consumedByUser?.email ?? null,
        };
      }),
      page,
      limit,
      totalCount,
    };
  });

  res.json(result);
});

const createVerifierInviteSchema = z.object({
  email: z.string().trim().email(),
});

export const createVerifierInvite = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { email } = createVerifierInviteSchema.parse(req.body);
  const normalizedEmail = email.toLowerCase();

  let invite: VerifierInvite;
  try {
    invite = await runInRequestContext(authUser, async (t) => {
      const created = await VerifierInvite.create(
        { email: normalizedEmail, invitedBy: authUser.id },
        { transaction: t },
      );
      await logAdminAction(authUser.id, 'verifier_invite_create', `verifier_invite:${created.id}`, t);
      return created;
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      throw ApiError.conflict('This email has already been invited (or already used its invite)');
    }
    throw err;
  }

  res.status(201).json({ id: invite.id, email: invite.email, createdAt: invite.createdAt });
});

export const deleteVerifierInvite = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const existing = await VerifierInvite.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Invite not found');
    if (existing.consumedAt) {
      throw ApiError.conflict('This invite has already been used and can no longer be revoked');
    }
    await logAdminAction(authUser.id, 'verifier_invite_revoke', `verifier_invite:${id}`, t);
    await existing.destroy({ transaction: t });
  });

  res.status(204).send();
});

// =======================================================================
// Company requests
// =======================================================================

const listCompanyRequestsSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

export const listCompanyRequests = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { status } = listCompanyRequestsSchema.parse(req.query);

  const rows = await runInRequestContext(authUser, (t) =>
    CompanyRequest.findAll({
      where: status ? { status } : undefined,
      order: [['createdAt', 'DESC']],
      transaction: t,
    }),
  );

  res.json(rows);
});

const approveCompanyRequestSchema = z.object({
  isMnc: z.boolean().optional(),
  isFaangMaang: z.boolean().optional(),
});

export const approveCompanyRequest = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = approveCompanyRequestSchema.parse(req.body);

  const result = await runInRequestContext(authUser, async (t) => {
    const request = await CompanyRequest.findByPk(id, { transaction: t });
    if (!request) {
      throw ApiError.notFound('Company request not found');
    }
    if (request.status !== 'pending') {
      throw ApiError.conflict('This request has already been reviewed');
    }

    const company = await CompanyMaster.create(
      {
        companyName: request.companyName,
        isMnc: body.isMnc ?? false,
        isFaangMaang: body.isFaangMaang ?? false,
      },
      { transaction: t },
    );

    request.status = 'approved';
    request.reviewedBy = authUser.id;
    request.reviewedAt = new Date();
    await request.save({ transaction: t });

    await logAdminAction(authUser.id, 'company_request_approve', `company_request:${id}`, t);

    return { request, company };
  });

  res.json(result);
});

const rejectCompanyRequestSchema = z.object({
  reason: z.string().trim().min(1),
});

export const rejectCompanyRequest = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const { reason } = rejectCompanyRequestSchema.parse(req.body);

  const result = await runInRequestContext(authUser, async (t) => {
    const request = await CompanyRequest.findByPk(id, { transaction: t });
    if (!request) {
      throw ApiError.notFound('Company request not found');
    }
    if (request.status !== 'pending') {
      throw ApiError.conflict('This request has already been reviewed');
    }

    request.status = 'rejected';
    request.rejectionReason = reason;
    request.reviewedBy = authUser.id;
    request.reviewedAt = new Date();
    await request.save({ transaction: t });

    await logAdminAction(authUser.id, 'company_request_reject', `company_request:${id}`, t);

    return request;
  });

  res.json(result);
});

// =======================================================================
// Master data CRUD (list/read already public via masterController — this is
// just the admin-only write side)
// =======================================================================

// ----- roles_master -----

const roleMasterSchema = z.object({ roleName: z.string().trim().min(1) });

export const createRoleMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = roleMasterSchema.parse(req.body);

  const role = await runInRequestContext(authUser, async (t) => {
    const created = await RoleMaster.create(body, { transaction: t });
    await logAdminAction(authUser.id, 'master_role_create', `role:${created.id}`, t);
    return created;
  });

  res.status(201).json(role);
});

export const updateRoleMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = roleMasterSchema.partial().parse(req.body);

  const role = await runInRequestContext(authUser, async (t) => {
    const existing = await RoleMaster.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Role not found');
    if (body.roleName !== undefined) existing.roleName = body.roleName;
    await existing.save({ transaction: t });
    await logAdminAction(authUser.id, 'master_role_update', `role:${id}`, t);
    return existing;
  });

  res.json(role);
});

export const deleteRoleMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const existing = await RoleMaster.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Role not found');
    await logAdminAction(authUser.id, 'master_role_delete', `role:${id}`, t);
    await existing.destroy({ transaction: t });
  });

  res.status(204).send();
});

// ----- platform_badges_master -----

const platformBadgeMasterSchema = z.object({
  platformName: z.string().trim().min(1),
  badgeName: z.string().trim().min(1),
  sortOrder: z.number().int().optional(),
});

export const createPlatformBadgeMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = platformBadgeMasterSchema.parse(req.body);

  const badge = await runInRequestContext(authUser, async (t) => {
    const created = await PlatformBadgeMaster.create(body, { transaction: t });
    await logAdminAction(authUser.id, 'master_platform_badge_create', `platform_badge_master:${created.id}`, t);
    return created;
  });

  res.status(201).json(badge);
});

export const updatePlatformBadgeMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = platformBadgeMasterSchema.partial().parse(req.body);

  const badge = await runInRequestContext(authUser, async (t) => {
    const existing = await PlatformBadgeMaster.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Platform badge not found');
    if (body.platformName !== undefined) existing.platformName = body.platformName;
    if (body.badgeName !== undefined) existing.badgeName = body.badgeName;
    if (body.sortOrder !== undefined) existing.sortOrder = body.sortOrder;
    await existing.save({ transaction: t });
    await logAdminAction(authUser.id, 'master_platform_badge_update', `platform_badge_master:${id}`, t);
    return existing;
  });

  res.json(badge);
});

export const deletePlatformBadgeMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const existing = await PlatformBadgeMaster.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Platform badge not found');
    await logAdminAction(authUser.id, 'master_platform_badge_delete', `platform_badge_master:${id}`, t);
    await existing.destroy({ transaction: t });
  });

  res.status(204).send();
});

// ----- companies_master -----

const companyMasterSchema = z.object({
  companyName: z.string().trim().min(1),
  isMnc: z.boolean().optional(),
  isFaangMaang: z.boolean().optional(),
});

export const createCompanyMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = companyMasterSchema.parse(req.body);

  const company = await runInRequestContext(authUser, async (t) => {
    const created = await CompanyMaster.create(body, { transaction: t });
    await logAdminAction(authUser.id, 'master_company_create', `company_master:${created.id}`, t);
    return created;
  });

  res.status(201).json(company);
});

export const updateCompanyMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = companyMasterSchema.partial().parse(req.body);

  const company = await runInRequestContext(authUser, async (t) => {
    const existing = await CompanyMaster.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Company not found');
    if (body.companyName !== undefined) existing.companyName = body.companyName;
    if (body.isMnc !== undefined) existing.isMnc = body.isMnc;
    if (body.isFaangMaang !== undefined) existing.isFaangMaang = body.isFaangMaang;
    await existing.save({ transaction: t });
    await logAdminAction(authUser.id, 'master_company_update', `company_master:${id}`, t);
    return existing;
  });

  res.json(company);
});

export const deleteCompanyMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const existing = await CompanyMaster.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Company not found');
    await logAdminAction(authUser.id, 'master_company_delete', `company_master:${id}`, t);
    await existing.destroy({ transaction: t });
  });

  res.status(204).send();
});

const mergeCompanyMasterSchema = z.object({
  mergeIntoId: z.string().uuid(),
});

export const mergeCompanyMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const { mergeIntoId } = mergeCompanyMasterSchema.parse(req.body);

  if (id === mergeIntoId) {
    throw ApiError.badRequest('mergeIntoId must be different from the company being merged');
  }

  await runInRequestContext(authUser, async (t) => {
    const source = await CompanyMaster.findByPk(id, { transaction: t });
    const target = await CompanyMaster.findByPk(mergeIntoId, { transaction: t });
    if (!source || !target) {
      throw ApiError.notFound('Company not found');
    }

    // The only FK anywhere in the schema pointing at companies_master.id is
    // candidate_profiles.current_company_id (confirmed by grepping every
    // CompanyMaster/currentCompanyId/companies_master reference in src/) —
    // reassign it before dropping the old row.
    await CandidateProfile.update(
      { currentCompanyId: mergeIntoId },
      { where: { currentCompanyId: id }, transaction: t },
    );

    await logAdminAction(authUser.id, 'master_company_merge', `company_master:${id}->${mergeIntoId}`, t);

    await source.destroy({ transaction: t });
  });

  res.status(204).send();
});

// ----- skills_master -----

const skillMasterSchema = z.object({ skillName: z.string().trim().min(1) });

export const createSkillMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = skillMasterSchema.parse(req.body);

  const skill = await runInRequestContext(authUser, async (t) => {
    const created = await SkillMaster.create(body, { transaction: t });
    await logAdminAction(authUser.id, 'master_skill_create', `skill_master:${created.id}`, t);
    return created;
  });

  res.status(201).json(skill);
});

export const updateSkillMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = skillMasterSchema.partial().parse(req.body);

  const skill = await runInRequestContext(authUser, async (t) => {
    const existing = await SkillMaster.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Skill not found');
    if (body.skillName !== undefined) existing.skillName = body.skillName;
    await existing.save({ transaction: t });
    await logAdminAction(authUser.id, 'master_skill_update', `skill_master:${id}`, t);
    return existing;
  });

  res.json(skill);
});

export const deleteSkillMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const existing = await SkillMaster.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Skill not found');
    await logAdminAction(authUser.id, 'master_skill_delete', `skill_master:${id}`, t);
    await existing.destroy({ transaction: t });
  });

  res.status(204).send();
});

// ----- domains_master -----

const domainMasterSchema = z.object({ domainName: z.string().trim().min(1) });

export const createDomainMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = domainMasterSchema.parse(req.body);

  const domain = await runInRequestContext(authUser, async (t) => {
    const created = await DomainMaster.create(body, { transaction: t });
    await logAdminAction(authUser.id, 'master_domain_create', `domain_master:${created.id}`, t);
    return created;
  });

  res.status(201).json(domain);
});

export const updateDomainMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = domainMasterSchema.partial().parse(req.body);

  const domain = await runInRequestContext(authUser, async (t) => {
    const existing = await DomainMaster.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Domain not found');
    if (body.domainName !== undefined) existing.domainName = body.domainName;
    await existing.save({ transaction: t });
    await logAdminAction(authUser.id, 'master_domain_update', `domain_master:${id}`, t);
    return existing;
  });

  res.json(domain);
});

export const deleteDomainMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const existing = await DomainMaster.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Domain not found');
    await logAdminAction(authUser.id, 'master_domain_delete', `domain_master:${id}`, t);
    await existing.destroy({ transaction: t });
  });

  res.status(204).send();
});

// ----- rejection_reasons_master -----

const rejectionReasonMasterSchema = z.object({
  scope: z.enum(['profile', 'item']),
  reasonText: z.string().trim().min(1),
});

export const createRejectionReasonMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = rejectionReasonMasterSchema.parse(req.body);

  const reason = await runInRequestContext(authUser, async (t) => {
    const created = await RejectionReasonMaster.create(body, { transaction: t });
    await logAdminAction(authUser.id, 'master_rejection_reason_create', `rejection_reason_master:${created.id}`, t);
    return created;
  });

  res.status(201).json(reason);
});

export const updateRejectionReasonMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = rejectionReasonMasterSchema.partial().parse(req.body);

  const reason = await runInRequestContext(authUser, async (t) => {
    const existing = await RejectionReasonMaster.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Rejection reason not found');
    if (body.scope !== undefined) existing.scope = body.scope;
    if (body.reasonText !== undefined) existing.reasonText = body.reasonText;
    await existing.save({ transaction: t });
    await logAdminAction(authUser.id, 'master_rejection_reason_update', `rejection_reason_master:${id}`, t);
    return existing;
  });

  res.json(reason);
});

export const deleteRejectionReasonMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const existing = await RejectionReasonMaster.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Rejection reason not found');
    await logAdminAction(authUser.id, 'master_rejection_reason_delete', `rejection_reason_master:${id}`, t);
    await existing.destroy({ transaction: t });
  });

  res.status(204).send();
});

// ----- plans_master -----

const planMasterSchema = z.object({
  name: z.string().trim().min(1),
  monthlyUnlocks: z.number().int().min(0),
  monthlyMessageCap: z.number().int().min(0).nullable().optional(),
  price: z.number().min(0),
  isActive: z.boolean().optional(),
});

export const listPlanMasters = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const plans = await runInRequestContext(authUser, (t) =>
    PlanMaster.findAll({ order: [['price', 'ASC']], transaction: t }),
  );
  res.json(plans);
});

export const createPlanMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = planMasterSchema.parse(req.body);

  const plan = await runInRequestContext(authUser, async (t) => {
    const created = await PlanMaster.create(body, { transaction: t });
    await logAdminAction(authUser.id, 'master_plan_create', `plan_master:${created.id}`, t);
    return created;
  });

  res.status(201).json(plan);
});

export const updatePlanMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = planMasterSchema.partial().parse(req.body);

  const plan = await runInRequestContext(authUser, async (t) => {
    const existing = await PlanMaster.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Plan not found');
    if (body.name !== undefined) existing.name = body.name;
    if (body.monthlyUnlocks !== undefined) existing.monthlyUnlocks = body.monthlyUnlocks;
    if (body.monthlyMessageCap !== undefined) existing.monthlyMessageCap = body.monthlyMessageCap;
    if (body.price !== undefined) existing.price = body.price;
    if (body.isActive !== undefined) existing.isActive = body.isActive;
    await existing.save({ transaction: t });
    await logAdminAction(authUser.id, 'master_plan_update', `plan_master:${id}`, t);
    return existing;
  });

  res.json(plan);
});

export const deletePlanMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const existing = await PlanMaster.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Plan not found');
    await logAdminAction(authUser.id, 'master_plan_delete', `plan_master:${id}`, t);
    await existing.destroy({ transaction: t });
  });

  res.status(204).send();
});

// ----- relevancy_package_price_bands (AI Relevancy Packages, Feature 1) -----

const relevancyPriceBandBaseSchema = z.object({
  label: z.string().trim().min(1),
  minCandidates: z.number().int().min(1),
  maxCandidates: z.number().int().min(1).nullable(),
  price: z.number().min(0).nullable(),
  isContactSales: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const relevancyPriceBandSchema = relevancyPriceBandBaseSchema.refine(
  (v) => v.isContactSales === true || v.price !== null,
  { message: 'price is required unless isContactSales is true', path: ['price'] },
);

export const createRelevancyPriceBand = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = relevancyPriceBandSchema.parse(req.body);

  const band = await runInRequestContext(authUser, async (t) => {
    const created = await RelevancyPackagePriceBand.create(body, { transaction: t });
    await logAdminAction(authUser.id, 'master_relevancy_price_band_create', `relevancy_price_band:${created.id}`, t);
    return created;
  });

  res.status(201).json(band);
});

export const updateRelevancyPriceBand = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = relevancyPriceBandBaseSchema.partial().parse(req.body);

  const band = await runInRequestContext(authUser, async (t) => {
    const existing = await RelevancyPackagePriceBand.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Price band not found');
    if (body.label !== undefined) existing.label = body.label;
    if (body.minCandidates !== undefined) existing.minCandidates = body.minCandidates;
    if (body.maxCandidates !== undefined) existing.maxCandidates = body.maxCandidates;
    if (body.price !== undefined) existing.price = body.price;
    if (body.isContactSales !== undefined) existing.isContactSales = body.isContactSales;
    if (body.sortOrder !== undefined) existing.sortOrder = body.sortOrder;
    existing.updatedAt = new Date();
    await existing.save({ transaction: t });
    await logAdminAction(authUser.id, 'master_relevancy_price_band_update', `relevancy_price_band:${id}`, t);
    return existing;
  });

  res.json(band);
});

export const deleteRelevancyPriceBand = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const existing = await RelevancyPackagePriceBand.findByPk(id, { transaction: t });
    if (!existing) throw ApiError.notFound('Price band not found');
    await logAdminAction(authUser.id, 'master_relevancy_price_band_delete', `relevancy_price_band:${id}`, t);
    await existing.destroy({ transaction: t });
  });

  res.status(204).send();
});

// ----- mcq_master (End-to-End ATS, Feature 2 Phase 8) — the public/admin-
// curated bank only (company_id stays null for everything created here;
// a company's own custom MCQs are managed via jobRoundController instead). -----

const mcqMasterSchema = z.object({
  conceptOrLanguage: z.string().trim().min(1),
  question: z.string().trim().min(1),
  options: z.array(z.string()).min(2),
  correctAnswer: z.number().int().min(0),
});

export const createMcqMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = mcqMasterSchema.parse(req.body);
  if (body.correctAnswer >= body.options.length) {
    throw ApiError.badRequest('correctAnswer must be a valid index into options');
  }

  const created = await runInRequestContext(authUser, async (t) => {
    const row = await McqMaster.create({ ...body, companyId: null, jobId: null }, { transaction: t });
    await logAdminAction(authUser.id, 'master_mcq_create', `mcq_master:${row.id}`, t);
    return row;
  });

  res.status(201).json(created);
});

export const updateMcqMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = mcqMasterSchema.partial().parse(req.body);

  const updated = await runInRequestContext(authUser, async (t) => {
    const existing = await McqMaster.findOne({ where: { id, companyId: null }, transaction: t });
    if (!existing) throw ApiError.notFound('MCQ not found in the public bank');
    if (body.conceptOrLanguage !== undefined) existing.conceptOrLanguage = body.conceptOrLanguage;
    if (body.question !== undefined) existing.question = body.question;
    if (body.options !== undefined) existing.options = body.options;
    if (body.correctAnswer !== undefined) existing.correctAnswer = body.correctAnswer;
    await existing.save({ transaction: t });
    await logAdminAction(authUser.id, 'master_mcq_update', `mcq_master:${id}`, t);
    return existing;
  });

  res.json(updated);
});

export const deleteMcqMaster = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const existing = await McqMaster.findOne({ where: { id, companyId: null }, transaction: t });
    if (!existing) throw ApiError.notFound('MCQ not found in the public bank');
    await logAdminAction(authUser.id, 'master_mcq_delete', `mcq_master:${id}`, t);
    await existing.destroy({ transaction: t });
  });

  res.status(204).send();
});

// =======================================================================
// Site settings
// =======================================================================

export const getSiteSettings = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const result = await runInRequestContext(authUser, async (t) => {
    const rows = await SiteSetting.findAll({ transaction: t });
    const out: Record<string, string | null> = {};
    for (const row of rows) out[row.key] = row.value;
    return out;
  });

  res.json(result);
});

const updateSiteSettingsSchema = z.record(z.string(), z.string());

export const updateSiteSettings = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = updateSiteSettingsSchema.parse(req.body);

  const result = await runInRequestContext(authUser, async (t) => {
    for (const [key, value] of Object.entries(body)) {
      // Sequential — shares transaction `t`.
      await SiteSetting.upsert(
        { key, value, updatedAt: new Date(), updatedBy: authUser.id },
        { transaction: t },
      );
    }

    await logAdminAction(authUser.id, 'site_settings_update', Object.keys(body).join(','), t);

    const rows = await SiteSetting.findAll({ transaction: t });
    const out: Record<string, string | null> = {};
    for (const row of rows) out[row.key] = row.value;
    return out;
  });

  res.json(result);
});

// =======================================================================
// Announcements
// =======================================================================

export const listAnnouncements = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const rows = await runInRequestContext(authUser, (t) =>
    Announcement.findAll({ order: [['createdAt', 'DESC']], transaction: t }),
  );

  res.json(rows);
});

const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
  audience: z.enum(['all', 'candidate', 'company', 'verifier']),
});

export const createAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = createAnnouncementSchema.parse(req.body);

  const announcement = await runInRequestContext(authUser, async (t) => {
    const created = await Announcement.create(
      { title: body.title, body: body.body, audience: body.audience, createdBy: authUser.id },
      { transaction: t },
    );

    const targetUsers = await User.findAll({
      where: body.audience === 'all' ? {} : { role: body.audience },
      attributes: ['id'],
      transaction: t,
    });

    if (targetUsers.length > 0) {
      await Notification.bulkCreate(
        targetUsers.map((u) => ({
          userId: u.id,
          type: 'admin_broadcast',
          message: `${body.title}: ${body.body}`,
          link: null,
        })),
        { transaction: t },
      );
    }

    await logAdminAction(authUser.id, 'announcement_create', `announcement:${created.id}`, t);

    return created;
  });

  res.status(201).json(announcement);
});

// =======================================================================
// Financial ledger (Phase 6)
// =======================================================================

const listPaymentsQuerySchema = paginationQuerySchema.extend({
  type: z.enum(['subscription', 'pay_per_unlock', 'boost']).optional(),
  status: z.enum(['created', 'paid', 'failed', 'refunded']).optional(),
});

/**
 * The "combined transaction ledger" the Phase 5 admin spec asked for —
 * unbuildable until now because no payments table existed. Every row here
 * is a real Razorpay-backed payment (see paymentController.razorpayWebhook),
 * across all three purchase types (subscription/pay_per_unlock/boost).
 */
export const listPayments = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const query = listPaymentsQuerySchema.parse(req.query);
  const { page, limit } = parsePagination(query.page, query.limit);

  const result = await runInRequestContext(authUser, async (t) => {
    const where: Record<string, unknown> = {};
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;

    const payments = await Payment.findAll({
      where,
      include: [{ model: User, as: 'payer' }],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      transaction: t,
    });
    const totalCount = await Payment.count({ where, transaction: t });

    return {
      results: payments.map((p) => {
        const plain = p.get({ plain: true }) as PaymentAttributes & {
          payer: UserAttributes | null;
        };
        return {
          id: plain.id,
          type: plain.type,
          status: plain.status,
          amount: Number(plain.amount),
          currency: plain.currency,
          payer: plain.payer
            ? { id: plain.payer.id, email: plain.payer.email, fullName: plain.payer.fullName, role: plain.payer.role }
            : null,
          razorpayOrderId: plain.razorpayOrderId,
          razorpayPaymentId: plain.razorpayPaymentId,
          createdAt: plain.createdAt,
          updatedAt: plain.updatedAt,
        };
      }),
      page,
      limit,
      totalCount,
    };
  });

  res.json(result);
});

// =======================================================================
// Analytics
// =======================================================================

const CANDIDATE_STATUSES: CandidateStatus[] = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'needs_info',
];

export const getAnalyticsOverview = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const result = await runInRequestContext(authUser, async (t) => {
    const candidateFunnel: Record<string, number> = {};
    for (const status of CANDIDATE_STATUSES) {
      candidateFunnel[status] = await CandidateProfile.count({ where: { status }, transaction: t });
    }

    const totalCompanies = await CompanyProfile.count({ transaction: t });
    const verifiedCompanies = await CompanyProfile.count({ where: { verified: true }, transaction: t });

    const plans = await PlanMaster.findAll({ transaction: t });
    const byPlan: { planId: string | null; planName: string; count: number }[] = [];
    for (const plan of plans) {
      const count = await CompanyProfile.count({ where: { planId: plan.id }, transaction: t });
      byPlan.push({ planId: plan.id, planName: plan.name, count });
    }
    const noPlanCount = await CompanyProfile.count({ where: { planId: null }, transaction: t });
    byPlan.push({ planId: null, planName: 'No plan', count: noPlanCount });

    const flaggedVerifications = await VerificationLog.count({
      where: { decision: 'flagged' },
      transaction: t,
    });

    const rejectionLogs = await VerificationLog.findAll({
      where: { targetType: 'candidate_profile', decision: 'rejected' },
      transaction: t,
    });
    const rejectionCountsByTarget = new Map<string, number>();
    for (const log of rejectionLogs) {
      rejectionCountsByTarget.set(log.targetId, (rejectionCountsByTarget.get(log.targetId) ?? 0) + 1);
    }
    const candidatesWithMultipleRejections = [...rejectionCountsByTarget.values()].filter(
      (count) => count > 1,
    ).length;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentUnlocks = await Unlock.findAll({
      where: { unlockedAt: { [Op.gte]: twentyFourHoursAgo } },
      transaction: t,
    });
    const unlockCountsByCompany = new Map<string, number>();
    for (const unlock of recentUnlocks) {
      unlockCountsByCompany.set(unlock.companyId, (unlockCountsByCompany.get(unlock.companyId) ?? 0) + 1);
    }
    const companiesWithHighUnlockVolume24h = [...unlockCountsByCompany.values()].filter(
      (count) => count > 10,
    ).length;

    const companyBlocksTotal = await CompanyBlock.count({ transaction: t });

    const paidPayments = await Payment.findAll({ where: { status: 'paid' }, transaction: t });
    const totalRevenue = paidPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const revenueByType: Record<string, number> = { subscription: 0, pay_per_unlock: 0, boost: 0 };
    for (const p of paidPayments) {
      revenueByType[p.type] = (revenueByType[p.type] ?? 0) + Number(p.amount);
    }
    const failedPaymentsCount = await Payment.count({ where: { status: 'failed' }, transaction: t });

    return {
      candidateFunnel,
      companyFunnel: { total: totalCompanies, verified: verifiedCompanies, byPlan },
      fraudSignals: {
        flaggedVerifications,
        candidatesWithMultipleRejections,
        companiesWithHighUnlockVolume24h,
        companyBlocksTotal,
      },
      // MRR/churn still aren't computable from this alone — that needs
      // subscription-period history, not just a running total — see the
      // Phase 6 summary's scope decisions. This is total lifetime revenue
      // and a type breakdown, both real, not placeholders.
      revenue: {
        totalPaid: totalRevenue,
        currency: 'INR',
        byType: revenueByType,
        paidCount: paidPayments.length,
        failedCount: failedPaymentsCount,
      },
    };
  });

  res.json(result);
});

// =======================================================================
// Security
// =======================================================================

const listAuditLogQuerySchema = paginationQuerySchema;

export const listAuditLog = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const query = listAuditLogQuerySchema.parse(req.query);
  const { page, limit } = parsePagination(query.page, query.limit);

  const result = await runInRequestContext(authUser, async (t) => {
    const logs = await AdminAuditLog.findAll({
      include: [{ model: User, as: 'admin' }],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      transaction: t,
    });
    const totalCount = await AdminAuditLog.count({ transaction: t });

    const results = logs.map((log) => {
      const plain = log.get({ plain: true }) as AdminAuditLogAttributes & { admin: UserAttributes | null };
      return {
        id: plain.id,
        adminId: plain.adminId,
        adminEmail: plain.admin?.email ?? null,
        adminFullName: plain.admin?.fullName ?? null,
        action: plain.action,
        target: plain.target,
        createdAt: plain.createdAt,
      };
    });

    return { results, page, limit, totalCount };
  });

  res.json(result);
});
