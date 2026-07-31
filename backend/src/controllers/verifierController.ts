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
import type { UserAttributes } from '../models/User';
import type { CandidatePlatformBadgeAttributes } from '../models/CandidatePlatformBadge';
import type { CandidateAchievementAttributes } from '../models/CandidateAchievement';
import type { ProfileFieldCheckAttributes } from '../models/ProfileFieldCheck';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { hashPassword, comparePassword } from '../utils/password';
import { sendEmail } from '../utils/email';
import { profileStatusChangedEmail } from '../utils/emailTemplates';

export const ping = asyncHandler(async (req: Request, res: Response) => {
  res.json({ message: 'Signed in as verifier', userId: req.user!.id });
});

// ---------------------------------------------------------------------
// Catalog buckets
//
// The portal presents three catalogs rather than raw statuses, because six
// statuses is more granularity than a reviewer needs to triage. `draft` is
// deliberately in NO bucket — a candidate who hasn't submitted yet has not
// asked to be reviewed and must not appear in any queue.
// ---------------------------------------------------------------------

const CATALOGS = {
  unverified: ['submitted', 'under_review', 'needs_info'],
  verified: ['approved'],
  rejected: ['rejected'],
} as const;

type Catalog = keyof typeof CATALOGS;

const CATALOG_KEYS = Object.keys(CATALOGS) as Catalog[];

// ---------------------------------------------------------------------
// GET /queue/profiles
// ---------------------------------------------------------------------

const listProfileQueueSchema = z.object({
  catalog: z.enum(['unverified', 'verified', 'rejected']).default('unverified'),
  // Optional now (it was required pre-Phase-5, when the queue was tabbed by
  // category). The three catalogs are the primary axis; category narrows
  // within one.
  category: z.enum(['fresher', 'experienced', 'executive']).optional(),
  q: z.string().trim().min(1).optional(),
});

interface ProfileQueueRow {
  id: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  category: CandidateCategory | null;
  status: CandidateStatus;
  submittedAt: Date | null;
  updatedAt: Date;
  primaryRole: { id: string; roleName: string } | null;
  assignedVerifierId: string | null;
  assignedVerifierName: string | null;
  pendingReverification: boolean;
  reverificationRequestedAt: Date | null;
  /** Field verdicts on the most recent review pass, for the at-a-glance column. */
  checksPassed: number;
  checksFailed: number;
}

interface ProfileQueueResponse {
  catalog: Catalog;
  counts: Record<Catalog, number>;
  rows: ProfileQueueRow[];
}

/**
 * Maps one profile row (plus its joined role/user) onto the queue shape.
 * Shared by the catalog queue and the management list so the two can never
 * drift into showing different columns for the same candidate.
 *
 * Sequential awaits throughout — everything shares transaction `t`, which
 * pins one pg connection (see the discipline note in
 * candidateController.buildProfileResponse).
 */
async function toQueueRow(
  profile: CandidateProfile,
  t: Transaction,
): Promise<ProfileQueueRow> {
  const plain = profile.get({ plain: true }) as CandidateProfileAttributes & {
    primaryRole: RoleMasterAttributes | null;
    user: UserAttributes | null;
  };

  let assignedVerifierName: string | null = null;
  if (plain.assignedVerifierId) {
    const verifier = await User.findByPk(plain.assignedVerifierId, { transaction: t });
    assignedVerifierName = verifier?.fullName ?? null;
  }

  const checks = await loadCurrentFieldChecks(plain.id, t);

  return {
    id: plain.id,
    userId: plain.userId,
    fullName: plain.user?.fullName ?? null,
    email: plain.user?.email ?? null,
    category: plain.category,
    status: plain.status,
    submittedAt: plain.submittedAt,
    updatedAt: plain.updatedAt,
    primaryRole: plain.primaryRole
      ? { id: plain.primaryRole.id, roleName: plain.primaryRole.roleName }
      : null,
    assignedVerifierId: plain.assignedVerifierId,
    assignedVerifierName,
    pendingReverification: plain.pendingReverification,
    reverificationRequestedAt: plain.reverificationRequestedAt,
    checksPassed: checks.filter((c) => c.passed).length,
    checksFailed: checks.filter((c) => !c.passed).length,
  };
}

