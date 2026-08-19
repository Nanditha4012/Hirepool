import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type JobRoundResultDecision = 'pass' | 'fail' | 'hold';

/** One question's response within a round attempt — coding or mcq shaped
 * depending on the source question's type. Loosely typed (mirrors
 * ContestQuestionResponse.response) since the shape genuinely varies. */
export interface RoundSubmissionAnswer {
  questionSource: 'contest_question' | 'custom_coding_question' | 'mcq_master';
  questionId: string;
  language?: string;
  code?: string;
  passedCount?: number;
  totalCount?: number;
  compileError?: string | null;
  /** True only for an is_sql custom question — the result was computed by
   * the candidate's browser (sql.js), not verified server-side. */
  clientReported?: boolean;
  selectedOptionIndex?: number;
  isCorrect?: boolean;
  pointsEarned: number;
}

export interface RoundSubmissionDetail {
  answers: RoundSubmissionAnswer[];
  autoScore: number;
  maxScore: number;
}

export interface JobRoundResultAttributes {
  id: string;
  applicationId: string;
  roundId: string;
  result: JobRoundResultDecision | null;
  score: number | null;
  notes: string | null;
  submissionDetail: RoundSubmissionDetail | null;
  updatedBy: string | null;
  updatedAt: Date;
}

type JobRoundResultCreationAttributes = Optional<
  JobRoundResultAttributes,
  'id' | 'result' | 'score' | 'notes' | 'submissionDetail' | 'updatedBy' | 'updatedAt'
>;

export class JobRoundResult
  extends Model<JobRoundResultAttributes, JobRoundResultCreationAttributes>
  implements JobRoundResultAttributes
{
  declare id: string;
  declare applicationId: string;
  declare roundId: string;
  declare result: JobRoundResultDecision | null;
  declare score: number | null;
  declare notes: string | null;
  declare submissionDetail: RoundSubmissionDetail | null;
  declare updatedBy: string | null;
  declare updatedAt: Date;
}

JobRoundResult.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    applicationId: { type: DataTypes.UUID, allowNull: false, field: 'application_id' },
    roundId: { type: DataTypes.UUID, allowNull: false, field: 'round_id' },
    result: { type: DataTypes.ENUM('pass', 'fail', 'hold'), allowNull: true },
    score: { type: DataTypes.INTEGER, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    submissionDetail: { type: DataTypes.JSONB, allowNull: true, field: 'submission_detail' },
    updatedBy: { type: DataTypes.UUID, allowNull: true, field: 'updated_by' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  { sequelize, modelName: 'JobRoundResult', tableName: 'job_round_results', timestamps: false },
);
