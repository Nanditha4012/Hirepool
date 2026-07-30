import { Request, Response } from 'express';
import { Op, Transaction } from 'sequelize';
import { z } from 'zod';
import {
  Contest,
  ContestQuestion,
  ContestAttempt,
  ContestQuestionResponse,
  CandidateProfile,
  SiteSetting,
  User,
} from '../models';
import type {
  ContestType,
  ContestComplexity,
} from '../models/Contest';
import type {
  ContestQuestionType,
  ContestSection,
  McqContent,
  InteractiveContent,
} from '../models/ContestQuestion';
import type { SectionScores } from '../models/ContestAttempt';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import {
  SUPPORTED_LANGUAGES,
  checkRuntimeAvailability,
  executeAgainstCases,
  isSupportedLanguage,
  type LanguageId,
} from '../utils/piston';

const CONTEST_TYPES = ['dsa', 'domain', 'quant'] as const;
const COMPLEXITIES = ['easy', 'medium', 'hard'] as const;

// ---------------------------------------------------------------------
// Pricing gate
//
// Built now, dormant now. `contest_entry_fee_inr` is seeded to '0' by
// migrations/20240110000001, and every start-attempt call runs through
// assertContestEntryAllowed(). While the fee is 0 it is a pass-through; set
// it to '9' from the admin site-settings screen and the same code path
// starts demanding a paid Razorpay order id, with no redeployment. The
// Razorpay order creation/verification helpers already exist in
// paymentController — this is the hook point that would call them.
// ---------------------------------------------------------------------

const CONTEST_FEE_SETTING_KEY = 'contest_entry_fee_inr';

async function getContestEntryFee(t: Transaction): Promise<number> {
  const setting = await SiteSetting.findByPk(CONTEST_FEE_SETTING_KEY, { transaction: t });
  const parsed = Number(setting?.value ?? '0');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Throws unless this candidate may start a paid contest. Free contests
 * (fee 0 — today, always) return immediately.
 */
async function assertContestEntryAllowed(t: Transaction): Promise<void> {
  const fee = await getContestEntryFee(t);
  if (fee === 0) return;

  // Deliberately a hard stop rather than a silent free pass: if someone
  // switches the fee on before wiring the checkout call below, contests must
  // fail closed (nobody gets in free) rather than fail open.
  throw ApiError.paymentRequired(
    `Contest entry costs ₹${fee}. Payment for contests isn't enabled yet — please contact support.`,
  );
}

// ---------------------------------------------------------------------
// Candidate-safe shaping
// ---------------------------------------------------------------------

/**
 * Strips everything a candidate sitting the test must not see: the hidden
 * grading cases, and the correct answer.
 *
 * This is the ONLY place question rows are shaped for a candidate. RLS can't
 * do this job — it is row-level, and candidates legitimately need to read
 * these rows — so this function is the actual guard. Anything that sends a
 * ContestQuestion to a candidate must go through here.
 */
function toCandidateQuestion(question: ContestQuestion) {
  return {
    id: question.id,
    type: question.type,
    content: question.content,
    topicTag: question.topicTag,
    section: question.section,
    sampleTestCases: question.sampleTestCases,
    points: question.points,
    sortOrder: question.sortOrder,
    /** Count only — enough to show "12 hidden tests", not what they are. */
    hiddenTestCount: Array.isArray(question.hiddenTestCases) ? question.hiddenTestCases.length : 0,
  };
}

// ---------------------------------------------------------------------
// GET /contests/hub — the three contest-type cards
// ---------------------------------------------------------------------

export const getHub = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const result = await runInRequestContext(authUser, async (t) => {
    const contests = await Contest.findAll({ where: { published: true }, transaction: t });
    const attempts = await ContestAttempt.findAll({
      where: { candidateId: authUser.id, submittedAt: { [Op.ne]: null } },
      transaction: t,
    });

    const contestTypeById = new Map(contests.map((c) => [c.id, c.type]));

    return CONTEST_TYPES.map((type) => {
      const typeContests = contests.filter((c) => c.type === type);
      const typeAttempts = attempts.filter((a) => contestTypeById.get(a.contestId) === type);

      // "Best score" is a percentage, not raw points — tests within a type
      // have different maximums, so raw points across them aren't comparable.
      let bestPercent: number | null = null;
      for (const attempt of typeAttempts) {
        if (attempt.maxScore <= 0) continue;
        const percent = Math.round((attempt.score / attempt.maxScore) * 100);
        if (bestPercent === null || percent > bestPercent) bestPercent = percent;
      }

      return {
        type,
        testCount: typeContests.length,
        attemptedCount: new Set(typeAttempts.map((a) => a.contestId)).size,
        bestScorePercent: bestPercent,
      };
    });
  });

  res.json({ contests: result, entryFeeInr: 0 });
});

