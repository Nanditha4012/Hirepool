import { Request, Response } from 'express';
import { z } from 'zod';
import { CandidateEducation, CandidateVerificationDocument } from '../models';
import { EDUCATION_LEVEL_ORDER, type EducationLevel } from '../models/CandidateEducation';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { markProfileNeedsReverification } from '../utils/reverification';

/**
 * The candidate's own education entries. Shaped after achievementController —
 * same list/create/update/remove verbs, same "editing invalidates the verdict"
 * rule, same re-verification trigger — because they are the same kind of
 * thing from the candidate's point of view: a claim with proof attached that
 * someone has to agree with before a company sees it.
 */

const EDUCATION_LEVELS = [
  'tenth',
  'twelfth',
  'diploma',
  'undergraduate',
  'postgraduate',
  'doctorate',
] as const;

/**
 * All numeric, because `scoreValue` is. A letter-grade board (some ICSE and
 * international boards) has no honest number to put here, so those candidates
 * leave the score blank and the marks card carries the claim instead.
 */
const SCORE_TYPES = ['percentage', 'cgpa_10', 'cgpa_4', 'gpa_4'] as const;

/**
 * A sanity window, not a validation of the candidate's biography. Anything
 * outside it is a typo (1090 for 1990) rather than an unusual career.
 */
const MIN_YEAR = 1950;
const MAX_YEAR = new Date().getFullYear() + 10;

const yearSchema = z.number().int().min(MIN_YEAR).max(MAX_YEAR);

const baseEducationShape = {
  level: z.enum(EDUCATION_LEVELS),
  institution: z.string().min(1).max(255),
  boardOrUniversity: z.string().max(255).optional().nullable(),
  degree: z.string().max(255).optional().nullable(),
  branch: z.string().max(255).optional().nullable(),
  startYear: yearSchema.optional().nullable(),
  endYear: yearSchema.optional().nullable(),
  isOngoing: z.boolean().optional(),
  scoreValue: z.number().min(0).max(100).optional().nullable(),
  scoreType: z.enum(SCORE_TYPES).optional().nullable(),
  marksCardLink: z.string().max(500).optional().nullable(),
};

const createSchema = z.object(baseEducationShape).superRefine(checkYearOrder);
const updateSchema = z
  .object({
    ...baseEducationShape,
    level: z.enum(EDUCATION_LEVELS).optional(),
    institution: z.string().min(1).max(255).optional(),
  })
  .superRefine(checkYearOrder);

/**
 * Rejects an end year before the start year.
 *
 * Worth catching here rather than leaving to the reviewer: "2019 – 2015" is
 * almost always two fields filled in the wrong boxes, and a candidate would
 * rather be told at the keystroke than wait days to be sent back for it.
 */
function checkYearOrder(
  value: { startYear?: number | null; endYear?: number | null },
  ctx: z.RefinementCtx,
): void {
  if (
    value.startYear != null &&
    value.endYear != null &&
    value.endYear < value.startYear
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endYear'],
      message: 'End year cannot be before start year',
    });
  }
}

/**
 * Oldest qualification first — 10th, then 12th, then the degree.
 *
 * Ordered by level rather than by year because years are optional and a
 * candidate mid-degree has no end year at all; sorting on a null would
 * scatter the list. Ties (two degrees at the same level) fall back to the
 * end year, then to insertion order.
 */
