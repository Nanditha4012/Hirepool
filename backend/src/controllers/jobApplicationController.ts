import { Request, Response } from 'express';
import { Transaction, UniqueConstraintError } from 'sequelize';
import { z } from 'zod';
import {
  Job,
  JobApplication,
  ExternalApplicant,
  User,
  CompanyProfile,
  Unlock,
  Notification,
} from '../models';
import type { JobApplicationStatus } from '../models/JobApplication';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { sendEmail } from '../utils/email';
import { shortlistedVerifiedEmail, shortlistedExternalEmail } from '../utils/emailTemplates';

/**
 * End-to-End ATS (Feature 2) — Phase 7: applications, badges, shortlisting.
 * "Add to Job" (manual, one candidate) and "Shortlist" (bulk, from a
 * relevancy batch or the external applicant list) are the same underlying
 * operation here — both just add items to this endpoint's `items` array.
 */

async function loadOwnedJob(jobId: string, companyId: string, t: Transaction): Promise<Job> {
  const job = await Job.findOne({ where: { id: jobId, companyId }, transaction: t });
  if (!job) throw ApiError.notFound('Job not found');
  return job;
}

// ---------------------------------------------------------------------
// POST /companies/jobs/:jobId/applications — bulk shortlist / add to job
// ---------------------------------------------------------------------

const shortlistItemSchema = z.union([
  z.object({ source: z.literal('internal'), candidateId: z.string().uuid() }),
  z.object({ source: z.literal('external'), externalApplicantId: z.string().uuid() }),
]);

const bulkShortlistSchema = z.object({
  items: z.array(shortlistItemSchema).min(1).max(100),
});

type ShortlistItem = z.infer<typeof shortlistItemSchema>;
type ShortlistOutcome =
  | { item: ShortlistItem; status: 'created'; applicationId: string }
  | { item: ShortlistItem; status: 'already_shortlisted' }
  | { item: ShortlistItem; status: 'error'; message: string };

export const shortlistCandidates = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId } = req.params;
  const body = bulkShortlistSchema.parse(req.body);

  const { job, companyName, outcomes, notifyTasks } = await runInRequestContext(authUser, async (t) => {
    const job = await loadOwnedJob(jobId, authUser.id, t);
    const company = await CompanyProfile.findOne({ where: { userId: authUser.id }, transaction: t });
    const companyName = company?.companyName ?? 'A company';

    const outcomes: ShortlistOutcome[] = [];
    const notifyTasks: (
      | { kind: 'verified'; userId: string; email: string; fullName: string | null }
      | { kind: 'external'; email: string; fullName: string | null }
    )[] = [];

    // Sequential — shares transaction `t`, same discipline used throughout
    // this codebase's multi-item handlers (see companyController.searchCandidates
    // for the fuller rationale).
    for (const item of body.items) {
      try {
        if (item.source === 'internal') {
          const candidateUser = await User.findOne({
            where: { id: item.candidateId, role: 'candidate' },
            transaction: t,
          });
          if (!candidateUser) {
            outcomes.push({ item, status: 'error', message: 'Candidate not found' });
            continue;
          }

          const created = await JobApplication.create(
            {
              jobId: job.id,
              candidateId: item.candidateId,
              source: 'internal',
              verifiedBadge: true,
            },
            { transaction: t },
          );
          outcomes.push({ item, status: 'created', applicationId: created.id });
          notifyTasks.push({
            kind: 'verified',
            userId: candidateUser.id,
            email: candidateUser.email,
            fullName: candidateUser.fullName,
          });
        } else {
          const applicant = await ExternalApplicant.findOne({
            where: { id: item.externalApplicantId, jobId: job.id },
            transaction: t,
          });
          if (!applicant) {
            outcomes.push({ item, status: 'error', message: 'Applicant not found for this job' });
            continue;
          }

          const created = await JobApplication.create(
            {
              jobId: job.id,
              externalApplicantId: item.externalApplicantId,
              source: 'external',
              verifiedBadge: false,
            },
            { transaction: t },
          );
          outcomes.push({ item, status: 'created', applicationId: created.id });
          notifyTasks.push({ kind: 'external', email: applicant.email, fullName: applicant.fullName });
        }
      } catch (err) {
        if (err instanceof UniqueConstraintError) {
          outcomes.push({ item, status: 'already_shortlisted' });
          continue;
        }
        outcomes.push({ item, status: 'error', message: 'Failed to shortlist' });
      }
    }

    // In-app notifications are part of the same transaction as the
    // application rows they describe — unlike email, there's no reason to
    // delay a DB write to another DB write.
    for (const task of notifyTasks) {
      if (task.kind === 'verified') {
        await Notification.create(
          {
            userId: task.userId,
            type: 'shortlisted',
            message: `You've been shortlisted by ${companyName} for ${job.title}.`,
            link: '/candidate/applications',
          },
          { transaction: t },
        );
      }
    }

    return { job, companyName, outcomes, notifyTasks };
  });

  // Emails sent after the transaction commits — see the placement note on
  // paymentController's webhook handler for why (an email failure must
  // never roll back or block the shortlist itself; sendEmail never throws).
  for (const task of notifyTasks) {
    const { subject, html } =
      task.kind === 'verified'
        ? shortlistedVerifiedEmail(task.fullName ?? task.email, companyName, job.title)
        : shortlistedExternalEmail(task.fullName ?? task.email, companyName, job.title);
    await sendEmail({ to: task.email, subject, html });
  }

  res.status(201).json({ results: outcomes });
});