// ---------------------------------------------------------------------
// GET /contests?type=&complexity= — the test list for one card
// ---------------------------------------------------------------------

const listContestsQuerySchema = z.object({
  type: z.enum(CONTEST_TYPES),
  complexity: z.enum(COMPLEXITIES).optional(),
});

export const listContests = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const query = listContestsQuerySchema.parse(req.query);

  const response = await runInRequestContext(authUser, async (t) => {
    const where: Record<string, unknown> = { type: query.type, published: true };
    if (query.complexity) where.complexity = query.complexity;

    const contests = await Contest.findAll({
      where,
      order: [
        ['complexity', 'ASC'],
        ['title', 'ASC'],
      ],
      transaction: t,
    });

    const contestIds = contests.map((c) => c.id);

    // Sequential, sharing transaction `t` — the same one-connection-per-
    // transaction discipline used throughout this codebase (see the comment
    // in companyController.searchCandidates).
    const questionCounts = new Map<string, number>();
    const attemptsByContest = new Map<string, ContestAttempt[]>();

    if (contestIds.length > 0) {
      const questions = await ContestQuestion.findAll({
        where: { contestId: { [Op.in]: contestIds } },
        attributes: ['id', 'contestId'],
        transaction: t,
      });
      for (const question of questions) {
        questionCounts.set(question.contestId, (questionCounts.get(question.contestId) ?? 0) + 1);
      }

      const attempts = await ContestAttempt.findAll({
        where: {
          candidateId: authUser.id,
          contestId: { [Op.in]: contestIds },
          submittedAt: { [Op.ne]: null },
        },
        transaction: t,
      });
      for (const attempt of attempts) {
        const list = attemptsByContest.get(attempt.contestId) ?? [];
        list.push(attempt);
        attemptsByContest.set(attempt.contestId, list);
      }
    }

    return contests.map((contest) => {
      const attempts = attemptsByContest.get(contest.id) ?? [];
      const best = attempts.reduce<ContestAttempt | null>((acc, attempt) => {
        if (!acc) return attempt;
        return attempt.score > acc.score ? attempt : acc;
      }, null);

      return {
        id: contest.id,
        type: contest.type,
        complexity: contest.complexity,
        title: contest.title,
        description: contest.description,
        timeLimitMinutes: contest.timeLimitMinutes,
        questionCount: questionCounts.get(contest.id) ?? 0,
        bestAttempt: best
          ? {
              id: best.id,
              score: best.score,
              maxScore: best.maxScore,
              percent: best.maxScore > 0 ? Math.round((best.score / best.maxScore) * 100) : 0,
              submittedAt: best.submittedAt,
            }
          : null,
        attemptCount: attempts.length,
      };
    });
  });

  res.json({ contests: response });
});

// ---------------------------------------------------------------------
// POST /contests/:contestId/attempts — start (or resume) a test
// ---------------------------------------------------------------------

/**
 * Builds the full "here is your test" payload for an open attempt. Shared by
 * startAttempt and resumeAttempt so the runner receives an identical shape
 * whether it just started or is recovering from a refresh.
 */
async function buildAttemptPayload(attempt: ContestAttempt, t: Transaction) {
  const contest = await Contest.findByPk(attempt.contestId, { transaction: t });
  if (!contest) throw ApiError.notFound('Contest not found');

  const questions = await ContestQuestion.findAll({
    where: { contestId: attempt.contestId },
    order: [['sortOrder', 'ASC']],
    transaction: t,
  });

  const existingResponses = await ContestQuestionResponse.findAll({
    where: { attemptId: attempt.id },
    transaction: t,
  });

  return {
    attempt: {
      id: attempt.id,
      startedAt: attempt.startedAt,
      maxScore: attempt.maxScore,
      // Derived server-side from startedAt, so a candidate can't buy time by
      // reloading — the client's countdown only displays this.
      secondsRemaining: Math.max(
        0,
        contest.timeLimitMinutes * 60 -
          Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000),
      ),
    },
    contest: {
      id: contest.id,
      type: contest.type,
      complexity: contest.complexity,
      title: contest.title,
      description: contest.description,
      timeLimitMinutes: contest.timeLimitMinutes,
    },
    questions: questions.map(toCandidateQuestion),
    savedResponses: existingResponses.map((r) => ({
      questionId: r.questionId,
      response: r.response,
    })),
    languages: SUPPORTED_LANGUAGES.map((l) => ({ id: l.id, label: l.label })),
    hasCodingQuestions: questions.some((q) => q.type === 'coding'),
  };
}