export const listProfileQueue = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { catalog, category, q } = listProfileQueueSchema.parse(req.query);

  const result = await runInRequestContext(authUser, async (t) => {
    // Counts for all three tabs come back on every request so the tab bar can
    // show live badges without the client firing three extra round-trips.
    const counts = {} as Record<Catalog, number>;
    for (const key of CATALOG_KEYS) {
      counts[key] = await CandidateProfile.count({
        where: {
          status: { [Op.in]: [...CATALOGS[key]] },
          ...(category ? { category } : {}),
        },
        transaction: t,
      });
    }

    const profiles = await CandidateProfile.findAll({
      where: {
        status: { [Op.in]: [...CATALOGS[catalog]] },
        ...(category ? { category } : {}),
      },
      include: [
        { model: RoleMaster, as: 'primaryRole' },
        {
          model: User,
          as: 'user',
          // Name/email search is pushed into the join rather than filtered in
          // JS so it still works once the table outgrows a single page.
          ...(q
            ? {
                where: {
                  [Op.or]: [
                    { fullName: { [Op.iLike]: `%${q}%` } },
                    { email: { [Op.iLike]: `%${q}%` } },
                  ],
                },
                required: true,
              }
            : {}),
        },
      ],
      // Profiles submitted before Phase 4 shipped have no submittedAt — treat
      // those as lowest priority rather than erroring. Decided catalogs sort
      // by most-recently-touched instead, which is the useful order there.
      order:
        catalog === 'unverified'
          ? [literal('submitted_at ASC NULLS LAST')]
          : [['updatedAt', 'DESC']],
      transaction: t,
    });

    const rows: ProfileQueueRow[] = [];
    for (const profile of profiles) {
      rows.push(await toQueueRow(profile, t));
    }

    const response: ProfileQueueResponse = { catalog, counts, rows };
    return response;
  });

  res.json(result);
});

// ---------------------------------------------------------------------
// GET /profiles — verifier profile management
//
// Same rows as the queue, but unconstrained by catalog: every candidate
// profile that has ever been submitted, searchable, so a verifier can find
// a past decision and re-open it. `draft` is still excluded — see the
// CATALOGS comment.
// ---------------------------------------------------------------------

