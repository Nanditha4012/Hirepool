import { Request, Response } from 'express';
import { Op, Transaction } from 'sequelize';
import { z } from 'zod';
import {
  User,
  CompanyProfile,
  PlanMaster,
  CandidateProfile,
  RoleMaster,
  DomainMaster,
  CompanyMaster,
  CandidateSecondaryRole,
  CandidateSkill,
  SkillMaster,
  CandidatePlatformBadge,
  CandidateAchievement,
  Unlock,
  Notification,
} from '../models';
import type { CompanyProfileAttributes, CompanySize } from '../models/CompanyProfile';
import type { PlanMasterAttributes } from '../models/PlanMaster';
import type {
  CandidateProfileAttributes,
  CandidateCategory,
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
import { buildWhatsappLink } from '../utils/contact';
import {
  loadCompanyVisibleEducation,
  type CompanyVisibleEducation,
} from '../utils/companyVisibleProfile';
import { sendEmail } from '../utils/email';
import { renewalReminderEmail } from '../utils/emailTemplates';

export const ping = asyncHandler(async (req: Request, res: Response) => {
  res.json({ message: 'Signed in as company', userId: req.user!.id });
});

// ---------------------------------------------------------------------
// Shared response shape for GET/PUT .../me/profile
// ---------------------------------------------------------------------

interface CompanyProfileResponse {
  id: string;
  userId: string;
  email: string;
  companyName: string;
  domain: string | null;
  verified: boolean;
  logoLink: string | null;
  website: string | null;
  industry: string | null;
  size: CompanySize | null;
  gstNumber: string | null;
  plan: { id: string; name: string; monthlyUnlocks: number; monthlyMessageCap: number | null } | null;
  remainingUnlocks: number;
  unlocksResetAt: Date | null;
  messagesSentThisPeriod: number;
  messagesPeriodResetAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

async function buildCompanyProfileResponse(
  userId: string,
  t: Transaction,
): Promise<CompanyProfileResponse> {
  const user = await User.findByPk(userId, { transaction: t });
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const profile = await CompanyProfile.findOne({
    where: { userId },
    include: [{ model: PlanMaster, as: 'plan' }],
    transaction: t,
  });

  if (!profile) {
    throw ApiError.notFound('Company profile not found');
  }

  const plain = profile.get({ plain: true }) as CompanyProfileAttributes & {
    plan: PlanMasterAttributes | null;
  };

  return {
    id: plain.id,
    userId: plain.userId,
    email: user.email,
    companyName: plain.companyName,
    domain: plain.domain,
    verified: plain.verified,
    logoLink: plain.logoLink,
    website: plain.website,
    industry: plain.industry,
    size: plain.size,
    gstNumber: plain.gstNumber,
    plan: plain.plan
      ? {
          id: plain.plan.id,
          name: plain.plan.name,
          monthlyUnlocks: plain.plan.monthlyUnlocks,
          monthlyMessageCap: plain.plan.monthlyMessageCap,
        }
      : null,
    remainingUnlocks: plain.remainingUnlocks,
    unlocksResetAt: plain.unlocksResetAt,
    messagesSentThisPeriod: plain.messagesSentThisPeriod,
    messagesPeriodResetAt: plain.messagesPeriodResetAt,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

// ---------------------------------------------------------------------
// Subscription renewal reminder (Phase 6)
//
// There's no cron/scheduled-job infrastructure in this codebase (no
// node-cron, no background worker) — building a real time-based reminder
// scheduler is out of scope for this phase. Instead, this is a
// "checked on read, not on a schedule" MVP substitute: every time a company
// loads its own dashboard (this GET), if unlocksResetAt is within the next
// few days, fire a renewal_reminder Notification as a side effect of the
// read — unless one was already sent recently, checked by looking for an
// existing renewal_reminder Notification for this user created within the
// dedup window below. This is a deliberate scope decision, not a bug: it
// means the reminder is only as timely as the company's next dashboard
// visit, not a guaranteed "N days before renewal" push.
// ---------------------------------------------------------------------

const RENEWAL_REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const RENEWAL_REMINDER_DEDUP_MS = 24 * 60 * 60 * 1000;

/**
 * Returns the number of days remaining (rounded up) if a reminder was
 * actually created this call, or null if no reminder was due/needed (no
 * reset date, outside the window, or one was already sent recently) — the
 * caller uses a non-null return to decide whether to also send the email,
 * so the email stays in lockstep with the in-app Notification's own dedup
 * logic instead of duplicating it.
 */
async function maybeSendRenewalReminder(
  userId: string,
  unlocksResetAt: Date | null,
  t: Transaction,
): Promise<number | null> {
  if (!unlocksResetAt) return null;

  const msUntilReset = unlocksResetAt.getTime() - Date.now();
  if (msUntilReset < 0 || msUntilReset > RENEWAL_REMINDER_WINDOW_MS) return null;

  const recentReminder = await Notification.findOne({
    where: {
      userId,
      type: 'renewal_reminder',
      createdAt: { [Op.gte]: new Date(Date.now() - RENEWAL_REMINDER_DEDUP_MS) },
    },
    transaction: t,
  });
  if (recentReminder) return null;

  await Notification.create(
    {
      userId,
      type: 'renewal_reminder',
      message: 'Your plan renews soon — your unlock and message quotas will reset shortly.',
      link: '/company/billing',
    },
    { transaction: t },
  );

  return Math.ceil(msUntilReset / (24 * 60 * 60 * 1000));
}

// ---------------------------------------------------------------------
// GET /me/profile
// ---------------------------------------------------------------------

export const getMyCompanyProfile = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const result = await runInRequestContext(authUser, async (t) => {
    const built = await buildCompanyProfileResponse(authUser.id, t);
    const daysRemaining = await maybeSendRenewalReminder(authUser.id, built.unlocksResetAt, t);
    return { built, daysRemaining };
  });

  // Sent after runInRequestContext resolves (this GET's transaction has
  // already committed the Notification row, if any) — a read endpoint's
  // response must never be delayed-to-failure by an outbound email, and
  // this keeps the email an unrelated side effect of the read rather than
  // part of its transactional work. daysRemaining is only non-null when
  // maybeSendRenewalReminder actually created a fresh reminder this call,
  // so the email can never fire more often than the in-app notification it
  // accompanies.
  if (result.daysRemaining !== null) {
    const { subject, html } = renewalReminderEmail(result.built.companyName, result.daysRemaining);
    await sendEmail({ to: result.built.email, subject, html });
  }

  res.json(result.built);
});

// ---------------------------------------------------------------------
// PUT /me/profile
// ---------------------------------------------------------------------

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+'] as const;

const upsertCompanyProfileSchema = z.object({
  // companyName is editable here too — the signup flow only ever seeded it
  // with the account's email as a placeholder (see createProfileForNewUser's
  // comment in authController.ts); this is the real place a company sets it.
  companyName: z.string().min(1).optional(),
  logoLink: z.string().optional(),
  website: z.string().optional(),
  industry: z.string().optional(),
  size: z.enum(COMPANY_SIZES).optional(),
  gstNumber: z.string().optional(),
});

const COMPANY_PROFILE_FIELD_KEYS = [
  'companyName',
  'logoLink',
  'website',
  'industry',
  'size',
  'gstNumber',
] as const;

export const upsertMyCompanyProfile = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = upsertCompanyProfileSchema.parse(req.body);

  const response = await runInRequestContext(authUser, async (t) => {
    const profile = await CompanyProfile.findOne({ where: { userId: authUser.id }, transaction: t });
    if (!profile) {
      throw ApiError.notFound('Company profile not found');
    }

    const updates: Partial<Record<(typeof COMPANY_PROFILE_FIELD_KEYS)[number], unknown>> = {};
    for (const key of COMPANY_PROFILE_FIELD_KEYS) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }
    if (Object.keys(updates).length > 0) {
      Object.assign(profile, updates);
      await profile.save({ transaction: t });
    }

    return buildCompanyProfileResponse(authUser.id, t);
  });

  res.json(response);
});