export const startAttempt = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { contestId } = req.params;

  const response = await runInRequestContext(authUser, async (t) => {
    await assertContestEntryAllowed(t);

    const contest = await Contest.findOne({
      where: { id: contestId, published: true },
      transaction: t,
    });
    if (!contest) {
      throw ApiError.notFound('Contest not found');
    }

    const questions = await ContestQuestion.findAll({
      where: { contestId },
      attributes: ['id', 'points'],
      transaction: t,
    });
    if (questions.length === 0) {
      throw ApiError.badRequest('This test has no questions yet.');
    }

    // Resume rather than restart. A refresh, a dropped connection, or a phone
    // locking mid-test must not silently hand out a brand-new attempt with a
    // fresh clock — that would be an easy way to farm extra time.
    let attempt = await ContestAttempt.findOne({
      where: { candidateId: authUser.id, contestId, submittedAt: null },
      order: [['startedAt', 'DESC']],
      transaction: t,
    });

    if (!attempt) {
      attempt = await ContestAttempt.create(
        {
          candidateId: authUser.id,
          contestId,
          maxScore: questions.reduce((sum, q) => sum + q.points, 0),
        },
        { transaction: t },
      );
    }

    return buildAttemptPayload(attempt, t);
  });

  // Probed only when the test actually contains code to run, and outside the
  // transaction so a slow third-party check never holds a DB connection. The
  // candidate is warned before they start writing, rather than at Submit.
  const codeExecution = response.hasCodingQuestions
    ? await checkRuntimeAvailability()
    : { ok: true, detail: null };

  res.status(201).json({ ...response, codeExecution });
});

/**
 * GET /contests/attempts/:attemptId — reload an in-progress attempt.
 *
 * The runner is a full-screen page addressed by attempt id, so a refresh (or
 * a shared/restored tab) has nothing in memory. Without this the candidate
 * would lose their place mid-test; with it they get their saved answers and
 * the correct remaining time back.
 */
export const resumeAttempt = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { attemptId } = req.params;

  const response = await runInRequestContext(authUser, async (t) => {
    const attempt = await loadOpenAttempt(attemptId, authUser.id, t);
    return buildAttemptPayload(attempt, t);
  });

  const codeExecution = response.hasCodingQuestions
    ? await checkRuntimeAvailability()
    : { ok: true, detail: null };

  res.json({ ...response, codeExecution });
});

// ---------------------------------------------------------------------
// PUT /contests/attempts/:attemptId/responses/:questionId — save an answer
// ---------------------------------------------------------------------

const saveResponseSchema = z.object({
  response: z.record(z.unknown()).nullable(),
});

/** Loads an in-progress attempt owned by this candidate, or throws. */
async function loadOpenAttempt(
  attemptId: string,
  candidateId: string,
  t: Transaction,
): Promise<ContestAttempt> {
  const attempt = await ContestAttempt.findOne({
    where: { id: attemptId, candidateId },
    transaction: t,
  });
  if (!attempt) {
    throw ApiError.notFound('Attempt not found');
  }
  if (attempt.submittedAt) {
    throw ApiError.conflict('This attempt has already been submitted.');
  }
  return attempt;
}

export const saveResponse = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { attemptId, questionId } = req.params;
  const body = saveResponseSchema.parse(req.body);

  await runInRequestContext(authUser, async (t) => {
    const attempt = await loadOpenAttempt(attemptId, authUser.id, t);

    const question = await ContestQuestion.findOne({
      where: { id: questionId, contestId: attempt.contestId },
      transaction: t,
    });
    if (!question) {
      throw ApiError.notFound('Question not found on this test');
    }

    // Answers are stored unscored during the test — grading happens once, at
    // submit. Scoring on every keystroke-save would both hammer Piston and
    // leak correctness back to the candidate through response timing.
    const existing = await ContestQuestionResponse.findOne({
      where: { attemptId, questionId },
      transaction: t,
    });

    if (existing) {
      existing.response = body.response;
      existing.updatedAt = new Date();
      await existing.save({ transaction: t });
    } else {
      await ContestQuestionResponse.create(
        { attemptId, questionId, response: body.response },
        { transaction: t },
      );
    }
  });

  res.status(204).send();
});