const listAllProfilesSchema = z.object({
  status: z
    .enum(['submitted', 'under_review', 'needs_info', 'approved', 'rejected'])
    .optional(),
  category: z.enum(['fresher', 'experienced', 'executive']).optional(),
  q: z.string().trim().min(1).optional(),
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const listAllProfiles = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { status, category, q, mine } = listAllProfilesSchema.parse(req.query);

  const result = await runInRequestContext(authUser, async (t) => {
    const everyReviewableStatus = CATALOG_KEYS.flatMap((key) => [...CATALOGS[key]]);

    const profiles = await CandidateProfile.findAll({
      where: {
        status: status ? status : { [Op.in]: everyReviewableStatus },
        ...(category ? { category } : {}),
        ...(mine ? { assignedVerifierId: authUser.id } : {}),
      },
      include: [
        { model: RoleMaster, as: 'primaryRole' },
        {
          model: User,
          as: 'user',
          ...(q
            ? {
                where: {
                  [Op.or]: [
                    { fullName: { [Op.iLike]: `%${q}%` } },
                    { email: { [Op.iLike]: `%${q}%` } },
                  ],
                },
                required: true,
              }
            : {}),
        },
      ],
      order: [['updatedAt', 'DESC']],
      transaction: t,
    });

    const rows: ProfileQueueRow[] = [];
    for (const profile of profiles) {
      rows.push(await toQueueRow(profile, t));
    }
    return rows;
  });

  res.json(result);
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
// Field checks
//
// profile_field_checks is append-only (see migrations/20240105000001), so
// "what does the verifier currently think of field X" means "the newest row
// for field X". This collapses the history down to that current view.
// ---------------------------------------------------------------------

interface CurrentFieldCheck {
  fieldKey: string;
  fieldLabel: string | null;
  passed: boolean;
  reasonId: string | null;
  reasonText: string | null;
  reviewerId: string;
  checkedAt: Date;
}

async function loadCurrentFieldChecks(
  profileId: string,
  t: Transaction,
): Promise<CurrentFieldCheck[]> {
  const rows = await ProfileFieldCheck.findAll({
    where: { profileId },
    order: [['createdAt', 'DESC']],
    transaction: t,
  });

  const newestByField = new Map<string, CurrentFieldCheck>();
  for (const row of rows) {
    const plain = row.get({ plain: true }) as ProfileFieldCheckAttributes;
    // Rows arrive newest-first, so the first sighting of a key IS the
    // current verdict; later ones are superseded history.
    if (newestByField.has(plain.fieldKey)) continue;
    newestByField.set(plain.fieldKey, {
      fieldKey: plain.fieldKey,
      fieldLabel: plain.fieldLabel,
      passed: plain.passed,
      reasonId: plain.reasonId,
      reasonText: plain.reasonText,
      reviewerId: plain.reviewerId,
      checkedAt: plain.createdAt,
    });
  }

  return Array.from(newestByField.values());
}

// ---------------------------------------------------------------------
// Checklist
//
// The canonical list of things a verifier says Yes/No to, derived from the
// candidate's own data and category. Built on the server (rather than
// hardcoded in the React page) so it stays in lockstep with the required-
// field rules in candidateController.submitMyProfile — if a field is
// mandatory to submit, it is mandatory to check.
// ---------------------------------------------------------------------

type ChecklistGroup = 'identity' | 'profile' | 'experience' | 'proof';

interface ChecklistItem {
  fieldKey: string;
  label: string;
  /** Rendered as the thing being judged. Null means the candidate left it empty. */
  value: string | null;
  /** When set, the frontend renders `value` as an openable link. */
  link: string | null;
  group: ChecklistGroup;
  /** Optional fields can be skipped without blocking a decision. */
  required: boolean;
  hint: string | null;
}

function buildChecklist(
  profile: VerifierProfileReviewResponse,
): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const add = (item: ChecklistItem) => items.push(item);

  add({
    fieldKey: 'fullName',
    label: 'Full name',
    value: profile.fullName,
    link: null,
    group: 'identity',
    required: true,
    hint: 'Matches the name on the resume and proof documents',
  });
  add({
    fieldKey: 'phone',
    label: 'Phone',
    value: profile.phone,
    link: null,
    group: 'identity',
    required: true,
    hint: 'Plausible, correctly formatted number',
  });
  add({
    fieldKey: 'email',
    label: 'Email',
    value: profile.email,
    link: null,
    group: 'identity',
    required: true,
    hint: null,
  });
  add({
    fieldKey: 'primaryRole',
    label: 'Primary role',
    value: profile.primaryRole?.roleName ?? null,
    link: null,
    group: 'profile',
    required: true,
    hint: 'Consistent with the resume and stated experience',
  });
  add({
    fieldKey: 'domain',
    label: 'Domain',
    value: profile.domain?.domainName ?? null,
    link: null,
    group: 'profile',
    required: true,
    hint: null,
  });
  add({
    fieldKey: 'skills',
    label: 'Skills',
    value: profile.skills.length > 0 ? profile.skills.map((s) => s.skillName).join(', ') : null,
    link: null,
    group: 'profile',
    required: false,
    hint: 'Backed up by the projects or work history below',
  });
  add({
    fieldKey: 'resumeLink',
    label: 'Resume link',
    value: profile.resumeLink,
    link: profile.resumeLink,
    group: 'proof',
    required: true,
    hint: 'Opens, and is a real resume for this candidate',
  });
  add({
    fieldKey: 'portfolioLink',
    label: 'Portfolio link',
    value: profile.portfolioLink,
    link: profile.portfolioLink,
    group: 'proof',
    required: false,
    hint: 'Optional — only check if provided',
  });
  add({
    fieldKey: 'location',
    label: 'Location',
    value: profile.location,
    link: null,
    group: 'profile',
    required: false,
    hint: null,
  });

  if (profile.category === 'fresher') {
    // One row per project rather than a single "projects" row: the whole
    // point of the per-field flow is that the verifier can pass two project
    // links and fail the third with its own reason.
    const projects = profile.achievements.filter((a) => a.type === 'project');
    for (const project of projects) {
      add({
        fieldKey: `project:${project.id}`,
        label: `Project — ${project.title}`,
        value: project.certificateOrProofLink,
        link: project.certificateOrProofLink,
        group: 'proof',
        required: true,
        hint: 'Link is live and shows real, attributable work',
      });
    }
    if (projects.length < 3) {
      add({
        fieldKey: 'projectCount',
        label: `Minimum 3 projects (${projects.length} submitted)`,
        value: `${projects.length} of 3`,
        link: null,
        group: 'proof',
        required: true,
        hint: 'Freshers must submit at least three projects',
      });
    }
    for (const badge of profile.platformBadges) {
      add({
        fieldKey: `badge:${badge.id}`,
        label: `${badge.platformName} — ${badge.badgeSelected}`,
        value: `${badge.totalQuestionsSolved} solved`,
        link: badge.platformProfileLink,
        group: 'proof',
        required: false,
        hint: 'Profile link actually shows this badge/rank',
      });
    }
  } else {
    add({
      fieldKey: 'yearsOfExperience',
      label: 'Years of experience',
      value: profile.yearsOfExperience != null ? String(profile.yearsOfExperience) : null,
      link: null,
      group: 'experience',
      required: true,
      hint: 'Matches the work history on LinkedIn / the resume',
    });
    add({
      fieldKey: 'currentCompany',
      label: 'Current company',
      value: profile.currentCompany?.companyName ?? null,
      link: null,
      group: 'experience',
      required: true,
      hint: null,
    });
    add({
      fieldKey: 'designationRole',
      label: 'Designation',
      value: profile.designationRole?.roleName ?? null,
      link: null,
      group: 'experience',
      required: true,
      hint: 'Title matches what the employer actually lists',
    });
    add({
      fieldKey: 'companyType',
      label: 'Company type',
      value: profile.companyType,
      link: null,
      group: 'experience',
      required: true,
      hint: 'MNC / startup / agency tag matches the real employer',
    });
    add({
      fieldKey: 'offerLetterOrLinkedinLink',
      label: 'Offer letter or LinkedIn',
      value: profile.offerLetterOrLinkedinLink,
      link: profile.offerLetterOrLinkedinLink,
      group: 'proof',
      required: true,
      hint: 'Document looks authentic and matches the claims above',
    });

    if (profile.category === 'executive') {
      add({
        fieldKey: 'teamSizeManaged',
        label: 'Team size managed',
        value: profile.teamSizeManaged != null ? String(profile.teamSizeManaged) : null,
        link: null,
        group: 'experience',
        required: true,
        hint: null,
      });
      add({
        fieldKey: 'budgetOwned',
        label: 'Budget owned',
        value: profile.budgetOwned,
        link: null,
        group: 'experience',
        required: false,
        hint: 'Optional',
      });
      add({
        fieldKey: 'titleLevel',
        label: 'Title / level',
        value: profile.titleLevel,
        link: null,
        group: 'experience',
        required: false,
        hint: null,
      });
    }

    // Non-freshers can also attach projects/research once approved; those
    // are optional context rather than gating proof.
    for (const achievement of profile.achievements) {
      add({
        fieldKey: `project:${achievement.id}`,
        label: `${achievement.type} — ${achievement.title}`,
        value: achievement.certificateOrProofLink,
        link: achievement.certificateOrProofLink,
        group: 'proof',
        required: false,
        hint: 'Optional — proof link is live and attributable',
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------
// Timeline
//
// One merged, newest-first history of everything that ever happened to a
// profile: submission, every verifier decision, and every individual field
// verdict. Assembled in JS from three sources rather than as a SQL UNION
// because the three tables have genuinely different shapes and this runs
// once per profile page view.
// ---------------------------------------------------------------------

type TimelineKind = 'submitted' | 'decision' | 'field_check' | 'reverification_requested';

interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  at: Date;
  title: string;
  detail: string | null;
  actorId: string | null;
  actorName: string | null;
  /** 'pass' | 'fail' | 'neutral' — drives the dot colour in the UI. */
  tone: 'pass' | 'fail' | 'neutral';
}

async function buildTimeline(
  profile: CandidateProfileAttributes,
  t: Transaction,
): Promise<TimelineEntry[]> {
  const entries: TimelineEntry[] = [];

  // Resolves reviewer/verifier display names once each, not once per row —
  // a profile with 20 field checks from the same reviewer would otherwise
  // issue 20 identical lookups down a single pinned pg connection.
  const nameCache = new Map<string, string | null>();
  const resolveName = async (userId: string): Promise<string | null> => {
    if (nameCache.has(userId)) return nameCache.get(userId) ?? null;
    const found = await User.findByPk(userId, { transaction: t });
    const name = found?.fullName ?? found?.username ?? found?.email ?? null;
    nameCache.set(userId, name);
    return name;
  };

  if (profile.submittedAt) {
    entries.push({
      id: `submitted:${profile.id}`,
      kind: 'submitted',
      at: profile.submittedAt,
      title: 'Profile submitted for verification',
      detail: profile.category ? `Category: ${profile.category}` : null,
      actorId: profile.userId,
      actorName: null,
      tone: 'neutral',
    });
  }

  if (profile.reverificationRequestedAt) {
    entries.push({
      id: `reverify:${profile.id}`,
      kind: 'reverification_requested',
      at: profile.reverificationRequestedAt,
      title: 'Candidate requested re-verification of new items',
      detail: null,
      actorId: profile.userId,
      actorName: null,
      tone: 'neutral',
    });
  }

  const logs = await VerificationLog.findAll({
    where: { targetType: 'candidate_profile', targetId: profile.id },
    order: [['createdAt', 'DESC']],
    transaction: t,
  });
  for (const log of logs) {
    entries.push({
      id: `log:${log.id}`,
      kind: 'decision',
      at: log.createdAt,
      title: `Decision: ${log.decision.replace('_', ' ')}`,
      detail: log.notes,
      actorId: log.reviewerId,
      // reviewerId is only ever null for the system-generated duplicate
      // resume-link flag (see candidateController.flagDuplicateResumeLinkIfAny)
      // — there's no user row to resolve a display name from.
      actorName: log.reviewerId ? await resolveName(log.reviewerId) : 'System',
      tone: log.decision === 'approved' ? 'pass' : log.decision === 'flagged' ? 'neutral' : 'fail',
    });
  }

  const checks = await ProfileFieldCheck.findAll({
    where: { profileId: profile.id },
    order: [['createdAt', 'DESC']],
    transaction: t,
  });
  for (const check of checks) {
    const plain = check.get({ plain: true }) as ProfileFieldCheckAttributes;
    entries.push({
      id: `check:${plain.id}`,
      kind: 'field_check',
      at: plain.createdAt,
      title: `${plain.fieldLabel || plain.fieldKey} — marked ${plain.passed ? 'Yes' : 'No'}`,
      detail: plain.passed ? null : plain.reasonText,
      actorId: plain.reviewerId,
      actorName: await resolveName(plain.reviewerId),
      tone: plain.passed ? 'pass' : 'fail',
    });
  }

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}

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
  // Phase 5 additions. `checklist` is populated by decorateReview() after
  // this base object exists, since buildChecklist() reads the profile it is
  // describing.
  submittedAt: Date | null;
  assignedVerifierId: string | null;
  assignedVerifierName: string | null;
  pendingReverification: boolean;
  reverificationRequestedAt: Date | null;
  checklist: ChecklistItem[];
  fieldChecks: CurrentFieldCheck[];
  timeline: TimelineEntry[];
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
  let assignedVerifierName: string | null = null;
  if (plainProfile.assignedVerifierId) {
    const assignee = await User.findByPk(plainProfile.assignedVerifierId, { transaction: t });
    assignedVerifierName = assignee?.fullName ?? assignee?.username ?? null;
  }
  const latestVerificationLog = await VerificationLog.findOne({
    where: { targetType: 'candidate_profile', targetId: plainProfile.id },
    order: [['createdAt', 'DESC']],
    transaction: t,
  });
  const fieldChecks = await loadCurrentFieldChecks(plainProfile.id, t);
  const timeline = await buildTimeline(plainProfile, t);
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

  const response: VerifierProfileReviewResponse = {
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
    submittedAt: plainProfile.submittedAt,
    assignedVerifierId: plainProfile.assignedVerifierId,
    assignedVerifierName,
    pendingReverification: plainProfile.pendingReverification,
    reverificationRequestedAt: plainProfile.reverificationRequestedAt,
    // Placeholder — filled immediately below, once `response` exists for
    // buildChecklist to read.
    checklist: [],
    fieldChecks,
    timeline,
  };

  response.checklist = buildChecklist(response);
  return response;
}

export const getProfileForReview = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  const response = await runInRequestContext(authUser, (t) => buildReviewProfileResponse(id, t));

  res.json(response);
});

// ---------------------------------------------------------------------
// POST /profiles/:id/field-checks
//
// Records a batch of Yes/No verdicts. Separate from the decision endpoint
// so a reviewer can work through a long checklist over several saves
// without committing to approve/reject yet — the page autosaves each answer.
// ---------------------------------------------------------------------

const fieldCheckSchema = z.object({
  fieldKey: z.string().min(1),
  fieldLabel: z.string().optional(),
  passed: z.boolean(),
  reasonId: z.string().uuid().optional(),
  note: z.string().optional(),
});

const saveFieldChecksSchema = z.object({
  checks: z.array(fieldCheckSchema).min(1),
});

/**
 * Turns a submitted verdict into the reason_text we persist, resolving a
 * picked rejection-reason id to its wording so the stored row is readable on
 * its own (the candidate-facing report renders reason_text directly, and a
 * master reason can be reworded later without rewriting history).
 *
 * Shared by saveFieldChecks and decideProfile, which accept the same shape.
 */
async function resolveCheckReason(
  check: z.infer<typeof fieldCheckSchema>,
  t: Transaction,
): Promise<string | null> {
  if (check.passed) {
    // A note on a passing check is still worth keeping — reviewers use it
    // for "verified against the LinkedIn archive" style breadcrumbs.
    return check.note?.trim() || null;
  }

  if (!check.reasonId && !check.note?.trim()) {
    throw ApiError.badRequest(
      `A reason or note is required when marking "${check.fieldLabel || check.fieldKey}" as No`,
    );
  }

  if (!check.reasonId) {
    return check.note!.trim();
  }

  const reason = await RejectionReasonMaster.findByPk(check.reasonId, { transaction: t });
  if (!reason) {
    throw ApiError.badRequest('reasonId must reference a valid rejection reason');
  }
  return `${reason.reasonText}${check.note?.trim() ? ' — ' + check.note.trim() : ''}`;
}

async function persistFieldChecks(
  profile: CandidateProfile,
  reviewerId: string,
  checks: z.infer<typeof fieldCheckSchema>[],
  t: Transaction,
): Promise<void> {
  for (const check of checks) {
    // Sequential — shares transaction `t`.
    const reasonText = await resolveCheckReason(check, t);
    await ProfileFieldCheck.create(
      {
        profileId: profile.id,
        candidateId: profile.userId,
        reviewerId,
        fieldKey: check.fieldKey,
        fieldLabel: check.fieldLabel ?? null,
        passed: check.passed,
        reasonId: check.reasonId ?? null,
        reasonText,
      },
      { transaction: t },
    );
  }
}

export const saveFieldChecks = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = saveFieldChecksSchema.parse(req.body);

  const response = await runInRequestContext(authUser, async (t) => {
    const profile = await CandidateProfile.findByPk(id, { transaction: t });
    if (!profile) {
      throw ApiError.notFound('Candidate profile not found');
    }

    // Recording a verdict is itself an act of review — take ownership so the
    // profile stops showing as unclaimed to other verifiers mid-review.
    if (!profile.assignedVerifierId) {
      profile.assignedVerifierId = authUser.id;
      if (profile.status === 'submitted') {
        profile.status = 'under_review';
      }
      await profile.save({ transaction: t });
    } else if (profile.assignedVerifierId !== authUser.id) {
      throw ApiError.conflict('This profile is claimed by another reviewer');
    }

    await persistFieldChecks(profile, authUser.id, body.checks, t);

    return buildReviewProfileResponse(id, t);
  });

  res.json(response);
});