// ---------------------------------------------------------------------
// GET /search
// ---------------------------------------------------------------------

const NOTICE_PERIODS = ['immediate', '15_days', '30_days', '60_days', '90_plus_days'] as const;

// Express query params always arrive as strings (or string[]/ParsedQs for
// repeated/nested keys) — every field here is coerced/validated explicitly
// rather than relying on zod's type inference from req.query.
const booleanQueryParam = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

const nonNegativeIntQueryParam = z.coerce.number().int().min(0).optional();

const searchCandidatesQuerySchema = z.object({
  category: z.enum(['fresher', 'experienced', 'executive']).optional(),
  primaryRoleId: z.string().uuid().optional(),
  // Comma-separated list of skill ids. (Spec allows "comma-separated or
  // repeated" query params; only comma-separated is implemented here — see
  // the comment further down.)
  skillIds: z.string().optional(),
  domainId: z.string().uuid().optional(),
  experienceMin: nonNegativeIntQueryParam,
  experienceMax: nonNegativeIntQueryParam,
  location: z.string().optional(),
  noticePeriod: z.enum(NOTICE_PERIODS).optional(),
  platformName: z.string().optional(),
  badgeSelected: z.string().optional(),
  questionsSolvedMin: nonNegativeIntQueryParam,
  questionsSolvedMax: nonNegativeIntQueryParam,
  mncAlumni: booleanQueryParam,
  startupAlumni: booleanQueryParam,
  faangMaangAlumni: booleanQueryParam,
  hasResearch: booleanQueryParam,
  hasHackathonWin: booleanQueryParam,
  sort: z.enum(['relevance', 'recent', 'boosted']).optional(),
  page: nonNegativeIntQueryParam,
  pageSize: nonNegativeIntQueryParam,
});

