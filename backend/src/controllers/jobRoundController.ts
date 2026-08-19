import { Request, Response } from 'express';
import { Transaction } from 'sequelize';
import { z } from 'zod';
import {
  Job,
  JobRound,
  JobRoundQuestion,
  JobRoundResult,
  JobApplication,
  ExternalApplicant,
  User,
  CompanyProfile,
  Notification,
  CustomCodingQuestion,
  McqMaster,
  ContestQuestion,
} from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { sendEmail } from '../utils/email';
import { roundResultUpdatedEmail } from '../utils/emailTemplates';

/**
 * End-to-End ATS (Feature 2) — Phase 8: company-side round/question
 * management. Candidate-facing round-taking lives in
 * candidateRoundController.ts — distinct audience, distinct trust boundary
 * (hidden test cases / correct answers must never reach that file's
 * responses).
 */

async function loadOwnedJob(jobId: string, companyId: string, t: Transaction): Promise<Job> {
  const job = await Job.findOne({ where: { id: jobId, companyId }, transaction: t });
  if (!job) throw ApiError.notFound('Job not found');
  return job;
}

async function loadOwnedRound(jobId: string, roundId: string, companyId: string, t: Transaction): Promise<JobRound> {
  await loadOwnedJob(jobId, companyId, t);
  const round = await JobRound.findOne({ where: { id: roundId, jobId }, transaction: t });
  if (!round) throw ApiError.notFound('Round not found');
  return round;
}

// ---------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------

/** Spec's suggested default — Shortlisted/Offer/Joining are pipeline
 * bookends (job_applications.status and, later, the offers/joining_formalities
 * tables), not job_rounds rows; only the customizable middle rounds are. */
const DEFAULT_TEMPLATE: { roundName: string; roundType: 'coding' | 'interview' }[] = [
  { roundName: 'Coding Round', roundType: 'coding' },
  { roundName: 'Interview Round', roundType: 'interview' },
];

export const seedDefaultRounds = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId } = req.params;

  const rounds = await runInRequestContext(authUser, async (t) => {
    await loadOwnedJob(jobId, authUser.id, t);
    const existing = await JobRound.count({ where: { jobId }, transaction: t });
    if (existing > 0) {
      throw ApiError.conflict('This job already has rounds — remove them first to reseed the default template');
    }

    const created: JobRound[] = [];
    for (let i = 0; i < DEFAULT_TEMPLATE.length; i += 1) {
      const round = await JobRound.create(
        { jobId, roundName: DEFAULT_TEMPLATE[i].roundName, roundType: DEFAULT_TEMPLATE[i].roundType, roundOrder: i + 1 },
        { transaction: t },
      );
      created.push(round);
    }
    return created;
  });

  res.status(201).json(rounds);
});

export const listRounds = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId } = req.params;

  const rounds = await runInRequestContext(authUser, async (t) => {
    await loadOwnedJob(jobId, authUser.id, t);
    return JobRound.findAll({ where: { jobId }, order: [['roundOrder', 'ASC']], transaction: t });
  });

  res.json(rounds);
});

const createRoundSchema = z.object({
  roundName: z.string().trim().min(1),
  roundType: z.enum(['coding', 'mcq', 'interview', 'custom']),
  roundOrder: z.number().int().optional(),
});

export const createRound = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId } = req.params;
  const body = createRoundSchema.parse(req.body);

  const round = await runInRequestContext(authUser, async (t) => {
    await loadOwnedJob(jobId, authUser.id, t);
    const maxOrder = await JobRound.max<number, JobRound>('roundOrder', { where: { jobId }, transaction: t });
    return JobRound.create(
      {
        jobId,
        roundName: body.roundName,
        roundType: body.roundType,
        roundOrder: body.roundOrder ?? (Number(maxOrder) || 0) + 1,
      },
      { transaction: t },
    );
  });

  res.status(201).json(round);
});

