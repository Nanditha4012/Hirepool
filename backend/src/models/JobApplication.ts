import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type JobApplicationSource = 'internal' | 'external';
export type JobApplicationStatus = 'shortlisted' | 'rejected';

/**
 * One candidate/external-applicant committed to a job's pipeline — created
 * by either "Add to Job" (manual, from search) or bulk "Shortlist" (from a
 * relevancy batch or the external applicant list). Exactly one of
 * candidateId/externalApplicantId is set, matching `source` (enforced by a
 * DB CHECK constraint, not just application code — see
 * migrations/20240123000001).
 */
export interface JobApplicationAttributes {
  id: string;
  jobId: string;
  candidateId: string | null;
  externalApplicantId: string | null;
  source: JobApplicationSource;
  verifiedBadge: boolean;
  status: JobApplicationStatus;
  /** No FK yet — job_rounds doesn't exist until Phase 8. */
  currentRoundId: string | null;
  shortlistedAt: Date;
  updatedAt: Date;
}

type JobApplicationCreationAttributes = Optional<
  JobApplicationAttributes,
  'id' | 'candidateId' | 'externalApplicantId' | 'status' | 'currentRoundId' | 'shortlistedAt' | 'updatedAt'
>;

export class JobApplication
  extends Model<JobApplicationAttributes, JobApplicationCreationAttributes>
  implements JobApplicationAttributes
{
  declare id: string;
  declare jobId: string;
  declare candidateId: string | null;
  declare externalApplicantId: string | null;
  declare source: JobApplicationSource;
  declare verifiedBadge: boolean;
  declare status: JobApplicationStatus;
  declare currentRoundId: string | null;
  declare shortlistedAt: Date;
  declare updatedAt: Date;
}

JobApplication.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    jobId: { type: DataTypes.UUID, allowNull: false, field: 'job_id' },
    candidateId: { type: DataTypes.UUID, allowNull: true, field: 'candidate_id' },
    externalApplicantId: { type: DataTypes.UUID, allowNull: true, field: 'external_applicant_id' },
    source: { type: DataTypes.ENUM('internal', 'external'), allowNull: false },
    verifiedBadge: { type: DataTypes.BOOLEAN, allowNull: false, field: 'verified_badge' },
    status: {
      type: DataTypes.ENUM('shortlisted', 'rejected'),
      allowNull: false,
      defaultValue: 'shortlisted',
    },
    currentRoundId: { type: DataTypes.UUID, allowNull: true, field: 'current_round_id' },
    shortlistedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'shortlisted_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  { sequelize, modelName: 'JobApplication', tableName: 'job_applications', timestamps: false },
);
