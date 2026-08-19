import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type RelevancyTier = '100_percent' | '90_plus' | '75_plus' | '50_plus';

/**
 * One candidate's deterministic relevancy score against one job. Unique on
 * (jobId, candidateId) — recompute upserts this row rather than
 * accumulating history (Phase 2 builds the actual scoring engine; this
 * model is schema-only for now).
 */
export interface CandidateRelevancyScoreAttributes {
  id: string;
  jobId: string;
  candidateId: string;
  relevancyPercent: number;
  tier: RelevancyTier;
  createdAt: Date;
  updatedAt: Date;
}

type CandidateRelevancyScoreCreationAttributes = Optional<
  CandidateRelevancyScoreAttributes,
  'id' | 'createdAt' | 'updatedAt'
>;

export class CandidateRelevancyScore
  extends Model<CandidateRelevancyScoreAttributes, CandidateRelevancyScoreCreationAttributes>
  implements CandidateRelevancyScoreAttributes
{
  declare id: string;
  declare jobId: string;
  declare candidateId: string;
  declare relevancyPercent: number;
  declare tier: RelevancyTier;
  declare createdAt: Date;
  declare updatedAt: Date;
}

CandidateRelevancyScore.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    jobId: { type: DataTypes.UUID, allowNull: false, field: 'job_id' },
    candidateId: { type: DataTypes.UUID, allowNull: false, field: 'candidate_id' },
    relevancyPercent: { type: DataTypes.INTEGER, allowNull: false, field: 'relevancy_percent' },
    tier: { type: DataTypes.ENUM('100_percent', '90_plus', '75_plus', '50_plus'), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  {
    sequelize,
    modelName: 'CandidateRelevancyScore',
    tableName: 'candidate_relevancy_scores',
    timestamps: false,
  },
);
