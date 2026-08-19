import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import type { RelevancyTier } from './CandidateRelevancyScore';

/**
 * Someone who applied to a job through its public careers link, with no
 * Hirepool account. See the header comment in migrations/20240122000001 for
 * why full_name/email are denormalized and why they're required on every
 * application form (including custom ones).
 */
export interface ExternalApplicantAttributes {
  id: string;
  jobId: string;
  formData: Record<string, unknown>;
  fullName: string | null;
  email: string;
  relevancyPercent: number | null;
  tier: RelevancyTier | null;
  appliedAt: Date;
  convertedCandidateId: string | null;
}

type ExternalApplicantCreationAttributes = Optional<
  ExternalApplicantAttributes,
  'id' | 'fullName' | 'relevancyPercent' | 'tier' | 'appliedAt' | 'convertedCandidateId'
>;

export class ExternalApplicant
  extends Model<ExternalApplicantAttributes, ExternalApplicantCreationAttributes>
  implements ExternalApplicantAttributes
{
  declare id: string;
  declare jobId: string;
  declare formData: Record<string, unknown>;
  declare fullName: string | null;
  declare email: string;
  declare relevancyPercent: number | null;
  declare tier: RelevancyTier | null;
  declare appliedAt: Date;
  declare convertedCandidateId: string | null;
}

ExternalApplicant.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    jobId: { type: DataTypes.UUID, allowNull: false, field: 'job_id' },
    formData: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'form_data' },
    fullName: { type: DataTypes.STRING, allowNull: true, field: 'full_name' },
    email: { type: DataTypes.STRING, allowNull: false },
    relevancyPercent: { type: DataTypes.INTEGER, allowNull: true, field: 'relevancy_percent' },
    tier: { type: DataTypes.ENUM('100_percent', '90_plus', '75_plus', '50_plus'), allowNull: true },
    appliedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'applied_at' },
    convertedCandidateId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'converted_candidate_id',
    },
  },
  {
    sequelize,
    modelName: 'ExternalApplicant',
    tableName: 'external_applicants',
    timestamps: false,
  },
);