/**
 * What a company gets back for one candidate.
 *
 * Scoped to name / role / skills / experience / education — see
 * utils/companyVisibleProfile.ts for the full statement of that rule and what
 * it deliberately withholds. `resumeLink`, `portfolioLink`, `platformBadges`
 * and the achievement counts used to be on this interface and have been
 * removed; the frontend renders a generated profile sheet from the fields
 * below instead of linking the candidate's own resume file.
 */
interface CandidateCardResponse {
  id: string;
  fullName: string | null;
  status: string;
  category: CandidateCategory | null;
  primaryRole: { id: string; roleName: string } | null;
  yearsOfExperience: number | null;
  secondaryRoles: { id: string; roleName: string }[];
  skills: { id: string; skillName: string }[];
  domain: { id: string; domainName: string } | null;
  education: CompanyVisibleEducation[];
  location: string | null;
  noticePeriod: NoticePeriod | null;
  /**
   * Employer *shape*, not employer identity: a company filtering for MNC
   * alumni gets to filter, without every subscriber learning exactly where
   * each candidate currently works before paying to unlock them.
   */
  isMncAlumni: boolean;
  isFaangMaangAlumni: boolean;
  isStartupAlumni: boolean;
  isUnlockedByMe: boolean;
  phone: string | null;
  email: string | null;
  whatsappLink: string | null;
}

