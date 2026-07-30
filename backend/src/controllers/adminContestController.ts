import { Request, Response } from 'express';
import { Op, fn, col } from 'sequelize';
import { z } from 'zod';
import { Contest, ContestQuestion, ContestAttempt } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { CONTEST_TYPES, COMPLEXITIES } from './contestController';

/**
 * Admin CRUD for contests and their questions.
 *
 * Kept in its own controller rather than bolted onto the already-1700-line
 * adminController.ts, and mounted under the same /admin router so it inherits
 * requireRole('admin') from there.
 */

// ---------------------------------------------------------------------
// Question payload validation
//
// `content` and `correct_answer` are JSONB, so the database will accept any
// shape at all. These schemas are the only thing standing between an admin
// typo and a question that renders blank (or worse, one that can never be
// answered correctly) for a candidate mid-contest — so each question type is
// validated as a discriminated union rather than as a loose object.
// ---------------------------------------------------------------------

const sampleTestCaseSchema = z.object({
  stdin: z.string(),
  expectedOutput: z.string(),
  explanation: z.string().optional(),
});

const hiddenTestCaseSchema = z.object({
  stdin: z.string(),
  expectedOutput: z.string(),
});

const codingQuestionSchema = z.object({
  type: z.literal('coding'),
  content: z.object({
    statement: z.string().min(1),
    constraints: z.string().optional(),
    starterCode: z.record(z.string()).optional(),
    timeLimitSeconds: z.number().int().positive().optional(),
    memoryLimitMb: z.number().int().positive().optional(),
  }),
  correctAnswer: z.null().optional(),
  sampleTestCases: z.array(sampleTestCaseSchema).default([]),
  hiddenTestCases: z.array(hiddenTestCaseSchema).default([]),
  topicTag: z.string().optional(),
  section: z.enum(['math', 'reasoning', 'english']).nullish(),
  points: z.number().int().positive().default(10),
  sortOrder: z.number().int().min(0).default(0),
});

const mcqQuestionSchema = z
  .object({
    type: z.literal('mcq'),
    content: z.object({
      question: z.string().min(1),
      options: z.array(z.string().min(1)).min(2),
      explanation: z.string().optional(),
    }),
    correctAnswer: z.object({ index: z.number().int().min(0) }),
    topicTag: z.string().optional(),
    section: z.enum(['math', 'reasoning', 'english']).nullish(),
    points: z.number().int().positive().default(1),
    sortOrder: z.number().int().min(0).default(0),
  })
  // An out-of-range answer index would produce a question nobody can get
  // right — and it would only surface as a mysteriously-zero score after
  // candidates had already sat the test.
  .refine((q) => q.correctAnswer.index < q.content.options.length, {
    message: 'correctAnswer.index must point at one of the options',
    path: ['correctAnswer', 'index'],
  });

const interactiveQuestionSchema = z
  .object({
    type: z.literal('interactive'),
    content: z.object({
      interactiveKind: z.enum(['drag_drop', 'fill_blank', 'scenario']),
      question: z.string().min(1),
      items: z.array(z.string()).optional(),
      snippet: z.string().optional(),
      parts: z
        .array(z.object({ prompt: z.string().min(1), options: z.array(z.string().min(1)).min(2) }))
        .optional(),
      explanation: z.string().optional(),
    }),
    correctAnswer: z.object({
      order: z.array(z.string()).optional(),
      blanks: z.array(z.string()).optional(),
      answers: z.array(z.number().int().min(0)).optional(),
    }),
    topicTag: z.string().optional(),
    section: z.enum(['math', 'reasoning', 'english']).nullish(),
    points: z.number().int().positive().default(2),
    sortOrder: z.number().int().min(0).default(0),
  })
  // Each interactive kind needs its own matching pair of fields; without this
  // an admin could save a drag-drop question whose answer key is a list of
  // blanks, which grades every submission as wrong.
  .superRefine((q, ctx) => {
    const { interactiveKind } = q.content;
    if (interactiveKind === 'drag_drop') {
      if (!q.content.items?.length || !q.correctAnswer.order?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'drag_drop needs content.items and correctAnswer.order',
        });
      } else if (q.content.items.length !== q.correctAnswer.order.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'correctAnswer.order must list every item exactly once',
        });
      }
    }
    if (interactiveKind === 'fill_blank') {
      if (!q.content.snippet || !q.correctAnswer.blanks?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'fill_blank needs content.snippet and correctAnswer.blanks',
        });
      } else {
        const blankCount = (q.content.snippet.match(/___/g) ?? []).length;
        if (blankCount !== q.correctAnswer.blanks.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `snippet has ${blankCount} "___" placeholders but ${q.correctAnswer.blanks.length} answers`,
          });
        }
      }
    }
    if (interactiveKind === 'scenario') {
      if (!q.content.parts?.length || !q.correctAnswer.answers?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'scenario needs content.parts and correctAnswer.answers',
        });
      } else if (q.content.parts.length !== q.correctAnswer.answers.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'correctAnswer.answers needs one entry per part',
        });
      }
    }
  });

