import { Request, Response } from 'express';
import { Transaction } from 'sequelize';
import { z } from 'zod';
import { Job, JobRound, JobApplication, InterviewSession, ExternalApplicant, User, Notification } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { generateJitsiMeetingLink } from '../utils/jitsi';
import { sendEmail } from '../utils/email';
import { interviewScheduledEmail } from '../utils/emailTemplates';

/**
 * End-to-End ATS (Feature 2) — Phase 9: interview round. Per the build
 * plan: Jitsi room-link generation + a scheduling endpoint. The manual
 * Pass/Fail/Hold + score + notes decision (any round type, including
 * interview) is jobRoundController.decideRound, already built in Phase 8
 * — nothing new needed for that part.
 */

async function loadOwnedApplicationAndRound(
  jobId: string,
  roundId: string,
  applicationId: string,
  companyId: string,
  t: Transaction,
): Promise<{ job: Job; round: JobRound; application: JobApplication }> {
  const job = await Job.findOne({ where: { id: jobId, companyId }, transaction: t });
  if (!job) throw ApiError.notFound('Job not found');
  const round = await JobRound.findOne({ where: { id: roundId, jobId }, transaction: t });
  if (!round) throw ApiError.notFound('Round not found');
  const application = await JobApplication.findOne({ where: { id: applicationId, jobId }, transaction: t });
  if (!application) throw ApiError.notFound('Application not found');
  return { job, round, application };
}

// ---------------------------------------------------------------------
// POST /companies/jobs/:jobId/rounds/:roundId/applications/:applicationId/interview
// ---------------------------------------------------------------------

const scheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
});

export const scheduleInterview = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId, roundId, applicationId } = req.params;
  const body = scheduleSchema.parse(req.body);

  const { session, job, round, notifyTask } = await runInRequestContext(authUser, async (t) => {
    const { job, round, application } = await loadOwnedApplicationAndRound(jobId, roundId, applicationId, authUser.id, t);

    const existing = await InterviewSession.findOne({ where: { applicationId, roundId }, transaction: t });
    if (existing) throw ApiError.conflict('An interview is already scheduled for this round');

    const session = await InterviewSession.create(
      { applicationId, roundId, meetingLink: generateJitsiMeetingLink(), scheduledAt: new Date(body.scheduledAt) },
      { transaction: t },
    );

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
            type: 'interview_scheduled',
            message: `Your ${round.roundName} for ${job.title} is scheduled.`,
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

    return { session, job, round, notifyTask };
  });

  if (notifyTask) {
    const { subject, html } = interviewScheduledEmail(
      notifyTask.fullName ?? notifyTask.email,
      job.title,
      round.roundName,
      session.scheduledAt,
      session.meetingLink,
    );
    await sendEmail({ to: notifyTask.email, subject, html });
  }

  res.status(201).json(session);
});

// ---------------------------------------------------------------------
// GET /companies/jobs/:jobId/rounds/:roundId/applications/:applicationId/interview
// ---------------------------------------------------------------------

export const getInterview = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId, roundId, applicationId } = req.params;

  const session = await runInRequestContext(authUser, async (t) => {
    await loadOwnedApplicationAndRound(jobId, roundId, applicationId, authUser.id, t);
    const row = await InterviewSession.findOne({ where: { applicationId, roundId }, transaction: t });
    if (!row) throw ApiError.notFound('No interview scheduled for this round yet');
    return row;
  });

  res.json(session);
});

// ---------------------------------------------------------------------
// GET /candidates/applications/:applicationId/rounds/:roundId/interview
// ---------------------------------------------------------------------

export const getMyInterview = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { applicationId, roundId } = req.params;

  const session = await runInRequestContext(authUser, async (t) => {
    const application = await JobApplication.findOne({
      where: { id: applicationId, candidateId: authUser.id },
      transaction: t,
    });
    if (!application) throw ApiError.notFound('Application not found');
    const row = await InterviewSession.findOne({ where: { applicationId, roundId }, transaction: t });
    if (!row) throw ApiError.notFound('No interview scheduled for this round yet');
    return row;
  });

  res.json(session);
});