export const searchCandidates = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const query = searchCandidatesQuerySchema.parse(req.query);

  const skillIdsSchema = z.array(z.string().uuid());
  let skillIds: string[] | undefined;
  if (query.skillIds) {
    const raw = query.skillIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    skillIds = raw.length > 0 ? skillIdsSchema.parse(raw) : undefined;
  }

  const page = query.page && query.page > 0 ? query.page : 1;
  const pageSize = Math.min(query.pageSize && query.pageSize > 0 ? query.pageSize : 20, 50);

  const response = await runInRequestContext(authUser, async (t) => {
    // Sequential — not Promise.all — throughout: every query below shares
    // transaction `t`, which pins them to one pg connection (see the
    // comment on candidateController.buildProfileResponse for the full
    // rationale; a real bug of this exact kind was already found & fixed
    // once in this codebase).
    const companyProfile = await CompanyProfile.findOne({
      where: { userId: authUser.id },
      transaction: t,
    });
    const companyVerified = companyProfile?.verified ?? false;

    // The candidate portal is now gated on admin verification outright,
    // rather than being browsable-but-blurred. Candidate profiles are the
    // product; an unverified company shouldn't be able to enumerate who is
    // on the platform, their roles, skills and employers, just because the
    // phone number happens to be withheld. The frontend checks
    // `verified` on the company profile and shows a "pending" screen instead
    // of calling this at all — this 403 is the enforcement, not the UX.
    if (!companyVerified) {
      throw ApiError.forbidden(
        'Your company is awaiting admin verification. Candidate search unlocks as soon as that is approved.',
      );
    }

    // ----- Multi-valued filters (skills, platform badge, achievements) -----
    // Resolved as separate candidate-id-set subqueries rather than joined
    // `include`s on the main findAll, because those relations are
    // one-to-many from the candidate's side: joining them directly would
    // multiply/duplicate candidate rows (one row per matching related row),
    // which would then also break `count()`'s totalCount and the
    // page/pageSize slicing. Intersecting plain id sets in JS keeps the
    // main query a single row per candidate.
    //
    // Skill matching uses ANY-of-selected-skills semantics (a candidate
    // matches if they have at least one of the requested skills), not
    // ALL-of-selected-skills — simpler to reason about and still useful for
    // browsing; ALL-of semantics would need either N separate intersected
    // queries (one per skillId) or a HAVING COUNT(DISTINCT skill_id) = N
    // raw query.
    let requiredCandidateIds: Set<string> | null = null;
    const intersect = (ids: Iterable<string>) => {
      const incoming = new Set(ids);
      requiredCandidateIds =
        requiredCandidateIds === null
          ? incoming
          : new Set([...requiredCandidateIds].filter((id) => incoming.has(id)));
    };

    if (skillIds && skillIds.length > 0) {
      const rows = await CandidateSkill.findAll({
        where: { skillId: { [Op.in]: skillIds } },
        transaction: t,
      });
      intersect(rows.map((r) => r.candidateId));
    }

    if (query.platformName) {
      const badgeWhere: Record<string, unknown> = { platformName: query.platformName };
      // badgeSelected is only meaningful combined with platformName, and per
      // spec must match a `verified` row when given.
      if (query.badgeSelected) {
        badgeWhere.badgeSelected = query.badgeSelected;
        badgeWhere.verificationStatus = 'verified';
      }
      if (query.questionsSolvedMin !== undefined || query.questionsSolvedMax !== undefined) {
        const range: Record<symbol, number> = {};
        if (query.questionsSolvedMin !== undefined) range[Op.gte] = query.questionsSolvedMin;
        if (query.questionsSolvedMax !== undefined) range[Op.lte] = query.questionsSolvedMax;
        badgeWhere.totalQuestionsSolved = range;
      }
      const rows = await CandidatePlatformBadge.findAll({ where: badgeWhere, transaction: t });
      intersect(rows.map((r) => r.candidateId));
    }

    if (query.hasResearch) {
      const rows = await CandidateAchievement.findAll({
        where: { type: 'research', verificationStatus: 'verified' },
        transaction: t,
      });
      intersect(rows.map((r) => r.candidateId));
    }

    if (query.hasHackathonWin) {
      const rows = await CandidateAchievement.findAll({
        where: { type: 'achievement', verificationStatus: 'verified' },
        transaction: t,
      });
      intersect(rows.map((r) => r.candidateId));
    }

    // requiredCandidateIds is non-null only if at least one multi-valued
    // filter above ran; an empty set means "no candidate can possibly
    // match" — short-circuit rather than issuing a query with `IN ()`.
    if (requiredCandidateIds !== null && (requiredCandidateIds as Set<string>).size === 0) {
      return { results: [], page, pageSize, totalCount: 0 };
    }

    // ----- Main where/include -----
    // `isActivelyLooking` was missing here, which made the candidate's
    // "Actively looking" switch purely decorative: it wrote `false` to the
    // profile happily enough, but search never consulted the column, so a
    // candidate who had explicitly paused their visibility stayed fully
    // listed and unlockable. Pausing now genuinely removes them from the
    // portal — which is the only thing that toggle claims to do.
    const where: Record<string, unknown> = { status: 'approved', isActivelyLooking: true };
    if (query.category) where.category = query.category;
    if (query.primaryRoleId) where.primaryRoleId = query.primaryRoleId;
    if (query.domainId) where.domainId = query.domainId;
    if (query.noticePeriod) where.noticePeriod = query.noticePeriod;
    if (query.location) where.location = { [Op.iLike]: `%${query.location}%` };
    if (query.experienceMin !== undefined || query.experienceMax !== undefined) {
      const range: Record<symbol, number> = {};
      if (query.experienceMin !== undefined) range[Op.gte] = query.experienceMin;
      if (query.experienceMax !== undefined) range[Op.lte] = query.experienceMax;
      where.yearsOfExperience = range;
    }
    // startupAlumni derives from candidate_profiles.companyType directly;
    // mnc/faangMaang alumni derive from the joined currentCompany below.
    if (query.startupAlumni) where.companyType = 'startup';
    if (requiredCandidateIds !== null) {
      where.userId = { [Op.in]: [...requiredCandidateIds] };
    }

    const currentCompanyWhere: Record<string, unknown> = {};
    if (query.mncAlumni) currentCompanyWhere.isMnc = true;
    if (query.faangMaangAlumni) currentCompanyWhere.isFaangMaang = true;
    const currentCompanyFilterActive = Object.keys(currentCompanyWhere).length > 0;

    const include = [
      { model: RoleMaster, as: 'primaryRole' },
      { model: DomainMaster, as: 'domain' },
      {
        model: CompanyMaster,
        as: 'currentCompany',
        required: currentCompanyFilterActive,
        where: currentCompanyFilterActive ? currentCompanyWhere : undefined,
      },
    ];

    // "relevance" and "boosted" have no real scoring/backing data yet
    // (relevance ranking and Boost are both later-phase work — Boost is
    // explicitly Phase 6) — both fall back to the same "recent" ordering
    // as a reasonable default rather than an arbitrary/unordered result set.
    const order: [string, string][] = [['updatedAt', 'DESC']];

    const candidates = await CandidateProfile.findAll({
      where,
      include,
      order,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      transaction: t,
    });

    const totalCount = await CandidateProfile.count({ where, include, transaction: t });

    const results: CandidateCardResponse[] = [];
    for (const candidate of candidates) {
      // Sequential per-candidate detail fetches (see the module-level
      // comment above) — this loop is naturally sequential already since
      // it's a `for...of` with `await` inside, which is fine.
      const plain = candidate.get({ plain: true }) as CandidateProfileAttributes & {
        primaryRole: RoleMasterAttributes | null;
        domain: DomainMasterAttributes | null;
        currentCompany: CompanyMasterAttributes | null;
      };

      const candidateUser = await User.findByPk(plain.userId, { transaction: t });

      const secondaryRoleRows = await CandidateSecondaryRole.findAll({
        where: { candidateId: plain.userId },
        include: [{ model: RoleMaster, as: 'role' }],
        transaction: t,
      });
      const skillRows = await CandidateSkill.findAll({
        where: { candidateId: plain.userId },
        include: [{ model: SkillMaster, as: 'skill' }],
        transaction: t,
      });
      const education = await loadCompanyVisibleEducation(plain.userId, t);

      // Unverified companies never see contact info or an unlocked state,
      // even if an Unlock row exists from before the company lost
      // verification — so skip the lookup entirely when unverified.
      let isUnlockedByMe = false;
      if (companyVerified) {
        const unlock = await Unlock.findOne({
          where: { companyId: authUser.id, candidateId: plain.userId },
          transaction: t,
        });
        isUnlockedByMe = !!unlock;
      }

      const secondaryRoles = secondaryRoleRows.map((row) => {
        const p = row.get({ plain: true }) as CandidateSecondaryRoleAttributes & {
          role: RoleMasterAttributes;
        };
        return { id: p.role.id, roleName: p.role.roleName };
      });
      const skills = skillRows.map((row) => {
        const p = row.get({ plain: true }) as CandidateSkillAttributes & {
          skill: SkillMasterAttributes;
        };
        return { id: p.skill.id, skillName: p.skill.skillName };
      });

      results.push({
        // "id" is the candidate's user id (not the candidate_profiles row
        // id) — this is what unlock/messaging/block routes address a
        // candidate by (":candidateId" params elsewhere in Phase 3).
        id: plain.userId,
        fullName: candidateUser?.fullName ?? null,
        status: plain.status,
        category: plain.category,
        primaryRole: plain.primaryRole
          ? { id: plain.primaryRole.id, roleName: plain.primaryRole.roleName }
          : null,
        yearsOfExperience: plain.yearsOfExperience,
        secondaryRoles,
        skills,
        domain: plain.domain ? { id: plain.domain.id, domainName: plain.domain.domainName } : null,
        education,
        location: plain.location,
        noticePeriod: plain.noticePeriod,
        isMncAlumni: plain.currentCompany?.isMnc ?? false,
        isFaangMaangAlumni: plain.currentCompany?.isFaangMaang ?? false,
        isStartupAlumni: plain.companyType === 'startup',
        isUnlockedByMe,
        phone: isUnlockedByMe ? candidateUser?.phone ?? null : null,
        email: isUnlockedByMe ? candidateUser?.email ?? null : null,
        whatsappLink: isUnlockedByMe ? buildWhatsappLink(candidateUser?.phone) : null,
      });
    }

    return { results, page, pageSize, totalCount };
  });

  res.json(response);
});
