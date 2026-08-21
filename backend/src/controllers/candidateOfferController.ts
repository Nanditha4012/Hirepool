import { Request, Response } from 'express';
import { Transaction } from 'sequelize';
import { z } from 'zod';
import { JobApplication, Offer, JoiningFormality } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';

/**
 * End-to-End ATS (Feature 2) — Phase 10: offer & joining, candidate side.
 * "candidate accept/decline, joining-formalities document checklist" per
 * the build plan.
 */

async function loadOwnApplication(applicationId: string, candidateId: string, t: Transaction): Promise<JobApplication> {
  const application = await JobApplication.findOne({ where: { id: applicationId, candidateId }, transaction: t });
  if (!application) throw ApiError.notFound('Application not found');
  return application;
}

// ---------------------------------------------------------------------
// GET /candidates/applications/:applicationId/offer
// ---------------------------------------------------------------------

export const getMyOffer = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { applicationId } = req.params;

  const offer = await runInRequestContext(authUser, async (t) => {
    await loadOwnApplication(applicationId, authUser.id, t);
    const row = await Offer.findOne({ where: { applicationId }, transaction: t });
    if (!row) throw ApiError.notFound('No offer for this application yet');
    return row;
  });

  res.json(offer);
});

// ---------------------------------------------------------------------
// POST /candidates/applications/:applicationId/offer/respond
// ---------------------------------------------------------------------

const respondSchema = z.object({
  response: z.enum(['accepted', 'declined']),
});

export const respondToOffer = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { applicationId } = req.params;
  const body = respondSchema.parse(req.body);

  const offer = await runInRequestContext(authUser, async (t) => {
    await loadOwnApplication(applicationId, authUser.id, t);
    const existing = await Offer.findOne({ where: { applicationId }, transaction: t });
    if (!existing) throw ApiError.notFound('No offer for this application yet');
    if (existing.status !== 'sent') {
      throw ApiError.conflict('This offer has already been responded to');
    }

    existing.status = body.response;
    existing.respondedAt = new Date();
    await existing.save({ transaction: t });

    // On acceptance, the joining-formalities checklist opens (spec).
    if (body.response === 'accepted') {
      await JoiningFormality.findOrCreate({
        where: { applicationId },
        defaults: { applicationId },
        transaction: t,
      });
    }

    return existing;
  });

  res.json(offer);
});

// ---------------------------------------------------------------------
// GET /candidates/applications/:applicationId/joining
// ---------------------------------------------------------------------

export const getMyJoiningFormalities = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { applicationId } = req.params;

  const row = await runInRequestContext(authUser, async (t) => {
    await loadOwnApplication(applicationId, authUser.id, t);
    const existing = await JoiningFormality.findOne({ where: { applicationId }, transaction: t });
    if (!existing) throw ApiError.notFound('No joining formalities for this application yet');
    return existing;
  });

  res.json(row);
});

// ---------------------------------------------------------------------
// PATCH /candidates/applications/:applicationId/joining/documents
// ---------------------------------------------------------------------

const documentsSchema = z.object({
  documents: z.array(z.object({ docType: z.string().trim().min(1), link: z.string().trim().min(1) })),
});

export const uploadJoiningDocuments = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { applicationId } = req.params;
  const body = documentsSchema.parse(req.body);

  const row = await runInRequestContext(authUser, async (t) => {
    await loadOwnApplication(applicationId, authUser.id, t);
    const existing = await JoiningFormality.findOne({ where: { applicationId }, transaction: t });
    if (!existing) {
      throw ApiError.notFound('Accept the offer first — the joining-formalities checklist opens on acceptance');
    }
    existing.documents = body.documents;
    await existing.save({ transaction: t });
    return existing;
  });

  res.json(row);
});
