import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

/** One executed test case, as reported back from Piston. */
export interface CodeRunCase {
  passed: boolean;
  stdin?: string;
  expectedOutput?: string;
  actualOutput?: string;
  stderr?: string;
  /** Hidden cases report pass/fail only — never their input or expected output. */
  hidden?: boolean;
}

export interface CodeRunResults {
  language?: string;
  cases: CodeRunCase[];
  passedCount: number;
  totalCount: number;
  compileError?: string | null;
}

export interface ContestQuestionResponseAttributes {
  id: string;
  attemptId: string;
  questionId: string;
  /** `{ index }` for MCQ, `{ order }` / `{ blanks }` / `{ answers }` for interactive, `{ language, source }` for coding. */
  response: Record<string, unknown> | null;
  isCorrect: boolean;
  score: number;
  codeRunResults: CodeRunResults | null;
  updatedAt: Date;
}

type ContestQuestionResponseCreationAttributes = Optional<
  ContestQuestionResponseAttributes,
  'id' | 'response' | 'isCorrect' | 'score' | 'codeRunResults' | 'updatedAt'
>;

export class ContestQuestionResponse
  extends Model<ContestQuestionResponseAttributes, ContestQuestionResponseCreationAttributes>
  implements ContestQuestionResponseAttributes
{
  declare id: string;
  declare attemptId: string;
  declare questionId: string;
  declare response: Record<string, unknown> | null;
  declare isCorrect: boolean;
  declare score: number;
  declare codeRunResults: CodeRunResults | null;
  declare updatedAt: Date;
}

ContestQuestionResponse.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    attemptId: { type: DataTypes.UUID, allowNull: false, field: 'attempt_id' },
    questionId: { type: DataTypes.UUID, allowNull: false, field: 'question_id' },
    response: { type: DataTypes.JSONB, allowNull: true },
    isCorrect: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_correct' },
    score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    codeRunResults: { type: DataTypes.JSONB, allowNull: true, field: 'code_run_results' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  {
    sequelize,
    modelName: 'ContestQuestionResponse',
    tableName: 'contest_question_responses',
    timestamps: false,
  },
);
