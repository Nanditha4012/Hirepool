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