const questionSchema = z.union([
  codingQuestionSchema,
  mcqQuestionSchema,
  interactiveQuestionSchema,
]);

// ---------------------------------------------------------------------
// Contests
// ---------------------------------------------------------------------

const createContestSchema = z.object({
  type: z.enum(CONTEST_TYPES),
  complexity: z.enum(COMPLEXITIES),
  title: z.string().min(1),
  description: z.string().optional(),
  timeLimitMinutes: z.number().int().positive().max(600).default(30),
  published: z.boolean().default(false),
});

const updateContestSchema = createContestSchema.partial();

export const listContestsAdmin = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const query = z
    .object({
      type: z.enum(CONTEST_TYPES).optional(),
      complexity: z.enum(COMPLEXITIES).optional(),
    })
    .parse(req.query);

  const response = await runInRequestContext(authUser, async (t) => {
    const where: Record<string, unknown> = {};
    if (query.type) where.type = query.type;
    if (query.complexity) where.complexity = query.complexity;

    const contests = await Contest.findAll({
      where,
      order: [
        ['type', 'ASC'],
        ['complexity', 'ASC'],
        ['title', 'ASC'],
      ],
      transaction: t,
    });
    const contestIds = contests.map((c) => c.id);

    // Aggregate stats per test — attempts, average score, average time.
    // Computed in SQL (GROUP BY) rather than by loading every attempt row:
    // the attempts table is the one here that grows without bound.
    const questionCounts = new Map<string, number>();
    const stats = new Map<string, { attempts: number; avgScore: number; avgSeconds: number }>();

    if (contestIds.length > 0) {
      const questionRows = (await ContestQuestion.findAll({
        where: { contestId: { [Op.in]: contestIds } },
        attributes: ['contestId', [fn('COUNT', col('id')), 'count']],
        group: ['contest_id'],
        raw: true,
        transaction: t,
      })) as unknown as { contestId: string; count: string }[];
      for (const row of questionRows) {
        questionCounts.set(row.contestId, Number(row.count));
      }

      const statRows = (await ContestAttempt.findAll({
        where: { contestId: { [Op.in]: contestIds }, submittedAt: { [Op.ne]: null } },
        attributes: [
          'contestId',
          [fn('COUNT', col('id')), 'attempts'],
          [fn('AVG', col('score')), 'avgScore'],
          [fn('AVG', col('time_taken_seconds')), 'avgSeconds'],
        ],
        group: ['contest_id'],
        raw: true,
        transaction: t,
      })) as unknown as {
        contestId: string;
        attempts: string;
        avgScore: string | null;
        avgSeconds: string | null;
      }[];
      for (const row of statRows) {
        stats.set(row.contestId, {
          attempts: Number(row.attempts),
          avgScore: row.avgScore ? Math.round(Number(row.avgScore) * 10) / 10 : 0,
          avgSeconds: row.avgSeconds ? Math.round(Number(row.avgSeconds)) : 0,
        });
      }
    }

    return contests.map((contest) => ({
      id: contest.id,
      type: contest.type,
      complexity: contest.complexity,
      title: contest.title,
      description: contest.description,
      timeLimitMinutes: contest.timeLimitMinutes,
      published: contest.published,
      questionCount: questionCounts.get(contest.id) ?? 0,
      stats: stats.get(contest.id) ?? { attempts: 0, avgScore: 0, avgSeconds: 0 },
    }));
  });

  res.json({ contests: response });
});

