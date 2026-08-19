import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type JobRoundQuestionSource = 'contest_question' | 'custom_coding_question' | 'mcq_master';

/** Polymorphic link: which questions (from any of the three sources)
 * belong to a round — see the migration header note. No FK on questionId
 * since it points at three different tables depending on questionSource,
 * same pattern as verification_logs.targetType/targetId. */
export interface JobRoundQuestionAttributes {
  id: string;
  roundId: string;
  questionSource: JobRoundQuestionSource;
  questionId: string;
  points: number;
  sortOrder: number;
  createdAt: Date;
}

type JobRoundQuestionCreationAttributes = Optional<
  JobRoundQuestionAttributes,
  'id' | 'points' | 'sortOrder' | 'createdAt'
>;

export class JobRoundQuestion
  extends Model<JobRoundQuestionAttributes, JobRoundQuestionCreationAttributes>
  implements JobRoundQuestionAttributes
{
  declare id: string;
  declare roundId: string;
  declare questionSource: JobRoundQuestionSource;
  declare questionId: string;
  declare points: number;
  declare sortOrder: number;
  declare createdAt: Date;
}

JobRoundQuestion.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    roundId: { type: DataTypes.UUID, allowNull: false, field: 'round_id' },
    questionSource: {
      type: DataTypes.ENUM('contest_question', 'custom_coding_question', 'mcq_master'),
      allowNull: false,
      field: 'question_source',
    },
    questionId: { type: DataTypes.UUID, allowNull: false, field: 'question_id' },
    points: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'sort_order' },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
  },
  { sequelize, modelName: 'JobRoundQuestion', tableName: 'job_round_questions', timestamps: false },
);