const updateRoundSchema = z.object({
  roundName: z.string().trim().min(1).optional(),
  roundType: z.enum(['coding', 'mcq', 'interview', 'custom']).optional(),
  roundOrder: z.number().int().optional(),
});

export const updateRound = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId, roundId } = req.params;
  const body = updateRoundSchema.parse(req.body);

  const round = await runInRequestContext(authUser, async (t) => {
    const existing = await loadOwnedRound(jobId, roundId, authUser.id, t);
    if (body.roundName !== undefined) existing.roundName = body.roundName;
    if (body.roundType !== undefined) existing.roundType = body.roundType;
    if (body.roundOrder !== undefined) existing.roundOrder = body.roundOrder;
    existing.updatedAt = new Date();
    await existing.save({ transaction: t });
    return existing;
  });

  res.json(round);
});

export const deleteRound = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId, roundId } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const existing = await loadOwnedRound(jobId, roundId, authUser.id, t);
    await existing.destroy({ transaction: t });
  });

  res.status(204).send();
});

// ---------------------------------------------------------------------
// Round questions (attach/detach)
// ---------------------------------------------------------------------

const attachQuestionSchema = z.object({
  questionSource: z.enum(['contest_question', 'custom_coding_question', 'mcq_master']),
  questionId: z.string().uuid(),
  points: z.number().int().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

export const listRoundQuestions = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId, roundId } = req.params;

  const rows = await runInRequestContext(authUser, async (t) => {
    await loadOwnedRound(jobId, roundId, authUser.id, t);
    return JobRoundQuestion.findAll({ where: { roundId }, order: [['sortOrder', 'ASC']], transaction: t });
  });

  res.json(rows);
});

export const attachQuestion = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId, roundId } = req.params;
  const body = attachQuestionSchema.parse(req.body);

  const link = await runInRequestContext(authUser, async (t) => {
    await loadOwnedRound(jobId, roundId, authUser.id, t);

    // Ownership/existence check per source — a company may only attach a
    // published contest question, its own custom coding question, or a
    // public/its-own MCQ. RLS already scopes reads for company/candidate
    // roles, but this is a write path picking an id the caller supplied,
    // so it's verified explicitly rather than trusted.
    if (body.questionSource === 'contest_question') {
      const q = await ContestQuestion.findOne({ where: { id: body.questionId, type: 'coding' }, transaction: t });
      if (!q) throw ApiError.badRequest('Coding question not found in the master dataset');
    } else if (body.questionSource === 'custom_coding_question') {
      const q = await CustomCodingQuestion.findOne({
        where: { id: body.questionId, companyId: authUser.id },
        transaction: t,
      });
      if (!q) throw ApiError.badRequest('Custom coding question not found');
    } else {
      const q = await McqMaster.findByPk(body.questionId, { transaction: t });
      if (!q || (q.companyId !== null && q.companyId !== authUser.id)) {
        throw ApiError.badRequest('MCQ not found');
      }
    }

    return JobRoundQuestion.create(
      {
        roundId,
        questionSource: body.questionSource,
        questionId: body.questionId,
        points: body.points ?? 1,
        sortOrder: body.sortOrder ?? 0,
      },
      { transaction: t },
    );
  });

  res.status(201).json(link);
});

export const detachQuestion = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId, roundId, linkId } = req.params;

  await runInRequestContext(authUser, async (t) => {
    await loadOwnedRound(jobId, roundId, authUser.id, t);
    const link = await JobRoundQuestion.findOne({ where: { id: linkId, roundId }, transaction: t });
    if (!link) throw ApiError.notFound('Question is not attached to this round');
    await link.destroy({ transaction: t });
  });

  res.status(204).send();
});

// ---------------------------------------------------------------------
// Custom coding questions (company's own bank, optionally job-scoped)
// ---------------------------------------------------------------------