// ---------------------------------------------------------------------
// GET /companies/jobs/:jobId/applications
// ---------------------------------------------------------------------

interface ApplicationRow {
  id: string;
  source: 'internal' | 'external';
  verifiedBadge: boolean;
  status: JobApplicationStatus;
  shortlistedAt: Date;
  candidate: {
    id: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    isUnlockedByMe: boolean;
  } | null;
  externalApplicant: {
    id: string;
    fullName: string | null;
    email: string;
    formData: Record<string, unknown>;
    relevancyPercent: number | null;
  } | null;
}

export const listJobApplications = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId } = req.params;

  const response = await runInRequestContext(authUser, async (t) => {
    await loadOwnedJob(jobId, authUser.id, t);

    const rows = await JobApplication.findAll({
      where: { jobId },
      order: [['shortlistedAt', 'DESC']],
      transaction: t,
    });

    const results: ApplicationRow[] = [];
    for (const row of rows) {
      let candidate: ApplicationRow['candidate'] = null;
      let externalApplicant: ApplicationRow['externalApplicant'] = null;

      if (row.source === 'internal' && row.candidateId) {
        // Contact info stays behind the existing Unlock gate — shortlisting
        // is a pipeline/tracking action, not a paid unlock, so it doesn't
        // bypass the same monetization boundary /search and the relevancy
        // batches already respect.
        const candidateUser = await User.findByPk(row.candidateId, { transaction: t });
        const unlock = await Unlock.findOne({
          where: { companyId: authUser.id, candidateId: row.candidateId },
          transaction: t,
        });
        const isUnlockedByMe = !!unlock;
        candidate = {
          id: row.candidateId,
          fullName: candidateUser?.fullName ?? null,
          email: isUnlockedByMe ? candidateUser?.email ?? null : null,
          phone: isUnlockedByMe ? candidateUser?.phone ?? null : null,
          isUnlockedByMe,
        };
      } else if (row.source === 'external' && row.externalApplicantId) {
        // No unlock concept for an external applicant — they gave their
        // contact details directly to this company by applying.
        const applicant = await ExternalApplicant.findByPk(row.externalApplicantId, { transaction: t });
        if (applicant) {
          externalApplicant = {
            id: applicant.id,
            fullName: applicant.fullName,
            email: applicant.email,
            formData: applicant.formData,
            relevancyPercent: applicant.relevancyPercent,
          };
        }
      }

      results.push({
        id: row.id,
        source: row.source,
        verifiedBadge: row.verifiedBadge,
        status: row.status,
        shortlistedAt: row.shortlistedAt,
        candidate,
        externalApplicant,
      });
    }

    return results;
  });

  res.json(response);
});

// ---------------------------------------------------------------------
// PATCH /companies/jobs/:jobId/applications/:applicationId
// ---------------------------------------------------------------------

const updateApplicationSchema = z.object({
  status: z.enum(['shortlisted', 'rejected']),
});

export const updateJobApplication = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId, applicationId } = req.params;
  const body = updateApplicationSchema.parse(req.body);

  const application = await runInRequestContext(authUser, async (t) => {
    await loadOwnedJob(jobId, authUser.id, t);
    const existing = await JobApplication.findOne({ where: { id: applicationId, jobId }, transaction: t });
    if (!existing) throw ApiError.notFound('Application not found');
    existing.status = body.status;
    existing.updatedAt = new Date();
    await existing.save({ transaction: t });
    return existing;
  });

  res.json(application);
});
