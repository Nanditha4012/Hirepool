import { Request, Response } from 'express';
import { RoleMaster, PlatformBadgeMaster, CompanyMaster } from '../models';
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
