import { Request, Response } from 'express';
import { z } from 'zod';
import { CandidatePlatformBadge } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const badges = await runInRequestContext(authUser, (t) =>
    CandidatePlatformBadge.findAll({
      where: { candidateId: authUser.id },
      order: [['createdAt', 'ASC']],
      transaction: t,
    }),
  );

  res.json(badges);
});

const createSchema = z.object({
  platformName: z.string().min(1),
  badgeSelected: z.string().min(1),
  platformProfileLink: z.string().min(1),
  totalQuestionsSolved: z.number().int().optional(),
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = createSchema.parse(req.body);

  const badge = await runInRequestContext(authUser, (t) =>
    CandidatePlatformBadge.create(
      {
        candidateId: authUser.id,
        platformName: body.platformName,
        badgeSelected: body.badgeSelected,
        platformProfileLink: body.platformProfileLink,
        totalQuestionsSolved: body.totalQuestionsSolved ?? 0,
        verificationStatus: 'pending',
      },
      { transaction: t },
    ),
  );

  res.status(201).json(badge);
});

const updateSchema = z.object({
  badgeSelected: z.string().min(1).optional(),
  platformProfileLink: z.string().min(1).optional(),
  totalQuestionsSolved: z.number().int().optional(),
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = updateSchema.parse(req.body);

  const badge = await runInRequestContext(authUser, async (t) => {
    // RLS already scopes this to rows owned by the acting candidate; the
    // explicit candidateId in the where clause is defensive/defense-in-depth.
    const existing = await CandidatePlatformBadge.findOne({
      where: { id, candidateId: authUser.id },
      transaction: t,
    });

    if (!existing) {
      throw ApiError.notFound('Platform badge not found');
    }

    if (body.badgeSelected !== undefined) existing.badgeSelected = body.badgeSelected;
    if (body.platformProfileLink !== undefined) existing.platformProfileLink = body.platformProfileLink;
    if (body.totalQuestionsSolved !== undefined) existing.totalQuestionsSolved = body.totalQuestionsSolved;

    existing.verificationStatus = 'pending';
    existing.rejectionReason = null;

    await existing.save({ transaction: t });
    return existing;
  });

  res.json(badge);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const existing = await CandidatePlatformBadge.findOne({
      where: { id, candidateId: authUser.id },
      transaction: t,
    });

    if (!existing) {
      throw ApiError.notFound('Platform badge not found');
    }

    await existing.destroy({ transaction: t });
  });

  res.status(204).send();
});