// ---------------------------------------------------------------------
// GET /profiles/:id/timeline
// ---------------------------------------------------------------------

export const getProfileTimeline = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  const timeline = await runInRequestContext(authUser, async (t) => {
    const profile = await CandidateProfile.findByPk(id, { transaction: t });
    if (!profile) {
      throw ApiError.notFound('Candidate profile not found');
    }
    return buildTimeline(profile.get({ plain: true }) as CandidateProfileAttributes, t);
  });

  res.json(timeline);
});

// ---------------------------------------------------------------------
// POST /profiles/:id/reopen
//
// Pulls an already-decided profile (approved or rejected) back into the
// unverified catalog. Used from profile management when a decision needs
// revisiting — e.g. a candidate disputes a rejection, or a verified profile
// turns out to have a bad link.
// ---------------------------------------------------------------------

const reopenProfileSchema = z.object({
  note: z.string().trim().min(1),
});

export const reopenProfile = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = reopenProfileSchema.parse(req.body);

  const response = await runInRequestContext(authUser, async (t) => {
    const profile = await CandidateProfile.findByPk(id, { transaction: t });
    if (!profile) {
      throw ApiError.notFound('Candidate profile not found');
    }
    if (profile.status !== 'approved' && profile.status !== 'rejected') {
      throw ApiError.conflict('Only an approved or rejected profile can be re-opened');
    }

    const wasApproved = profile.status === 'approved';

    profile.status = 'under_review';
    profile.assignedVerifierId = authUser.id;
    await profile.save({ transaction: t });

    await VerificationLog.create(
      {
        targetType: 'candidate_profile',
        targetId: profile.id,
        reviewerId: authUser.id,
        // No 'reopened' member exists on the verification decision enum, and
        // adding one would mean an enum migration plus updating every
        // consumer that switches on it. 'needs_info' is the honest fit: the
        // profile is back in the queue awaiting more review.
        decision: 'needs_info',
        notes: `Re-opened for review — ${body.note}`,
      },
      { transaction: t },
    );

    await Notification.create(
      {
        userId: profile.userId,
        type: 'profile_status_changed',
        message: wasApproved
          ? `Your profile has been re-opened for review. ${body.note}`
          : `Your rejected profile has been re-opened for another look. ${body.note}`,
        link: '/candidate',
      },
      { transaction: t },
    );

    // Not already loaded in this scope (unlike buildReviewProfileResponse,
    // this handler never fetches the User row) — one extra lookup here,
    // reusing transaction `t`.
    const candidateUser = await User.findByPk(profile.userId, { transaction: t });

    return { candidateUser, review: await buildReviewProfileResponse(id, t) };
  });

  // Email sent after runInRequestContext resolves (transaction already
  // committed) — see the placement note on decideProfile's email send below
  // for why this is deliberately outside the transaction callback.
  if (response.candidateUser) {
    const { subject, html } = profileStatusChangedEmail(
      response.candidateUser.fullName ?? response.candidateUser.email,
      'needs_info',
      body.note,
    );
    await sendEmail({ to: response.candidateUser.email, subject, html });
  }

  res.json(response.review);
});