function byAcademicOrder(a: CandidateEducation, b: CandidateEducation): number {
  const levelDelta =
    EDUCATION_LEVEL_ORDER[a.level as EducationLevel] -
    EDUCATION_LEVEL_ORDER[b.level as EducationLevel];
  if (levelDelta !== 0) return levelDelta;
  return (a.endYear ?? 0) - (b.endYear ?? 0);
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const rows = await runInRequestContext(authUser, (t) =>
    CandidateEducation.findAll({
      where: { candidateId: authUser.id },
      order: [['createdAt', 'ASC']],
      transaction: t,
    }),
  );

  res.json([...rows].sort(byAcademicOrder));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = createSchema.parse(req.body);

  const created = await runInRequestContext(authUser, async (t) => {
    // One row per level, so a candidate can't list three different 12th
    // standards. Degrees are exempt: a second undergraduate or postgraduate
    // qualification is a real thing people have.
    if (body.level === 'tenth' || body.level === 'twelfth') {
      const existing = await CandidateEducation.findOne({
        where: { candidateId: authUser.id, level: body.level },
        transaction: t,
      });
      if (existing) {
        throw ApiError.conflict(
          `You already have a ${body.level === 'tenth' ? '10th' : '12th'} entry — edit that one instead.`,
        );
      }
    }

    const row = await CandidateEducation.create(
      {
        candidateId: authUser.id,
        level: body.level,
        institution: body.institution,
        boardOrUniversity: body.boardOrUniversity ?? null,
        degree: body.degree ?? null,
        branch: body.branch ?? null,
        startYear: body.startYear ?? null,
        // An ongoing course has no end year by definition; accepting one
        // would let the two fields contradict each other on the profile.
        endYear: body.isOngoing ? null : body.endYear ?? null,
        isOngoing: body.isOngoing ?? false,
        scoreValue: body.scoreValue ?? null,
        scoreType: body.scoreType ?? null,
        marksCardLink: body.marksCardLink ?? null,
        verificationStatus: 'pending',
      },
      { transaction: t },
    );

    await markProfileNeedsReverification(authUser.id, t);
    return row;
  });

  res.status(201).json(created);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = updateSchema.parse(req.body);

  const updated = await runInRequestContext(authUser, async (t) => {
    const existing = await CandidateEducation.findOne({
      where: { id, candidateId: authUser.id },
      transaction: t,
    });
    if (!existing) throw ApiError.notFound('Education entry not found');

    if (body.level !== undefined) existing.level = body.level;
    if (body.institution !== undefined) existing.institution = body.institution;
    if (body.boardOrUniversity !== undefined) {
      existing.boardOrUniversity = body.boardOrUniversity ?? null;
    }
    if (body.degree !== undefined) existing.degree = body.degree ?? null;
    if (body.branch !== undefined) existing.branch = body.branch ?? null;
    if (body.startYear !== undefined) existing.startYear = body.startYear ?? null;
    if (body.endYear !== undefined) existing.endYear = body.endYear ?? null;
    if (body.isOngoing !== undefined) {
      existing.isOngoing = body.isOngoing;
      if (body.isOngoing) existing.endYear = null;
    }
    if (body.scoreValue !== undefined) existing.scoreValue = body.scoreValue ?? null;
    if (body.scoreType !== undefined) existing.scoreType = body.scoreType ?? null;
    if (body.marksCardLink !== undefined) existing.marksCardLink = body.marksCardLink ?? null;

    // Same rule as achievementController.update: changing what was claimed
    // invalidates the verdict on it, whether that verdict came from a
    // verifier or from the document reader.
    existing.verificationStatus = 'pending';
    existing.rejectionReason = null;
    existing.updatedAt = new Date();

    await existing.save({ transaction: t });

    // Any auto-verification that was based on the old values is now about a
    // claim that no longer exists. Dropped rather than left to look like it
    // still corroborates something.
    await CandidateVerificationDocument.destroy({
      where: { candidateId: authUser.id, educationId: existing.id },
      transaction: t,
    });

    await markProfileNeedsReverification(authUser.id, t);
    return existing;
  });

  res.json(updated);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const existing = await CandidateEducation.findOne({
      where: { id, candidateId: authUser.id },
      transaction: t,
    });
    if (!existing) throw ApiError.notFound('Education entry not found');

    // Mirrors achievementController.remove: once a human has agreed a
    // qualification is real, the candidate cannot quietly delete it and
    // resubmit a different one. `auto_verified` is deliberately NOT covered —
    // a machine verdict is not a human one, and the candidate must be able
    // to correct a bad OCR match themselves.
    if (existing.verificationStatus === 'verified') {
      throw ApiError.conflict(
        'Verified education cannot be deleted. Contact support if this entry is wrong.',
      );
    }

    await existing.destroy({ transaction: t });
    await markProfileNeedsReverification(authUser.id, t);
  });

  res.status(204).send();
});
