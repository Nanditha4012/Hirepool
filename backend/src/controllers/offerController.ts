import { Request, Response } from 'express';
import { Transaction } from 'sequelize';
import { z } from 'zod';
import { Job, JobApplication, Offer, JoiningFormality, ExternalApplicant, User, Notification } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { sendEmail } from '../utils/email';
import { offerSentEmail } from '../utils/emailTemplates';

/**
 * End-to-End ATS (Feature 2) — Phase 10: offer & joining, company side.
 * Candidate-facing accept/decline + document upload is
 * candidateOfferController.ts. Per the build plan: "Offer upload/generate,
 * candidate accept/decline, joining-formalities document checklist,
 * manual BGV status field (no live API)."
 */

async function loadOwnedApplication(jobId: string, applicationId: string, companyId: string, t: Transaction): Promise<{ job: Job; application: JobApplication }> {
  const job = await Job.findOne({ where: { id: jobId, companyId }, transaction: t });
  if (!job) throw ApiError.notFound('Job not found');
  const application = await JobApplication.findOne({ where: { id: applicationId, jobId }, transaction: t });
  if (!application) throw ApiError.notFound('Application not found');
  return { job, application };
}

// ---------------------------------------------------------------------
// POST /companies/jobs/:jobId/applications/:applicationId/offer
// ---------------------------------------------------------------------

const sendOfferSchema = z.object({
  offerLetterLink: z.string().trim().min(1),
});

export const sendOffer = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId, applicationId } = req.params;
  const body = sendOfferSchema.parse(req.body);

  const { offer, job, notifyTask } = await runInRequestContext(authUser, async (t) => {
    const { job, application } = await loadOwnedApplication(jobId, applicationId, authUser.id, t);

    const existing = await Offer.findOne({ where: { applicationId }, transaction: t });
    if (existing) throw ApiError.conflict('An offer has already been sent for this application');

    const offer = await Offer.create({ applicationId, offerLetterLink: body.offerLetterLink }, { transaction: t });

    let notifyTask:
      | { kind: 'verified'; userId: string; email: string; fullName: string | null }
      | { kind: 'external'; email: string; fullName: string | null }
      | null = null;

    if (application.source === 'internal' && application.candidateId) {
      const candidateUser = await User.findByPk(application.candidateId, { transaction: t });
      if (candidateUser) {
        await Notification.create(
          {
            userId: candidateUser.id,
            type: 'offer_sent',
            message: `You've received an offer for ${job.title}.`,
            link: '/candidate/applications',
          },
          { transaction: t },
        );
        notifyTask = { kind: 'verified', userId: candidateUser.id, email: candidateUser.email, fullName: candidateUser.fullName };
      }
    } else if (application.externalApplicantId) {
      const applicant = await ExternalApplicant.findByPk(application.externalApplicantId, { transaction: t });
      if (applicant) notifyTask = { kind: 'external', email: applicant.email, fullName: applicant.fullName };
    }

    return { offer, job, notifyTask };
  });

  if (notifyTask) {
    const { subject, html } = offerSentEmail(notifyTask.fullName ?? notifyTask.email, job.title, offer.offerLetterLink);
    await sendEmail({ to: notifyTask.email, subject, html });
  }

  res.status(201).json(offer);
});

// ---------------------------------------------------------------------
// GET /companies/jobs/:jobId/applications/:applicationId/offer
// ---------------------------------------------------------------------

export const getOffer = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId, applicationId } = req.params;

  const offer = await runInRequestContext(authUser, async (t) => {
    await loadOwnedApplication(jobId, applicationId, authUser.id, t);
    const row = await Offer.findOne({ where: { applicationId }, transaction: t });
    if (!row) throw ApiError.notFound('No offer sent for this application yet');
    return row;
  });

  res.json(offer);
});

// ---------------------------------------------------------------------
// GET /companies/jobs/:jobId/applications/:applicationId/joining
// ---------------------------------------------------------------------

export const getJoiningFormalities = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId, applicationId } = req.params;

  const row = await runInRequestContext(authUser, async (t) => {
    await loadOwnedApplication(jobId, applicationId, authUser.id, t);
    const existing = await JoiningFormality.findOne({ where: { applicationId }, transaction: t });
    if (!existing) throw ApiError.notFound('No joining formalities for this application yet');
    return existing;
  });

  res.json(row);
});

// ---------------------------------------------------------------------
// PATCH /companies/jobs/:jobId/applications/:applicationId/joining/bgv
// Manual BGV status field — no live API (spec, explicitly).
// ---------------------------------------------------------------------

const updateBgvSchema = z.object({
  bgvStatus: z.enum(['pending', 'in_progress', 'cleared', 'flagged']),
  bgvAgencyName: z.string().trim().optional(),
});

export const updateBgvStatus = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId, applicationId } = req.params;
  const body = updateBgvSchema.parse(req.body);

  const row = await runInRequestContext(authUser, async (t) => {
    await loadOwnedApplication(jobId, applicationId, authUser.id, t);
    const existing = await JoiningFormality.findOne({ where: { applicationId }, transaction: t });
    if (!existing) throw ApiError.notFound('No joining formalities for this application yet');
    existing.bgvStatus = body.bgvStatus;
    if (body.bgvAgencyName !== undefined) existing.bgvAgencyName = body.bgvAgencyName;
    existing.bgvUpdatedAt = new Date();
    await existing.save({ transaction: t });
    return existing;
  });

  res.json(row);
});