const testCaseSchema = z.object({
  stdin: z.string(),
  expectedOutput: z.string(),
  explanation: z.string().optional(),
});
const hiddenTestCaseSchema = z.object({ stdin: z.string(), expectedOutput: z.string() });

const codingQuestionSchema = z.object({
  jobId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  functionSignature: z.object({
    parameters: z.array(z.object({ name: z.string(), type: z.string() })),
    returnType: z.string(),
  }),
  starterCode: z.record(z.string(), z.string()).optional(),
  sampleTestCases: z.array(testCaseSchema).optional(),
  hiddenTestCases: z.array(hiddenTestCaseSchema).optional(),
  languageSupport: z.array(z.string()).min(1),
  isSql: z.boolean().optional(),
});

export const listCodingQuestions = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const rows = await runInRequestContext(authUser, (t) =>
    CustomCodingQuestion.findAll({ where: { companyId: authUser.id }, order: [['createdAt', 'DESC']], transaction: t }),
  );
  res.json(rows);
});

export const createCodingQuestion = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = codingQuestionSchema.parse(req.body);

  const created = await runInRequestContext(authUser, async (t) => {
    if (body.jobId) await loadOwnedJob(body.jobId, authUser.id, t);
    return CustomCodingQuestion.create(
      {
        companyId: authUser.id,
        jobId: body.jobId ?? null,
        title: body.title,
        description: body.description,
        functionSignature: body.functionSignature,
        starterCode: body.starterCode ?? {},
        sampleTestCases: body.sampleTestCases ?? [],
        hiddenTestCases: body.hiddenTestCases ?? [],
        languageSupport: body.languageSupport,
        isSql: body.isSql ?? false,
      },
      { transaction: t },
    );
  });

  res.status(201).json(created);
});

export const updateCodingQuestion = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;
  const body = codingQuestionSchema.partial().parse(req.body);

  const updated = await runInRequestContext(authUser, async (t) => {
    const existing = await CustomCodingQuestion.findOne({ where: { id, companyId: authUser.id }, transaction: t });
    if (!existing) throw ApiError.notFound('Coding question not found');
    Object.assign(existing, {
      ...(body.jobId !== undefined ? { jobId: body.jobId } : {}),
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.functionSignature !== undefined ? { functionSignature: body.functionSignature } : {}),
      ...(body.starterCode !== undefined ? { starterCode: body.starterCode } : {}),
      ...(body.sampleTestCases !== undefined ? { sampleTestCases: body.sampleTestCases } : {}),
      ...(body.hiddenTestCases !== undefined ? { hiddenTestCases: body.hiddenTestCases } : {}),
      ...(body.languageSupport !== undefined ? { languageSupport: body.languageSupport } : {}),
      ...(body.isSql !== undefined ? { isSql: body.isSql } : {}),
    });
    existing.updatedAt = new Date();
    await existing.save({ transaction: t });
    return existing;
  });

  res.json(updated);
});

export const deleteCodingQuestion = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const existing = await CustomCodingQuestion.findOne({ where: { id, companyId: authUser.id }, transaction: t });
    if (!existing) throw ApiError.notFound('Coding question not found');
    await existing.destroy({ transaction: t });
  });

  res.status(204).send();
});

// ---------------------------------------------------------------------
// Company's own MCQs (job-scoped custom entries — the public bank is
// admin-managed, see adminController's mcq_master CRUD)
// ---------------------------------------------------------------------

const mcqSchema = z.object({
  jobId: z.string().uuid().nullable().optional(),
  conceptOrLanguage: z.string().trim().min(1),
  question: z.string().trim().min(1),
  options: z.array(z.string()).min(2),
  correctAnswer: z.number().int().min(0),
});

export const listMyMcqs = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const rows = await runInRequestContext(authUser, (t) =>
    McqMaster.findAll({ where: { companyId: authUser.id }, order: [['createdAt', 'DESC']], transaction: t }),
  );
  res.json(rows);
});

