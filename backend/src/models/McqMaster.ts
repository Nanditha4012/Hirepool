import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

/** Public/admin-curated bank when companyId is null; a company's own
 * job-specific MCQ otherwise — see the migration header note for why this
 * one table serves both instead of two. */
export interface McqMasterAttributes {
  id: string;
  conceptOrLanguage: string;
  question: string;
  options: string[];
  correctAnswer: number;
  companyId: string | null;
  jobId: string | null;
  createdAt: Date;
}

type McqMasterCreationAttributes = Optional<
  McqMasterAttributes,
  'id' | 'companyId' | 'jobId' | 'createdAt'
>;

export class McqMaster
  extends Model<McqMasterAttributes, McqMasterCreationAttributes>
  implements McqMasterAttributes
{
  declare id: string;
  declare conceptOrLanguage: string;
  declare question: string;
  declare options: string[];
  declare correctAnswer: number;
  declare companyId: string | null;
  declare jobId: string | null;
  declare createdAt: Date;
}

McqMaster.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    conceptOrLanguage: { type: DataTypes.STRING, allowNull: false, field: 'concept_or_language' },
    question: { type: DataTypes.TEXT, allowNull: false },
    options: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    correctAnswer: { type: DataTypes.INTEGER, allowNull: false, field: 'correct_answer' },
    companyId: { type: DataTypes.UUID, allowNull: true, field: 'company_id' },
    jobId: { type: DataTypes.UUID, allowNull: true, field: 'job_id' },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
  },
  { sequelize, modelName: 'McqMaster', tableName: 'mcq_master', timestamps: false },
);
