import { Request, Response } from 'express';
import { z } from 'zod';
import {
  RoleMaster,
  PlatformBadgeMaster,
  CompanyMaster,
  SkillMaster,
  DomainMaster,
  CompanyRequest,
  RejectionReasonMaster,
  SiteSetting,
  PlanMaster,
  RelevancyPackagePriceBand,
  ApplicationFormsMaster,
  McqMaster,
} from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { runInRequestContext } from '../utils/withRequestContext';

export const listRoles = asyncHandler(async (req: Request, res: Response) => {
  const roles = await runInRequestContext(null, (t) =>
    RoleMaster.findAll({ order: [['roleName', 'ASC']], transaction: t }),
  );
  res.json(roles);
});

export const listPlatformBadges = asyncHandler(async (req: Request, res: Response) => {
  const badges = await runInRequestContext(null, (t) =>
    PlatformBadgeMaster.findAll({
      order: [
        ['platformName', 'ASC'],
        ['sortOrder', 'ASC'],
      ],
      transaction: t,
    }),
  );
  res.json(badges);
});

export const listCompanies = asyncHandler(async (req: Request, res: Response) => {
  const companies = await runInRequestContext(null, (t) =>
    CompanyMaster.findAll({ order: [['companyName', 'ASC']], transaction: t }),
  );
  res.json(companies);
});

/**
 * Public plan catalog — companies need this to actually pick/switch a plan
 * before subscribing (paymentController.subscribe just takes a planId, it
 * doesn't offer a catalog itself). Only `isActive` plans are listed; RLS
 * (plans_master_select_all, from migrations/20240103000002) already permits
 * anonymous SELECT on the whole table, so `isActive` is filtered here at the
 * application layer rather than by policy — an inactive plan should still be
 * readable by admin tooling, just not offered to a company signing up.
 */
export const listPlans = asyncHandler(async (req: Request, res: Response) => {
  const plans = await runInRequestContext(null, (t) =>
    PlanMaster.findAll({ where: { isActive: true }, order: [['price', 'ASC']], transaction: t }),
  );
  res.json(plans);
});

export const listSkills = asyncHandler(async (req: Request, res: Response) => {
  const skills = await runInRequestContext(null, (t) =>
    SkillMaster.findAll({ order: [['skillName', 'ASC']], transaction: t }),
  );
  res.json(skills);
});

export const listDomains = asyncHandler(async (req: Request, res: Response) => {
  const domains = await runInRequestContext(null, (t) =>
    DomainMaster.findAll({ order: [['domainName', 'ASC']], transaction: t }),
  );
  res.json(domains);
});

const listRejectionReasonsSchema = z.object({
  scope: z.enum(['profile', 'item']).optional(),
});

export const listRejectionReasons = asyncHandler(async (req: Request, res: Response) => {
  const { scope } = listRejectionReasonsSchema.parse(req.query);

  const reasons = await runInRequestContext(null, (t) =>
    RejectionReasonMaster.findAll({
      where: scope ? { scope } : undefined,
      order: [['reasonText', 'ASC']],
      transaction: t,
    }),
  );
  res.json(reasons);
});

const requestCompanySchema = z.object({
  companyName: z.string().min(1),
});

export const requestCompany = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { companyName } = requestCompanySchema.parse(req.body);

  const request = await runInRequestContext(authUser, (t) =>
    CompanyRequest.create(
      { requestedBy: authUser.id, companyName, status: 'pending' },
      { transaction: t },
    ),
  );

  res.status(201).json(request);
});

/**
 * Public price catalog for AI relevancy packages — a company needs this to
 * see what a batch costs before buying it (Phase 3). Same "public SELECT,
 * admin-only write" shape as listPlans above.
 */
export const listRelevancyPriceBands = asyncHandler(async (req: Request, res: Response) => {
  const bands = await runInRequestContext(null, (t) =>
    RelevancyPackagePriceBand.findAll({ order: [['sortOrder', 'ASC']], transaction: t }),
  );
  res.json(bands);
});

/**
 * Field template for one of the three preset application forms (Simple /
 * Detailed / Foreign) — used by a company's careers-link setup UI to
 * preview a preset before choosing it. `custom` isn't queryable here; its
 * field list lives on the job itself (jobs.customFormSchema).
 */
const listApplicationFormFieldsSchema = z.object({
  formType: z.enum(['simple', 'detailed', 'foreign']),
});

export const listApplicationFormFields = asyncHandler(async (req: Request, res: Response) => {
  const { formType } = listApplicationFormFieldsSchema.parse(req.query);

  const fields = await runInRequestContext(null, (t) =>
    ApplicationFormsMaster.findAll({
      where: { formType },
      order: [['sortOrder', 'ASC']],
      transaction: t,
    }),
  );
  res.json(fields);
});

/**
 * The public/admin-curated MCQ bank (company_id IS NULL rows only) — lets a
 * company's round-question-picker UI browse it. `correctAnswer` is
 * included here since this is company/admin-facing, not candidate-facing;
 * candidateRoundController strips it before a candidate ever sees a
 * question.
 */
const listMcqBankSchema = z.object({
  conceptOrLanguage: z.string().trim().optional(),
});

export const listMcqBank = asyncHandler(async (req: Request, res: Response) => {
  const { conceptOrLanguage } = listMcqBankSchema.parse(req.query);

  const rows = await runInRequestContext(null, (t) =>
    McqMaster.findAll({
      where: { companyId: null, ...(conceptOrLanguage ? { conceptOrLanguage } : {}) },
      order: [['conceptOrLanguage', 'ASC']],
      transaction: t,
    }),
  );
  res.json(rows);
});

/**
 * Public, unauthenticated — the landing page / header reads this at runtime
 * for app_name/hero copy/FAQ/Boost price before any session exists. Backed
 * by site_settings' public `site_settings_select_all` RLS policy (see
 * migrations/20240106000001-phase5-admin-portal.js). Admin-side reads of the
 * same data go through GET /admin/site-settings instead — identical shape,
 * separate route because that one requires an admin session.
 */
export const getSiteSettings = asyncHandler(async (req: Request, res: Response) => {
  const rows = await runInRequestContext(null, (t) => SiteSetting.findAll({ transaction: t }));

  const result: Record<string, string | null> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }

  res.json(result);
});
