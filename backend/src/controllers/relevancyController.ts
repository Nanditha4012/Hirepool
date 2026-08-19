import { Request, Response } from 'express';
import { Transaction } from 'sequelize';
import { z } from 'zod';
import {
  Job,
  User,
  CandidateProfile,
  CandidateRelevancyScore,
  RelevancyPackage,
  RoleMaster,
  DomainMaster,
  CandidateSecondaryRole,
  CandidateSkill,
  SkillMaster,
  Unlock,
} from '../models';
import type { RelevancyTier } from '../models/CandidateRelevancyScore';
import type {
  CandidateProfileAttributes,
  CandidateCategory,
  NoticePeriod,
} from '../models/CandidateProfile';
import type { RoleMasterAttributes } from '../models/RoleMaster';
import type { DomainMasterAttributes } from '../models/DomainMaster';
import type { CandidateSecondaryRoleAttributes } from '../models/CandidateSecondaryRole';
import type { CandidateSkillAttributes } from '../models/CandidateSkill';
import type { SkillMasterAttributes } from '../models/SkillMaster';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { buildWhatsappLink } from '../utils/contact';

/**
 * AI Relevancy Packages (Feature 1) — Phase 2: batch cards + "browse a
 * batch on-platform using the normal unlock flow" (spec's wording). Package
 * purchase (buy the whole batch as a download) is Phase 3.
 */

const TIERS: RelevancyTier[] = ['100_percent', '90_plus', '75_plus', '50_plus'];
const TIER_LABELS: Record<RelevancyTier, string> = {
  '100_percent': '100%',
  '90_plus': '90%+',
  '75_plus': '75%+',
  '50_plus': '50%+',
};

async function loadOwnedJob(jobId: string, companyId: string, t: Transaction): Promise<Job> {
  const job = await Job.findOne({ where: { id: jobId, companyId }, transaction: t });
  if (!job) throw ApiError.notFound('Job not found');
  return job;
}

// ---------------------------------------------------------------------
// GET /companies/jobs/:jobId/relevancy-packages (Phase 3/4) — added while
// building the frontend: without this, a company that buys a package and
// reloads the page has no way to find it again to hit the download
// endpoint. Only ever returns packages this company has actually paid for
// — purchasedByCompanyId stays null on an abandoned/incomplete checkout
// (see paymentController.purchaseRelevancyPackage), so filtering on it
// here excludes those naturally.
// ---------------------------------------------------------------------

export const listJobPackages = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId } = req.params;

  const response = await runInRequestContext(authUser, async (t) => {
    await loadOwnedJob(jobId, authUser.id, t);

    const packages = await RelevancyPackage.findAll({
      where: { jobId, purchasedByCompanyId: authUser.id },
      order: [['createdAt', 'DESC']],
      transaction: t,
    });

    return packages.map((pkg) => ({
      id: pkg.id,
      tier: pkg.tier,
      candidateCount: pkg.candidateCount,
      price: Number(pkg.price),
      purchasedAt: pkg.purchasedAt,
      downloadedAt: pkg.downloadedAt,
    }));
  });

  res.json(response);
});

// ---------------------------------------------------------------------
// GET /companies/jobs/:jobId/batches
// ---------------------------------------------------------------------

export const getJobBatches = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId } = req.params;

  const response = await runInRequestContext(authUser, async (t) => {
    await loadOwnedJob(jobId, authUser.id, t);

    const tiers = [];
    for (const tier of TIERS) {
      // Sequential — shares transaction `t`, same discipline used throughout
      // this codebase's multi-query handlers.
      const candidateCount = await CandidateRelevancyScore.count({ where: { jobId, tier }, transaction: t });
      tiers.push({ tier, label: TIER_LABELS[tier], candidateCount });
    }

    return { jobId, tiers };
  });

  res.json(response);
});

// ---------------------------------------------------------------------
// GET /companies/jobs/:jobId/batches/:tier/candidates
// ---------------------------------------------------------------------

const listBatchQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});

/**
 * Same withheld-until-unlocked shape as companyController's
 * CandidateCardResponse (see utils/companyVisibleProfile.ts for the
 * statement of that rule) — trimmed to the fields relevant here, plus the
 * relevancy score itself.
 */
interface BatchCandidateResponse {
  id: string;
  relevancyPercent: number;
  fullName: string | null;
  category: CandidateCategory | null;
  primaryRole: { id: string; roleName: string } | null;
  yearsOfExperience: number | null;
  secondaryRoles: { id: string; roleName: string }[];
  skills: { id: string; skillName: string }[];
  domain: { id: string; domainName: string } | null;
  location: string | null;
  noticePeriod: NoticePeriod | null;
  isUnlockedByMe: boolean;
  phone: string | null;
  email: string | null;
  whatsappLink: string | null;
}