// ---------------------------------------------------------------------
// POST /contests/attempts/:attemptId/run — execute against SAMPLE cases
// ---------------------------------------------------------------------

const runCodeSchema = z.object({
  questionId: z.string().uuid(),
  language: z.string().min(1),
  source: z.string().min(1).max(100_000),
});

export const runCode = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { attemptId } = req.params;
  const body = runCodeSchema.parse(req.body);

  if (!isSupportedLanguage(body.language)) {
    throw ApiError.badRequest(`Unsupported language "${body.language}"`);
  }
  const language: LanguageId = body.language;

  // Read the question inside a transaction, then execute OUTSIDE it. Piston
  // calls take seconds; holding a pg connection open across them would tie up
  // the pool on a slow third party for no reason.
  const question = await runInRequestContext(authUser, async (t) => {
    const attempt = await loadOpenAttempt(attemptId, authUser.id, t);
    const found = await ContestQuestion.findOne({
      where: { id: body.questionId, contestId: attempt.contestId },
      transaction: t,
    });
    if (!found) throw ApiError.notFound('Question not found on this test');
    if (found.type !== 'coding') throw ApiError.badRequest('This question is not a coding question');
    return found;
  });

  const samples = Array.isArray(question.sampleTestCases) ? question.sampleTestCases : [];
  if (samples.length === 0) {
    throw ApiError.badRequest('This question has no sample test cases to run against.');
  }

  const result = await executeAgainstCases(language, body.source, samples, true);

  res.json({
    language,
    cases: result.cases,
    passedCount: result.passedCount,
    totalCount: result.totalCount,
    compileError: result.compileError,
  });
});

// ---------------------------------------------------------------------
// POST /contests/attempts/:attemptId/submit-code — grade one coding question
// ---------------------------------------------------------------------

export const submitCode = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { attemptId } = req.params;
  const body = runCodeSchema.parse(req.body);

  if (!isSupportedLanguage(body.language)) {
    throw ApiError.badRequest(`Unsupported language "${body.language}"`);
  }
  const language: LanguageId = body.language;

  const question = await runInRequestContext(authUser, async (t) => {
    const attempt = await loadOpenAttempt(attemptId, authUser.id, t);
    const found = await ContestQuestion.findOne({
      where: { id: body.questionId, contestId: attempt.contestId },
      transaction: t,
    });
    if (!found) throw ApiError.notFound('Question not found on this test');
    if (found.type !== 'coding') throw ApiError.badRequest('This question is not a coding question');
    return found;
  });

  const hidden = Array.isArray(question.hiddenTestCases) ? question.hiddenTestCases : [];
  const samples = Array.isArray(question.sampleTestCases) ? question.sampleTestCases : [];
  // Graded against hidden cases when they exist; a question authored without
  // any still needs to be scoreable, so it falls back to its samples.
  const gradingCases = hidden.length > 0 ? hidden : samples;

  // Executed outside the transaction — same reasoning as runCode above.
  const result = await executeAgainstCases(language, body.source, gradingCases, false);

  // Partial credit, proportional to cases passed. All-or-nothing would make a
  // solution that handles every case but one indistinguishable from a blank
  // submission, which tells a company nothing useful.
  const earned =
    result.totalCount > 0 ? Math.round((result.passedCount / result.totalCount) * question.points) : 0;

  const stored = await runInRequestContext(authUser, async (t) => {
    await loadOpenAttempt(attemptId, authUser.id, t);

    const payload = {
      response: { language, source: body.source } as Record<string, unknown>,
      isCorrect: result.totalCount > 0 && result.passedCount === result.totalCount,
      score: earned,
      codeRunResults: {
        language,
        cases: result.cases,
        passedCount: result.passedCount,
        totalCount: result.totalCount,
        compileError: result.compileError,
      },
      updatedAt: new Date(),
    };

    const existing = await ContestQuestionResponse.findOne({
      where: { attemptId, questionId: body.questionId },
      transaction: t,
    });
    if (existing) {
      Object.assign(existing, payload);
      await existing.save({ transaction: t });
      return existing;
    }
    return ContestQuestionResponse.create(
      { attemptId, questionId: body.questionId, ...payload },
      { transaction: t },
    );
  });

  res.json({
    questionId: body.questionId,
    score: stored.score,
    maxScore: question.points,
    passedCount: result.passedCount,
    totalCount: result.totalCount,
    compileError: result.compileError,
    // Hidden-case results carry pass/fail only (revealDetails=false above),
    // so returning them can't leak the grading inputs.
    cases: result.cases,
  });
});

