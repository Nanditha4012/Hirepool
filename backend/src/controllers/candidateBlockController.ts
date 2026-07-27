import { Request, Response } from 'express';
import { z } from 'zod';
import { CompanyBlock } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { runInRequestContext } from '../utils/withRequestContext';

const blockSchema = z.object({ reason: z.string().optional() });

// ---------------------------------------------------------------------
// POST /me/blocks/:companyId
// ---------------------------------------------------------------------

export const blockCompany = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { companyId } = req.params;
  const { reason } = blockSchema.parse(req.body ?? {});

  const block = await runInRequestContext(authUser, async (t) => {
    // Idempotent on the (company_id, candidate_id) unique constraint — if a
    // block already exists, just return it rather than erroring.
    const existing = await CompanyBlock.findOne({
      where: { candidateId: authUser.id, companyId },
      transaction: t,
    });
    if (existing) {
      return existing;
    }

    return CompanyBlock.create(
      { candidateId: authUser.id, companyId, reason: reason ?? null },
      { transaction: t },
    );
  });

  res.status(201).json(block);
});