// ---------------------------------------------------------------------
// POST /profiles/:id/decision
// ---------------------------------------------------------------------

const decideProfileSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'needs_info', 'flagged']),
  reasonId: z.string().uuid().optional(),
  note: z.string().optional(),
  /**
   * Any still-unsaved field verdicts, committed atomically with the decision.
   * Lets the review page work as a single "check everything, then push"
   * action instead of forcing a separate save first — and guarantees the
   * checks and the decision they justify can never end up half-written.
   */
  fieldChecks: z.array(fieldCheckSchema).optional(),
});

export const decideProfile = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = decideProfileSchema.parse(req.body);

  const response = await runInRequestContext(authUser, async (t) => {
    const existing = await CandidateProfile.findByPk(id, { transaction: t });
    if (!existing) {
      throw ApiError.notFound('Candidate profile not found');
    }

    if (existing.assignedVerifierId && existing.assignedVerifierId !== authUser.id) {
      throw ApiError.conflict('This profile is claimed by another reviewer');
    }

    if (body.fieldChecks && body.fieldChecks.length > 0) {
      await persistFieldChecks(existing, authUser.id, body.fieldChecks, t);
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
      // 'flagged' escalates to Admin per spec — a later phase consumes
      // flagged verification_logs rows; this one just needs the log to
      // exist, so profile.status is intentionally left untouched.
      statusChanged = false;
    }

    if (statusChanged) {
      // Any decision settles the outstanding re-verification ask: the
      // reviewer has now looked at the profile in whatever state it was in,
      // so the candidate's dashboard banner should clear.
      existing.pendingReverification = false;
      existing.reverificationRequestedAt = null;
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
      approved: 'Your profile has been approved and is now live to companies.',
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

    // Not already loaded in this scope — the review response builder below
    // fetches its own User row inside buildReviewProfileResponse, but that's
    // a private local variable there, not something this function can reuse.
    // One extra lookup here, reusing transaction `t`.
    const candidateUser = await User.findByPk(existing.userId, { transaction: t });

    // Returns the full review shape, not the bare row: the page needs the
    // refreshed checklist/timeline to render the post-decision state, and
    // this saves it an immediate follow-up GET.
    return { candidateUser, notes, review: await buildReviewProfileResponse(id, t) };
  });

  // Email sent AFTER runInRequestContext resolves (the decision transaction
  // has already committed) rather than inside the callback — an email
  // failure must never roll back a verifier's decision, and sendEmail's
  // internal try/catch (see utils/email.ts) already guarantees it can't
  // throw, but keeping it structurally outside the transaction is the
  // clearer signal that it's an unrelated external side effect. Only sent
  // for the three decisions the copy in profileStatusChangedEmail actually
  // covers (approved/rejected/needs_info) — 'flagged' is an internal
  // escalation to Admin, not a candidate-facing status change.
  if (response.candidateUser && body.decision !== 'flagged') {
    const { subject, html } = profileStatusChangedEmail(
      response.candidateUser.fullName ?? response.candidateUser.email,
      body.decision,
      body.decision === 'rejected' || body.decision === 'needs_info' ? response.notes ?? undefined : undefined,
    );
    await sendEmail({ to: response.candidateUser.email, subject, html });
  }

  res.json(response.review);
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

// ---------------------------------------------------------------------
// GET /me — the signed-in verifier's own account + their personal stats
// ---------------------------------------------------------------------

interface VerifierAccountResponse {
  id: string;
  email: string;
  username: string | null;
  fullName: string | null;
  phone: string | null;
  createdAt: Date;
  stats: {
    approved: number;
    rejected: number;
    needsInfo: number;
    flagged: number;
    fieldChecks: number;
    currentlyAssigned: number;
    avgTimeToDecideHours: number | null;
  };
}

async function buildVerifierAccount(
  userId: string,
  t: Transaction,
): Promise<VerifierAccountResponse> {
  const user = await User.findByPk(userId, { transaction: t });
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // Only this verifier's own profile decisions — badge/achievement calls are
  // counted separately in the portal-wide analytics page, not here.
  const myLogs = await VerificationLog.findAll({
    where: { reviewerId: userId, targetType: 'candidate_profile' },
    transaction: t,
  });

  const countBy = (decision: string) => myLogs.filter((log) => log.decision === decision).length;

  const diffsHours: number[] = [];
  for (const log of myLogs) {
    // Sequential — shares transaction `t`.
    const profile = await CandidateProfile.findByPk(log.targetId, { transaction: t });
    if (profile?.submittedAt) {
      diffsHours.push((log.createdAt.getTime() - profile.submittedAt.getTime()) / (1000 * 60 * 60));
    }
  }

  const fieldChecks = await ProfileFieldCheck.count({
    where: { reviewerId: userId },
    transaction: t,
  });
  const currentlyAssigned = await CandidateProfile.count({
    where: {
      assignedVerifierId: userId,
      status: { [Op.in]: ['submitted', 'under_review', 'needs_info'] },
    },
    transaction: t,
  });

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    phone: user.phone,
    createdAt: user.createdAt,
    stats: {
      approved: countBy('approved'),
      rejected: countBy('rejected'),
      needsInfo: countBy('needs_info'),
      flagged: countBy('flagged'),
      fieldChecks,
      currentlyAssigned,
      avgTimeToDecideHours:
        diffsHours.length > 0 ? diffsHours.reduce((a, b) => a + b, 0) / diffsHours.length : null,
    },
  };
}