// ---------------------------------------------------------------------
// Grading for non-coding question types
// ---------------------------------------------------------------------

function gradeMcq(question: ContestQuestion, response: Record<string, unknown> | null): boolean {
  const correctIndex = (question.correctAnswer as { index?: number } | null)?.index;
  return typeof correctIndex === 'number' && response?.index === correctIndex;
}

function gradeInteractive(
  question: ContestQuestion,
  response: Record<string, unknown> | null,
): boolean {
  const content = question.content as InteractiveContent;
  const correct = question.correctAnswer as Record<string, unknown> | null;
  if (!correct || !response) return false;

  switch (content.interactiveKind) {
    case 'drag_drop': {
      const expected = correct.order;
      const given = response.order;
      return (
        Array.isArray(expected) &&
        Array.isArray(given) &&
        expected.length === given.length &&
        expected.every((value, index) => value === given[index])
      );
    }
    case 'fill_blank': {
      const expected = correct.blanks;
      const given = response.blanks;
      if (!Array.isArray(expected) || !Array.isArray(given) || expected.length !== given.length) {
        return false;
      }
      // Blanks are short code/word answers typed by hand, so casing and
      // surrounding whitespace shouldn't decide right vs wrong.
      return expected.every(
        (value, index) =>
          String(value).trim().toLowerCase() === String(given[index] ?? '').trim().toLowerCase(),
      );
    }
    case 'scenario': {
      const expected = correct.answers;
      const given = response.answers;
      return (
        Array.isArray(expected) &&
        Array.isArray(given) &&
        expected.length === given.length &&
        expected.every((value, index) => value === given[index])
      );
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------
// POST /contests/attempts/:attemptId/submit — finish and grade
// ---------------------------------------------------------------------

export const submitAttempt = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { attemptId } = req.params;

  const result = await runInRequestContext(authUser, async (t) => {
    const attempt = await loadOpenAttempt(attemptId, authUser.id, t);

    const contest = await Contest.findByPk(attempt.contestId, { transaction: t });
    if (!contest) throw ApiError.notFound('Contest not found');

    const questions = await ContestQuestion.findAll({
      where: { contestId: attempt.contestId },
      order: [['sortOrder', 'ASC']],
      transaction: t,
    });
    const responses = await ContestQuestionResponse.findAll({
      where: { attemptId },
      transaction: t,
    });
    const responseByQuestion = new Map(responses.map((r) => [r.questionId, r]));

    let totalScore = 0;
    const sectionScores: SectionScores = {};

    for (const question of questions) {
      const response = responseByQuestion.get(question.id) ?? null;

      let earned = 0;
      let isCorrect = false;

      if (question.type === 'coding') {
        // Already graded by submitCode — a coding question is only scored
        // when the candidate explicitly submitted it against hidden cases.
        earned = response?.score ?? 0;
        isCorrect = response?.isCorrect ?? false;
      } else if (question.type === 'mcq') {
        isCorrect = gradeMcq(question, response?.response ?? null);
        earned = isCorrect ? question.points : 0;
      } else {
        isCorrect = gradeInteractive(question, response?.response ?? null);
        earned = isCorrect ? question.points : 0;
      }

      totalScore += earned;

      if (question.section) {
        const bucket = sectionScores[question.section] ?? { score: 0, max: 0 };
        bucket.score += earned;
        bucket.max += question.points;
        sectionScores[question.section] = bucket;
      }

      // Persist the verdict for non-coding types so the analysis screen and
      // the weak-areas summary can be rebuilt later without re-grading.
      if (question.type !== 'coding') {
        if (response) {
          response.isCorrect = isCorrect;
          response.score = earned;
          response.updatedAt = new Date();
          await response.save({ transaction: t });
        } else {
          await ContestQuestionResponse.create(
            { attemptId, questionId: question.id, response: null, isCorrect: false, score: 0 },
            { transaction: t },
          );
        }
      }
    }

    const now = new Date();
    attempt.score = totalScore;
    attempt.maxScore = questions.reduce((sum, q) => sum + q.points, 0);
    attempt.sectionScores = sectionScores;
    attempt.timeTakenSeconds = Math.max(
      0,
      Math.floor((now.getTime() - new Date(attempt.startedAt).getTime()) / 1000),
    );
    attempt.submittedAt = now;
    await attempt.save({ transaction: t });

    return { attemptId: attempt.id };
  });

  res.json(result);
});

// ---------------------------------------------------------------------
// GET /contests/attempts/:attemptId/result — the score & analysis screen
// ---------------------------------------------------------------------

/**
 * Groups per-question outcomes by topic tag into "you're strong here / weak
 * there". A topic needs at least two questions before it's called either
 * way — one question is a coin flip, not a signal.
 */
function buildTopicAnalysis(
  rows: { topicTag: string | null; earned: number; possible: number }[],
): { strengths: string[]; weaknesses: string[]; byTopic: { topic: string; percent: number; questions: number }[] } {
  const byTopic = new Map<string, { earned: number; possible: number; count: number }>();

  for (const row of rows) {
    if (!row.topicTag) continue;
    const bucket = byTopic.get(row.topicTag) ?? { earned: 0, possible: 0, count: 0 };
    bucket.earned += row.earned;
    bucket.possible += row.possible;
    bucket.count += 1;
    byTopic.set(row.topicTag, bucket);
  }

  const summary = [...byTopic.entries()].map(([topic, bucket]) => ({
    topic,
    percent: bucket.possible > 0 ? Math.round((bucket.earned / bucket.possible) * 100) : 0,
    questions: bucket.count,
  }));

  return {
    strengths: summary.filter((s) => s.questions >= 2 && s.percent >= 70).map((s) => s.topic),
    weaknesses: summary.filter((s) => s.questions >= 2 && s.percent < 50).map((s) => s.topic),
    byTopic: summary.sort((a, b) => b.percent - a.percent),
  };
}

export const getAttemptResult = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { attemptId } = req.params;

  const result = await runInRequestContext(authUser, async (t) => {
    const attempt = await ContestAttempt.findOne({
      where: { id: attemptId, candidateId: authUser.id },
      transaction: t,
    });
    if (!attempt) throw ApiError.notFound('Attempt not found');
    if (!attempt.submittedAt) throw ApiError.badRequest('This attempt has not been submitted yet.');

    const contest = await Contest.findByPk(attempt.contestId, { transaction: t });
    if (!contest) throw ApiError.notFound('Contest not found');

    const questions = await ContestQuestion.findAll({
      where: { contestId: attempt.contestId },
      order: [['sortOrder', 'ASC']],
      transaction: t,
    });
    const responses = await ContestQuestionResponse.findAll({
      where: { attemptId },
      transaction: t,
    });
    const responseByQuestion = new Map(responses.map((r) => [r.questionId, r]));

    // Rank on this specific test: how many distinct candidates have a better
    // best-score. Ties share a rank, so two identical scores are both "3rd"
    // rather than one being arbitrarily demoted.
    const submitted = await ContestAttempt.findAll({
      where: { contestId: attempt.contestId, submittedAt: { [Op.ne]: null } },
      attributes: ['candidateId', 'score'],
      transaction: t,
    });
    const bestByCandidate = new Map<string, number>();
    for (const row of submitted) {
      const current = bestByCandidate.get(row.candidateId);
      if (current === undefined || row.score > current) bestByCandidate.set(row.candidateId, row.score);
    }
    const myBest = bestByCandidate.get(authUser.id) ?? attempt.score;
    const better = [...bestByCandidate.values()].filter((score) => score > myBest).length;

    const analysisRows: { topicTag: string | null; earned: number; possible: number }[] = [];

    const perQuestion = questions.map((question) => {
      const response = responseByQuestion.get(question.id) ?? null;
      analysisRows.push({
        topicTag: question.topicTag,
        earned: response?.score ?? 0,
        possible: question.points,
      });

      const base = {
        id: question.id,
        type: question.type,
        topicTag: question.topicTag,
        section: question.section,
        points: question.points,
        earned: response?.score ?? 0,
        isCorrect: response?.isCorrect ?? false,
        answered: Boolean(response?.response),
      };

      if (question.type === 'coding') {
        return {
          ...base,
          statement: (question.content as { statement?: string }).statement ?? '',
          codeRunResults: response?.codeRunResults ?? null,
        };
      }

      // Correct answers and explanations are released here and nowhere else —
      // this endpoint requires the attempt to be submitted, so revealing them
      // can no longer help the candidate on this attempt.
      const content = question.content as McqContent & InteractiveContent;
      return {
        ...base,
        question: content.question,
        options: content.options ?? null,
        explanation: content.explanation ?? null,
        correctAnswer: question.correctAnswer,
        yourResponse: response?.response ?? null,
      };
    });

    return {
      attempt: {
        id: attempt.id,
        score: attempt.score,
        maxScore: attempt.maxScore,
        percent: attempt.maxScore > 0 ? Math.round((attempt.score / attempt.maxScore) * 100) : 0,
        sectionScores: attempt.sectionScores,
        timeTakenSeconds: attempt.timeTakenSeconds,
        submittedAt: attempt.submittedAt,
      },
      contest: {
        id: contest.id,
        type: contest.type,
        complexity: contest.complexity,
        title: contest.title,
        timeLimitMinutes: contest.timeLimitMinutes,
      },
      rank: better + 1,
      totalParticipants: bestByCandidate.size,
      analysis: buildTopicAnalysis(analysisRows),
      questions: perQuestion,
    };
  });

  res.json(result);
});

