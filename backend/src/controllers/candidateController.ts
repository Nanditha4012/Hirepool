import { Request, Response } from 'express';
import { z } from 'zod';
import { CandidateProfile } from '../models';
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
