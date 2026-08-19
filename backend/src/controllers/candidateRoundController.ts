import { Request, Response } from 'express';
import { Transaction } from 'sequelize';
import { z } from 'zod';
import {
  JobApplication,
  JobRound,
  JobRoundQuestion,
  JobRoundResult,
  CustomCodingQuestion,
  McqMaster,
  ContestQuestion,
} from '../models';
import type { RoundSubmissionAnswer, RoundSubmissionDetail } from '../models/JobRoundResult';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { executeAgainstCases, isSupportedLanguage } from '../utils/codeRunner';

/**
 * End-to-End ATS (Feature 2) — Phase 8: candidate-facing round-taking.
 * Company-side round/question management lives in jobRoundController.ts.
 * This file is the trust boundary — hidden test cases and MCQ correct
 * answers must never appear in anything it returns, same discipline as
 * contestController.toCandidateQuestion.
 */

async function loadOwnApplication(applicationId: string, candidateId: string, t: Transaction): Promise<JobApplication> {
  const application = await JobApplication.findOne({
    where: { id: applicationId, candidateId },
    transaction: t,
  });
  if (!application) throw ApiError.notFound('Application not found');
  return application;
}

interface CandidateRoundQuestion {
  linkId: string;
  questionSource: 'contest_question' | 'custom_coding_question' | 'mcq_master';
  questionId: string;
  points: number;
  sortOrder: number;
  title: string;
  statement: string;
  starterCode: Record<string, string> | null;
  sampleTestCases: { stdin: string; expectedOutput: string; explanation?: string }[] | null;
  hiddenTestCount: number | null;
  languageSupport: string[] | null;
  isSql: boolean | null;
  options: string[] | null;
}

