import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

/** Quant only: points earned per section, keyed by section name. */
export type SectionScores = Record<string, { score: number; max: number }>;

export interface ContestAttemptAttributes {
  id: string;
  candidateId: string;
  contestId: string;
  score: number;
  /**
   * Snapshotted from the contest's questions when the attempt starts. An
   * admin editing the test afterwards must not silently change the
   * denominator of an attempt that has already been sat and graded.
   */
  maxScore: number;
  sectionScores: SectionScores;
  timeTakenSeconds: number | null;
  startedAt: Date;
  /** NULL while in progress. */
  submittedAt: Date | null;
}

type ContestAttemptCreationAttributes = Optional<
  ContestAttemptAttributes,
  'id' | 'score' | 'maxScore' | 'sectionScores' | 'timeTakenSeconds' | 'startedAt' | 'submittedAt'
>;

export class ContestAttempt
  extends Model<ContestAttemptAttributes, ContestAttemptCreationAttributes>
  implements ContestAttemptAttributes
{
  declare id: string;
  declare candidateId: string;
  declare contestId: string;
  declare score: number;
  declare maxScore: number;
  declare sectionScores: SectionScores;
  declare timeTakenSeconds: number | null;
  declare startedAt: Date;
  declare submittedAt: Date | null;
}

ContestAttempt.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    candidateId: { type: DataTypes.UUID, allowNull: false, field: 'candidate_id' },
    contestId: { type: DataTypes.UUID, allowNull: false, field: 'contest_id' },
    score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    maxScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'max_score' },
    sectionScores: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'section_scores' },
    timeTakenSeconds: { type: DataTypes.INTEGER, allowNull: true, field: 'time_taken_seconds' },
    startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'started_at' },
    submittedAt: { type: DataTypes.DATE, allowNull: true, field: 'submitted_at' },
  },
  { sequelize, modelName: 'ContestAttempt', tableName: 'contest_attempts', timestamps: false },
);
