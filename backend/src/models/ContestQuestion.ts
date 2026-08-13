import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type ContestQuestionType = 'coding' | 'mcq' | 'interactive';
export type ContestSection = 'math' | 'reasoning' | 'english';

/** One visible-to-the-candidate example, shown in the problem statement. */
export interface SampleTestCase {
  stdin: string;
  expectedOutput: string;
  explanation?: string;
}

/** A grading case. Never sent to a candidate — see toCandidateQuestion. */
export interface HiddenTestCase {
  stdin: string;
  expectedOutput: string;
}

/**
 * `content` is JSONB because the three question types genuinely carry
 * different fields, and modelling that as one wide table of mostly-null
 * columns (statement, constraints, starterCode, options, blanks, orderItems,
 * parts…) would be worse in every direction. The controller validates each
 * shape with a zod schema on write, so the looseness stops at the API edge.
 */
export interface CodingContent {
  statement: string;
  constraints?: string;
  /** Per-language starting scaffold, keyed by code-runner language id. */
  starterCode?: Record<string, string>;
  timeLimitSeconds?: number;
  memoryLimitMb?: number;
}

export interface McqContent {
  question: string;
  options: string[];
  explanation?: string;
}

export type InteractiveKind = 'drag_drop' | 'fill_blank' | 'scenario';

export interface InteractiveContent {
  interactiveKind: InteractiveKind;
  question: string;
  /** drag_drop: the shuffled items the candidate reorders. */
  items?: string[];
  /** fill_blank: the snippet, with `___` marking each blank. */
  snippet?: string;
  /** scenario: multiple sub-questions answered together. */
  parts?: { prompt: string; options: string[] }[];
  explanation?: string;
}

export type ContestQuestionContent = CodingContent | McqContent | InteractiveContent;

export interface ContestQuestionAttributes {
  id: string;
  contestId: string;
  type: ContestQuestionType;
  content: ContestQuestionContent;
  /**
   * Shape mirrors the question type: `{ index: number }` for MCQ,
   * `{ order: string[] }` / `{ blanks: string[] }` / `{ answers: number[] }`
   * for the interactive kinds, and null for coding (graded by test cases).
   */
  correctAnswer: Record<string, unknown> | null;
  topicTag: string | null;
  section: ContestSection | null;
  sampleTestCases: SampleTestCase[];
  hiddenTestCases: HiddenTestCase[];
  points: number;
  sortOrder: number;
  createdAt: Date;
}

type ContestQuestionCreationAttributes = Optional<
  ContestQuestionAttributes,
  | 'id'
  | 'correctAnswer'
  | 'topicTag'
  | 'section'
  | 'sampleTestCases'
  | 'hiddenTestCases'
  | 'points'
  | 'sortOrder'
  | 'createdAt'
>;

export class ContestQuestion
  extends Model<ContestQuestionAttributes, ContestQuestionCreationAttributes>
  implements ContestQuestionAttributes
{
  declare id: string;
  declare contestId: string;
  declare type: ContestQuestionType;
  declare content: ContestQuestionContent;
  declare correctAnswer: Record<string, unknown> | null;
  declare topicTag: string | null;
  declare section: ContestSection | null;
  declare sampleTestCases: SampleTestCase[];
  declare hiddenTestCases: HiddenTestCase[];
  declare points: number;
  declare sortOrder: number;
  declare createdAt: Date;
}

ContestQuestion.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    contestId: { type: DataTypes.UUID, allowNull: false, field: 'contest_id' },
    type: { type: DataTypes.ENUM('coding', 'mcq', 'interactive'), allowNull: false },
    content: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    correctAnswer: { type: DataTypes.JSONB, allowNull: true, field: 'correct_answer' },
    topicTag: { type: DataTypes.STRING, allowNull: true, field: 'topic_tag' },
    section: { type: DataTypes.ENUM('math', 'reasoning', 'english'), allowNull: true },
    sampleTestCases: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'sample_test_cases',
    },
    hiddenTestCases: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'hidden_test_cases',
    },
    points: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'sort_order' },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
  },
  { sequelize, modelName: 'ContestQuestion', tableName: 'contest_questions', timestamps: false },
);