export const listBatchCandidates = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId, tier } = req.params;
  if (!TIERS.includes(tier as RelevancyTier)) {
    throw ApiError.badRequest('Invalid tier');
  }
  const query = listBatchQuerySchema.parse(req.query);
  const page = query.page && query.page > 0 ? query.page : 1;
  const pageSize = Math.min(query.pageSize && query.pageSize > 0 ? query.pageSize : 20, 50);

  const response = await runInRequestContext(authUser, async (t) => {
    await loadOwnedJob(jobId, authUser.id, t);

    const scoreRows = await CandidateRelevancyScore.findAll({
      where: { jobId, tier },
      order: [['relevancyPercent', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      transaction: t,
    });
    const totalCount = await CandidateRelevancyScore.count({ where: { jobId, tier }, transaction: t });

    const results: BatchCandidateResponse[] = [];
    for (const scoreRow of scoreRows) {
      // Sequential per-candidate detail fetches, same discipline (and same
      // reason — one shared transaction, one pg connection) as
      // companyController.searchCandidates.
      const candidateId = scoreRow.candidateId;

      const candidateUser = await User.findByPk(candidateId, { transaction: t });
      const profile = await CandidateProfile.findOne({
        where: { userId: candidateId },
        include: [
          { model: RoleMaster, as: 'primaryRole' },
          { model: DomainMaster, as: 'domain' },
        ],
        transaction: t,
      });
      // A score row can outlive the profile becoming ineligible between
      // recomputes (e.g. paused via isActivelyLooking) — skip rather than
      // 500, the next recompute will clean the stale row up.
      if (!profile) continue;

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
      const unlock = await Unlock.findOne({
        where: { companyId: authUser.id, candidateId },
        transaction: t,
      });
      const isUnlockedByMe = !!unlock;

      results.push({
        id: candidateId,
        relevancyPercent: scoreRow.relevancyPercent,
        fullName: candidateUser?.fullName ?? null,
        category: plain.category,
        primaryRole: plain.primaryRole
          ? { id: plain.primaryRole.id, roleName: plain.primaryRole.roleName }
          : null,
        yearsOfExperience: plain.yearsOfExperience,
        secondaryRoles: secondaryRoleRows.map((row) => {
          const p = row.get({ plain: true }) as CandidateSecondaryRoleAttributes & {
            role: RoleMasterAttributes;
          };
          return { id: p.role.id, roleName: p.role.roleName };
        }),
        skills: skillRows.map((row) => {
          const p = row.get({ plain: true }) as CandidateSkillAttributes & {
            skill: SkillMasterAttributes;
          };
          return { id: p.skill.id, skillName: p.skill.skillName };
        }),
        domain: plain.domain ? { id: plain.domain.id, domainName: plain.domain.domainName } : null,
        location: plain.location,
        noticePeriod: plain.noticePeriod,
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

// ---------------------------------------------------------------------
// GET /companies/relevancy-packages/:packageId/download (Phase 3)
//
// Unlike browsing a batch above, a purchased package includes full contact
// details for every candidate in it regardless of individual Unlock rows —
// buying the package is the alternate route to that data the spec
// describes ("browse... using the normal unlock flow, OR buy the entire
// batch as a downloadable package"), not a second gate on top of unlock.
// ---------------------------------------------------------------------

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const downloadPackage = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { packageId } = req.params;

  const { rows, pkg } = await runInRequestContext(authUser, async (t) => {
    const pkg = await RelevancyPackage.findOne({
      where: { id: packageId, purchasedByCompanyId: authUser.id },
      transaction: t,
    });
    if (!pkg || !pkg.purchasedAt) {
      throw ApiError.notFound('Package not found or not yet purchased');
    }

    const scoreRows = await CandidateRelevancyScore.findAll({
      where: { jobId: pkg.jobId, tier: pkg.tier },
      order: [['relevancyPercent', 'DESC']],
      transaction: t,
    });

    const rows: (string | number)[][] = [];
    for (const scoreRow of scoreRows) {
      // Sequential per-candidate fetches — same discipline as
      // listBatchCandidates above.
      const candidateId = scoreRow.candidateId;
      const candidateUser = await User.findByPk(candidateId, { transaction: t });
      const profile = await CandidateProfile.findOne({
        where: { userId: candidateId },
        include: [
          { model: RoleMaster, as: 'primaryRole' },
          { model: DomainMaster, as: 'domain' },
        ],
        transaction: t,
      });
      if (!profile) continue;
      const plain = profile.get({ plain: true }) as CandidateProfileAttributes & {
        primaryRole: RoleMasterAttributes | null;
        domain: DomainMasterAttributes | null;
      };
      const skillRows = await CandidateSkill.findAll({
        where: { candidateId },
        include: [{ model: SkillMaster, as: 'skill' }],
        transaction: t,
      });
      const skillNames = skillRows
        .map((row) => (row.get({ plain: true }) as CandidateSkillAttributes & { skill: SkillMasterAttributes }).skill.skillName)
        .join('; ');

      rows.push([
        candidateUser?.fullName ?? '',
        candidateUser?.email ?? '',
        candidateUser?.phone ?? '',
        scoreRow.relevancyPercent,
        plain.primaryRole?.roleName ?? '',
        plain.yearsOfExperience ?? '',
        plain.domain?.domainName ?? '',
        skillNames,
        plain.location ?? '',
        plain.noticePeriod ?? '',
      ]);
    }

    // First-download timestamp only — the spec's schema has a singular
    // downloaded_at, not a log; re-downloading doesn't move it.
    if (!pkg.downloadedAt) {
      pkg.downloadedAt = new Date();
      await pkg.save({ transaction: t });
    }

    return { rows, pkg };
  });

  const header = [
    'Full Name',
    'Email',
    'Phone',
    'Relevancy %',
    'Primary Role',
    'Years Experience',
    'Domain',
    'Skills',
    'Location',
    'Notice Period',
  ];
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="relevancy-package-${pkg.id}.csv"`);
  res.send(csv);
});
