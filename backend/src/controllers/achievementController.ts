import { Request, Response } from 'express';
import { z } from 'zod';
import { CandidateAchievement } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { markProfileNeedsReverification } from '../utils/reverification';

const listQuerySchema = z.object({
  type: z.enum(['project', 'research', 'achievement', 'certificate']).optional(),
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { type } = listQuerySchema.parse(req.query);

  const achievements = await runInRequestContext(authUser, (t) =>
    CandidateAchievement.findAll({
      where: { candidateId: authUser.id, ...(type ? { type } : {}) },
      order: [['createdAt', 'ASC']],
      transaction: t,
    }),
  );

  res.json(achievements);
});

const createSchema = z.object({
  type: z.enum(['project', 'research', 'achievement', 'certificate']),
  title: z.string().min(1),
  description: z.string().optional(),
  links: z.string().optional(),
  certificateOrProofLink: z.string().min(1),
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = createSchema.parse(req.body);

  const achievement = await runInRequestContext(authUser, async (t) => {
    const created = await CandidateAchievement.create(
      {
        candidateId: authUser.id,
        type: body.type,
        title: body.title,
        description: body.description ?? null,
        links: body.links ?? null,
        certificateOrProofLink: body.certificateOrProofLink,
        verificationStatus: 'pending',
      },
      { transaction: t },
    );

    // An approved candidate adding new work has to ask for it to be
    // re-verified — see utils/reverification.ts.
    await markProfileNeedsReverification(authUser.id, t);

    return created;
  });

  res.status(201).json(achievement);
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  links: z.string().optional(),
  certificateOrProofLink: z.string().min(1).optional(),
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = updateSchema.parse(req.body);

  const achievement = await runInRequestContext(authUser, async (t) => {
    const existing = await CandidateAchievement.findOne({
      where: { id, candidateId: authUser.id },
      transaction: t,
    });

    if (!existing) {
      throw ApiError.notFound('Achievement not found');
    }

    if (body.title !== undefined) existing.title = body.title;
    if (body.description !== undefined) existing.description = body.description;
    if (body.links !== undefined) existing.links = body.links;
    if (body.certificateOrProofLink !== undefined) {
      existing.certificateOrProofLink = body.certificateOrProofLink;
    }

    // Editing an entry invalidates whatever verdict it already had.
    existing.verificationStatus = 'pending';
    existing.rejectionReason = null;

    await existing.save({ transaction: t });
    await markProfileNeedsReverification(authUser.id, t);
    return existing;
  });

  res.json(achievement);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const existing = await CandidateAchievement.findOne({
      where: { id, candidateId: authUser.id },
      transaction: t,
    });

    if (!existing) {
      throw ApiError.notFound('Achievement not found');
    }

    if (existing.verificationStatus === 'verified') {
      throw ApiError.conflict('Verified entries cannot be deleted');
    }

    await existing.destroy({ transaction: t });
  });

  res.status(204).send();
});