// ---------------------------------------------------------------------
// GET /contests/leaderboard?type= — per contest TYPE, not per test
// ---------------------------------------------------------------------

const leaderboardQuerySchema = z.object({ type: z.enum(CONTEST_TYPES) });

const LEADERBOARD_LIMIT = 50;

export const getLeaderboard = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const query = leaderboardQuerySchema.parse(req.query);

  const response = await runInRequestContext(authUser, async (t) => {
    const contests = await Contest.findAll({
      where: { type: query.type, published: true },
      attributes: ['id'],
      transaction: t,
    });
    const contestIds = contests.map((c) => c.id);
    if (contestIds.length === 0) {
      return { rows: [], me: null, totalParticipants: 0 };
    }

    const attempts = await ContestAttempt.findAll({
      where: { contestId: { [Op.in]: contestIds }, submittedAt: { [Op.ne]: null } },
      transaction: t,
    });

    // Combined ranking = the sum of each candidate's BEST score per test in
    // this type. Summing every attempt instead would reward grinding the same
    // easy test repeatedly over actually completing the harder ones.
    const bestPerCandidatePerContest = new Map<string, Map<string, number>>();
    for (const attempt of attempts) {
      const perContest = bestPerCandidatePerContest.get(attempt.candidateId) ?? new Map();
      const current = perContest.get(attempt.contestId);
      if (current === undefined || attempt.score > current) {
        perContest.set(attempt.contestId, attempt.score);
      }
      bestPerCandidatePerContest.set(attempt.candidateId, perContest);
    }

    const totals = [...bestPerCandidatePerContest.entries()].map(([candidateId, perContest]) => ({
      candidateId,
      totalScore: [...perContest.values()].reduce((sum, score) => sum + score, 0),
      testsCompleted: perContest.size,
    }));

    totals.sort((a, b) => b.totalScore - a.totalScore || b.testsCompleted - a.testsCompleted);

    // Dense ranking on total score, so equal totals share a rank.
    let lastScore: number | null = null;
    let lastRank = 0;
    const ranked = totals.map((row, index) => {
      const rank = row.totalScore === lastScore ? lastRank : index + 1;
      lastScore = row.totalScore;
      lastRank = rank;
      return { ...row, rank };
    });

    const top = ranked.slice(0, LEADERBOARD_LIMIT);

    // Only the top slice's names are looked up, plus the viewer's own row if
    // they fall outside it — not all N candidates.
    const idsToName = new Set(top.map((r) => r.candidateId));
    const mine = ranked.find((r) => r.candidateId === authUser.id) ?? null;
    if (mine) idsToName.add(mine.candidateId);

    const users =
      idsToName.size > 0
        ? await User.findAll({
            where: { id: { [Op.in]: [...idsToName] } },
            attributes: ['id', 'fullName', 'email'],
            transaction: t,
          })
        : [];
    const nameById = new Map(
      users.map((u) => [u.id, u.fullName || u.email.split('@')[0]]),
    );

    return {
      rows: top.map((row) => ({
        rank: row.rank,
        candidateId: row.candidateId,
        name: nameById.get(row.candidateId) ?? 'Candidate',
        totalScore: row.totalScore,
        testsCompleted: row.testsCompleted,
        isMe: row.candidateId === authUser.id,
      })),
      // Sticky own-row for a candidate outside the top 50 — their real rank,
      // not a truncated one.
      me: mine
        ? {
            rank: mine.rank,
            candidateId: mine.candidateId,
            name: nameById.get(mine.candidateId) ?? 'You',
            totalScore: mine.totalScore,
            testsCompleted: mine.testsCompleted,
            isMe: true,
          }
        : null,
      totalParticipants: ranked.length,
    };
  });

  res.json(response);
});