export const createContest = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = createContestSchema.parse(req.body);

  const contest = await runInRequestContext(authUser, (t) => Contest.create(body, { transaction: t }));

  res.status(201).json(contest);
});

export const updateContest = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const body = updateContestSchema.parse(req.body);
  const { contestId } = req.params;

  const contest = await runInRequestContext(authUser, async (t) => {
    const found = await Contest.findByPk(contestId, { transaction: t });
    if (!found) throw ApiError.notFound('Contest not found');

    Object.assign(found, body);
    found.updatedAt = new Date();
    await found.save({ transaction: t });
    return found;
  });

  res.json(contest);
});

export const deleteContest = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { contestId } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const found = await Contest.findByPk(contestId, { transaction: t });
    if (!found) throw ApiError.notFound('Contest not found');

    // Questions, attempts and responses all cascade from the FK definitions
    // in migrations/20240110000001. Deleting a contest that people have
    // already sat therefore discards their attempts too — which is why the
    // admin UI steers towards Unpublish, and only offers Delete with a
    // confirm.
    await found.destroy({ transaction: t });
  });

  res.status(204).send();
});

// ---------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------

export const listQuestions = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { contestId } = req.params;

  const questions = await runInRequestContext(authUser, async (t) => {
    const contest = await Contest.findByPk(contestId, { transaction: t });
    if (!contest) throw ApiError.notFound('Contest not found');

    // Admins get the FULL row, hidden test cases and answer keys included —
    // that's the whole point of the authoring screen.
    return ContestQuestion.findAll({
      where: { contestId },
      order: [['sortOrder', 'ASC']],
      transaction: t,
    });
  });

  res.json({ questions });
});

export const createQuestion = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { contestId } = req.params;
  const body = questionSchema.parse(req.body);

  const question = await runInRequestContext(authUser, async (t) => {
    const contest = await Contest.findByPk(contestId, { transaction: t });
    if (!contest) throw ApiError.notFound('Contest not found');

    return ContestQuestion.create(
      {
        contestId,
        type: body.type,
        content: body.content,
        correctAnswer: 'correctAnswer' in body ? (body.correctAnswer ?? null) : null,
        topicTag: body.topicTag ?? null,
        section: body.section ?? null,
        sampleTestCases: 'sampleTestCases' in body ? body.sampleTestCases : [],
        hiddenTestCases: 'hiddenTestCases' in body ? body.hiddenTestCases : [],
        points: body.points,
        sortOrder: body.sortOrder,
      },
      { transaction: t },
    );
  });

  res.status(201).json(question);
});

export const updateQuestion = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { questionId } = req.params;
  const body = questionSchema.parse(req.body);

  const question = await runInRequestContext(authUser, async (t) => {
    const found = await ContestQuestion.findByPk(questionId, { transaction: t });
    if (!found) throw ApiError.notFound('Question not found');

    found.type = body.type;
    found.content = body.content;
    found.correctAnswer = 'correctAnswer' in body ? (body.correctAnswer ?? null) : null;
    found.topicTag = body.topicTag ?? null;
    found.section = body.section ?? null;
    found.sampleTestCases = 'sampleTestCases' in body ? body.sampleTestCases : [];
    found.hiddenTestCases = 'hiddenTestCases' in body ? body.hiddenTestCases : [];
    found.points = body.points;
    found.sortOrder = body.sortOrder;
    await found.save({ transaction: t });
    return found;
  });

  res.json(question);
});

export const deleteQuestion = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { questionId } = req.params;

  await runInRequestContext(authUser, async (t) => {
    const found = await ContestQuestion.findByPk(questionId, { transaction: t });
    if (!found) throw ApiError.notFound('Question not found');
    await found.destroy({ transaction: t });
  });

  res.status(204).send();
});