async function resolveCandidateQuestions(roundId: string, t: Transaction): Promise<CandidateRoundQuestion[]> {
  const links = await JobRoundQuestion.findAll({ where: { roundId }, order: [['sortOrder', 'ASC']], transaction: t });

  const results: CandidateRoundQuestion[] = [];
  for (const link of links) {
    if (link.questionSource === 'contest_question') {
      const q = await ContestQuestion.findByPk(link.questionId, { transaction: t });
      if (!q || q.type !== 'coding') continue;
      const content = q.content as { statement: string; starterCode?: Record<string, string> };
      results.push({
        linkId: link.id,
        questionSource: link.questionSource,
        questionId: link.questionId,
        points: link.points,
        sortOrder: link.sortOrder,
        title: 'Coding question',
        statement: content.statement,
        starterCode: content.starterCode ?? null,
        sampleTestCases: q.sampleTestCases,
        hiddenTestCount: Array.isArray(q.hiddenTestCases) ? q.hiddenTestCases.length : 0,
        languageSupport: null,
        isSql: false,
        options: null,
      });
    } else if (link.questionSource === 'custom_coding_question') {
      const q = await CustomCodingQuestion.findByPk(link.questionId, { transaction: t });
      if (!q) continue;
      results.push({
        linkId: link.id,
        questionSource: link.questionSource,
        questionId: link.questionId,
        points: link.points,
        sortOrder: link.sortOrder,
        title: q.title,
        statement: q.description,
        starterCode: q.starterCode,
        sampleTestCases: q.sampleTestCases,
        hiddenTestCount: q.hiddenTestCases.length,
        languageSupport: q.languageSupport,
        isSql: q.isSql,
        options: null,
      });
    } else {
      const q = await McqMaster.findByPk(link.questionId, { transaction: t });
      if (!q) continue;
      results.push({
        linkId: link.id,
        questionSource: link.questionSource,
        questionId: link.questionId,
        points: link.points,
        sortOrder: link.sortOrder,
        title: q.conceptOrLanguage,
        statement: q.question,
        starterCode: null,
        sampleTestCases: null,
        hiddenTestCount: null,
        languageSupport: null,
        isSql: null,
        options: q.options,
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------
// GET /candidates/applications/:applicationId/rounds/:roundId
// ---------------------------------------------------------------------

export const getRound = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { applicationId, roundId } = req.params;

  const response = await runInRequestContext(authUser, async (t) => {
    const application = await loadOwnApplication(applicationId, authUser.id, t);
    const round = await JobRound.findOne({ where: { id: roundId, jobId: application.jobId }, transaction: t });
    if (!round) throw ApiError.notFound('Round not found');

    const questions = await resolveCandidateQuestions(roundId, t);
    const existingResult = await JobRoundResult.findOne({ where: { applicationId, roundId }, transaction: t });

    return {
      round: { id: round.id, roundName: round.roundName, roundType: round.roundType },
      questions,
      // The candidate can see their own auto-score and prior answers, but
      // never the company's result/notes verdict until it's actually
      // decided — result stays whatever it is (null = not yet reviewed).
      priorSubmission: existingResult
        ? { score: existingResult.score, result: existingResult.result, submittedAnswers: existingResult.submissionDetail?.answers.length ?? 0 }
        : null,
    };
  });

  res.json(response);
});

// ---------------------------------------------------------------------
// POST /candidates/applications/:applicationId/rounds/:roundId/submit
// ---------------------------------------------------------------------

const answerSchema = z.object({
  questionSource: z.enum(['contest_question', 'custom_coding_question', 'mcq_master']),
  questionId: z.string().uuid(),
  language: z.string().optional(),
  code: z.string().optional(),
  selectedOptionIndex: z.number().int().optional(),
  // SQL questions only — sql.js runs entirely in the candidate's browser
  // (spec: zero-cost, no server-side SQL execution exists in this app).
  // These two are trusted as reported, not independently re-verified —
  // see the migration's header note on custom_coding_questions.is_sql for
  // why that's an accepted, spec-driven tradeoff rather than an oversight.
  clientPassedCount: z.number().int().min(0).optional(),
  clientTotalCount: z.number().int().min(0).optional(),
});

const submitRoundSchema = z.object({
  answers: z.array(answerSchema).min(1),
});

export const submitRoundAttempt = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { applicationId, roundId } = req.params;
  const body = submitRoundSchema.parse(req.body);

  const result = await runInRequestContext(authUser, async (t) => {
    const application = await loadOwnApplication(applicationId, authUser.id, t);
    const round = await JobRound.findOne({ where: { id: roundId, jobId: application.jobId }, transaction: t });
    if (!round) throw ApiError.notFound('Round not found');

    const links = await JobRoundQuestion.findAll({ where: { roundId }, transaction: t });
    const linkByQuestion = new Map(links.map((l) => [`${l.questionSource}:${l.questionId}`, l]));

    const answers: RoundSubmissionAnswer[] = [];
    let autoScore = 0;
    const maxScore = links.reduce((sum, l) => sum + l.points, 0);

    for (const submitted of body.answers) {
      const link = linkByQuestion.get(`${submitted.questionSource}:${submitted.questionId}`);
      // Silently skip answers for questions not actually attached to this
      // round — never trust a client-supplied question id against scoring.
      if (!link) continue;

      if (submitted.questionSource === 'mcq_master') {
        const q = await McqMaster.findByPk(submitted.questionId, { transaction: t });
        if (!q) continue;
        const isCorrect = submitted.selectedOptionIndex === q.correctAnswer;
        const pointsEarned = isCorrect ? link.points : 0;
        autoScore += pointsEarned;
        answers.push({
          questionSource: 'mcq_master',
          questionId: submitted.questionId,
          selectedOptionIndex: submitted.selectedOptionIndex,
          isCorrect,
          pointsEarned,
        });
        continue;
      }

      // Coding (contest_question or custom_coding_question).
      let isSql = false;
      let sampleTestCases: { stdin: string; expectedOutput: string }[] = [];
      let hiddenTestCases: { stdin: string; expectedOutput: string }[] = [];
      if (submitted.questionSource === 'custom_coding_question') {
        const q = await CustomCodingQuestion.findByPk(submitted.questionId, { transaction: t });
        if (!q) continue;
        isSql = q.isSql;
        sampleTestCases = q.sampleTestCases;
        hiddenTestCases = q.hiddenTestCases;
      } else {
        const q = await ContestQuestion.findByPk(submitted.questionId, { transaction: t });
        if (!q || q.type !== 'coding') continue;
        sampleTestCases = q.sampleTestCases;
        hiddenTestCases = q.hiddenTestCases;
      }

      if (isSql) {
        const passedCount = submitted.clientPassedCount ?? 0;
        const totalCount = submitted.clientTotalCount ?? sampleTestCases.length + hiddenTestCases.length;
        const pointsEarned = totalCount > 0 ? Math.round(link.points * (passedCount / totalCount)) : 0;
        autoScore += pointsEarned;
        answers.push({
          questionSource: submitted.questionSource,
          questionId: submitted.questionId,
          language: 'sql',
          passedCount,
          totalCount,
          clientReported: true,
          pointsEarned,
        });
        continue;
      }

      if (!submitted.language || !isSupportedLanguage(submitted.language) || !submitted.code) {
        answers.push({
          questionSource: submitted.questionSource,
          questionId: submitted.questionId,
          language: submitted.language,
          compileError: 'Missing or unsupported language/code',
          pointsEarned: 0,
        });
        continue;
      }

      const outcome = await executeAgainstCases(
        submitted.language,
        submitted.code,
        [...sampleTestCases, ...hiddenTestCases],
        false,
      );
      const pointsEarned =
        outcome.totalCount > 0 ? Math.round(link.points * (outcome.passedCount / outcome.totalCount)) : 0;
      autoScore += pointsEarned;
      answers.push({
        questionSource: submitted.questionSource,
        questionId: submitted.questionId,
        language: submitted.language,
        code: submitted.code,
        passedCount: outcome.passedCount,
        totalCount: outcome.totalCount,
        compileError: outcome.compileError,
        pointsEarned,
      });
    }

    const submissionDetail: RoundSubmissionDetail = { answers, autoScore, maxScore };

    const [row] = await JobRoundResult.findOrCreate({
      where: { applicationId, roundId },
      defaults: { applicationId, roundId, score: autoScore, submissionDetail },
      transaction: t,
    });
    // Candidate-owned fields only — result/notes/updatedBy are the
    // company's decision (jobRoundResultController.decideRound) and are
    // deliberately never touched here, even on a resubmission. RLS can't
    // enforce that column-level split (row-level only), so this is the
    // actual guard.
    row.score = autoScore;
    row.submissionDetail = submissionDetail;
    await row.save({ transaction: t });

    return { score: autoScore, maxScore };
  });

  res.status(201).json(result);
});