export const createMcq = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = mcqSchema.parse(req.body);
  if (body.correctAnswer >= body.options.length) {
    throw ApiError.badRequest('correctAnswer must be a valid index into options');
  }

  const created = await runInRequestContext(authUser, async (t) => {
    if (body.jobId) await loadOwnedJob(body.jobId, authUser.id, t);
    return McqMaster.create(
      {
        companyId: authUser.id,
        jobId: body.jobId ?? null,
        conceptOrLanguage: body.conceptOrLanguage,
        question: body.question,
        options: body.options,
        correctAnswer: body.correctAnswer,
      },
      { transaction: t },
    );
  });

  res.status(201).json(created);
});

export const deleteMcq = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const existing = await McqMaster.findOne({ where: { id, companyId: authUser.id }, transaction: t });
    if (!existing) throw ApiError.notFound('MCQ not found');
    await existing.destroy({ transaction: t });
  });

  res.status(204).send();
});

// ---------------------------------------------------------------------
// Round results — the company's manual decision. "After each round, the
// company manually updates the candidate's result... this triggers the
// candidate's next-stage notification automatically" (spec) — the
// notification fires from here, on the company's decision, not from the
// candidate's own submission (candidateRoundController.submitRoundAttempt
// only ever writes score/submissionDetail).
// ---------------------------------------------------------------------

export const listRoundResults = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId, roundId } = req.params;

  const results = await runInRequestContext(authUser, async (t) => {
    await loadOwnedRound(jobId, roundId, authUser.id, t);
    return JobRoundResult.findAll({ where: { roundId }, transaction: t });
  });

  res.json(results);
});

const decideRoundSchema = z.object({
  result: z.enum(['pass', 'fail', 'hold']),
  score: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});

export const decideRound = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId, roundId, applicationId } = req.params;
  const body = decideRoundSchema.parse(req.body);

  const { row, notifyTask, roundName, jobTitle } = await runInRequestContext(authUser, async (t) => {
    const round = await loadOwnedRound(jobId, roundId, authUser.id, t);
    const application = await JobApplication.findOne({ where: { id: applicationId, jobId }, transaction: t });
    if (!application) throw ApiError.notFound('Application not found');

    const [row] = await JobRoundResult.findOrCreate({
      where: { applicationId, roundId },
      defaults: { applicationId, roundId },
      transaction: t,
    });
    row.result = body.result;
    if (body.score !== undefined) row.score = body.score;
    if (body.notes !== undefined) row.notes = body.notes;
    row.updatedBy = authUser.id;
    row.updatedAt = new Date();
    await row.save({ transaction: t });

    const job = await Job.findByPk(jobId, { transaction: t });
    const company = await CompanyProfile.findOne({ where: { userId: authUser.id }, transaction: t });

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
            type: 'round_result',
            message: `Your result for ${round.roundName} (${job?.title ?? 'a job'}) has been updated.`,
            link: '/candidate/applications',
          },
          { transaction: t },
        );
        notifyTask = { kind: 'verified', userId: candidateUser.id, email: candidateUser.email, fullName: candidateUser.fullName };
      }
    } else if (application.externalApplicantId) {
      const applicant = await ExternalApplicant.findByPk(application.externalApplicantId, { transaction: t });
      if (applicant) {
        notifyTask = { kind: 'external', email: applicant.email, fullName: applicant.fullName };
      }
    }

    return {
      row,
      notifyTask,
      roundName: round.roundName,
      jobTitle: job?.title ?? 'a job',
      companyName: company?.companyName ?? 'A company',
    };
  });

  if (notifyTask) {
    const { subject, html } = roundResultUpdatedEmail(
      notifyTask.fullName ?? notifyTask.email,
      jobTitle,
      roundName,
      body.result,
    );
    await sendEmail({ to: notifyTask.email, subject, html });
  }

  res.json(row);
});