export const getMyVerifierAccount = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const result = await runInRequestContext(authUser, (t) => buildVerifierAccount(authUser.id, t));
  res.json(result);
});

// ---------------------------------------------------------------------
// PATCH /me
// ---------------------------------------------------------------------

const updateAccountSchema = z.object({
  fullName: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional(),
});

export const updateMyVerifierAccount = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = updateAccountSchema.parse(req.body);

  const result = await runInRequestContext(authUser, async (t) => {
    const user = await User.findByPk(authUser.id, { transaction: t });
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (body.fullName !== undefined) user.fullName = body.fullName;
    if (body.phone !== undefined) user.phone = body.phone || null;
    await user.save({ transaction: t });

    return buildVerifierAccount(authUser.id, t);
  });

  res.json(result);
});

// ---------------------------------------------------------------------
// POST /me/password
// ---------------------------------------------------------------------

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const changeMyVerifierPassword = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = changePasswordSchema.parse(req.body);

  await runInRequestContext(authUser, async (t) => {
    const user = await User.findByPk(authUser.id, { transaction: t });
    if (!user?.passwordHash) {
      throw ApiError.notFound('User not found');
    }

    const valid = await comparePassword(body.currentPassword, user.passwordHash);
    if (!valid) {
      throw ApiError.unauthorized('Current password is incorrect');
    }

    user.passwordHash = await hashPassword(body.newPassword);
    await user.save({ transaction: t });
  });

  // Existing access/refresh tokens deliberately stay valid — this endpoint
  // changes the credential, it is not a "sign out everywhere" control.
  res.status(204).send();
});