// ---------------------------------------------------------------------
// GET /contests/performance/:candidateId — what a COMPANY sees
//
// System-generated from real scored attempts, so unlike achievements/badges
// it needs no verifier sign-off. Exposed to companies without requiring an
// unlock, matching how the Achievements section behaves.
// ---------------------------------------------------------------------

async function buildContestPerformance(
  authUser: { id: string; role: string },
  candidateId: string,
) {
  return runInRequestContext(authUser, async (t) => {
    const contests = await Contest.findAll({ where: { published: true }, transaction: t });
    const contestById = new Map(contests.map((c) => [c.id, c]));

    const attempts = await ContestAttempt.findAll({
      where: { contestId: { [Op.in]: contests.map((c) => c.id) }, submittedAt: { [Op.ne]: null } },
      transaction: t,
    });

    const summaries = CONTEST_TYPES.map((type) => {
      const typeContestIds = new Set(
        contests.filter((c) => c.type === type).map((c) => c.id),
      );
      const typeAttempts = attempts.filter((a) => typeContestIds.has(a.contestId));

      // Same "sum of bests per test" ranking as the leaderboard, so the rank
      // shown on a profile agrees with the rank shown on the board.
      const bestPerCandidate = new Map<string, Map<string, number>>();
      for (const attempt of typeAttempts) {
        const perContest = bestPerCandidate.get(attempt.candidateId) ?? new Map();
        const current = perContest.get(attempt.contestId);
        if (current === undefined || attempt.score > current) {
          perContest.set(attempt.contestId, attempt.score);
        }
        bestPerCandidate.set(attempt.candidateId, perContest);
      }

      const mine = bestPerCandidate.get(candidateId);
      if (!mine || mine.size === 0) return null;

      const totalFor = (perContest: Map<string, number>) =>
        [...perContest.values()].reduce((sum, score) => sum + score, 0);

      const myTotal = totalFor(mine);
      const better = [...bestPerCandidate.entries()].filter(
        ([id, perContest]) => id !== candidateId && totalFor(perContest) > myTotal,
      ).length;

      const myAttempts = typeAttempts.filter((a) => a.candidateId === candidateId);
      const bestPercent = myAttempts.reduce((best, attempt) => {
        if (attempt.maxScore <= 0) return best;
        return Math.max(best, Math.round((attempt.score / attempt.maxScore) * 100));
      }, 0);

      return {
        type,
        bestScorePercent: bestPercent,
        totalScore: myTotal,
        testsCompleted: mine.size,
        rank: better + 1,
        totalParticipants: bestPerCandidate.size,
        isTopRank: better === 0,
        bestTestTitle:
          myAttempts.length > 0
            ? contestById.get(
                myAttempts.reduce((best, a) => (a.score > best.score ? a : best), myAttempts[0])
                  .contestId,
              )?.title ?? null
            : null,
      };
    }).filter(Boolean);

    return { performance: summaries };
  });
}

export const getCandidateContestPerformance = asyncHandler(async (req: Request, res: Response) => {
  res.json(await buildContestPerformance(req.user!, req.params.candidateId));
});

// ---------------------------------------------------------------------
// GET /contests/me/performance — the candidate's own summary, same shape
// ---------------------------------------------------------------------

export const getMyContestPerformance = asyncHandler(async (req: Request, res: Response) => {
  res.json(await buildContestPerformance(req.user!, req.user!.id));
});

// Re-exported for the admin contest controller, which validates against the
// same enums rather than redeclaring them and letting the two drift.
export { CONTEST_TYPES, COMPLEXITIES };
