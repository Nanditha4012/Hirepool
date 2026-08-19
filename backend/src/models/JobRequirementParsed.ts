import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type JobRequirementParseStatus = 'pending' | 'success' | 'failed' | 'unavailable';

/**
 * The Groq-extracted structured requirement set for one job, keyed 1:1 on
 * jobId (unique) and upserted in place whenever the JD is (re)parsed —
 * see utils/groq.ts for the extraction call this stores the result of.
 */
export interface JobRequirementParsedAttributes {
  id: string;
  jobId: string;
  extractedSkills: string[];
  extractedRole: string | null;
  extractedExperienceLevel: number | null;
  extractedDomain: string | null;
  parseStatus: JobRequirementParseStatus;
  parseError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type JobRequirementParsedCreationAttributes = Optional<
  JobRequirementParsedAttributes,
  | 'id'
  | 'extractedSkills'
  | 'extractedRole'
  | 'extractedExperienceLevel'
  | 'extractedDomain'
  | 'parseStatus'
  | 'parseError'
  | 'createdAt'
  | 'updatedAt'
>;

export class JobRequirementParsed
  extends Model<JobRequirementParsedAttributes, JobRequirementParsedCreationAttributes>
  implements JobRequirementParsedAttributes
{
  declare id: string;
  declare jobId: string;
  declare extractedSkills: string[];
  declare extractedRole: string | null;
  declare extractedExperienceLevel: number | null;
  declare extractedDomain: string | null;
  declare parseStatus: JobRequirementParseStatus;
  declare parseError: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

JobRequirementParsed.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    jobId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'job_id' },
    extractedSkills: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'extracted_skills',
    },
    extractedRole: { type: DataTypes.STRING, allowNull: true, field: 'extracted_role' },
    extractedExperienceLevel: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'extracted_experience_level',
    },
    extractedDomain: { type: DataTypes.STRING, allowNull: true, field: 'extracted_domain' },
    parseStatus: {
      type: DataTypes.ENUM('pending', 'success', 'failed', 'unavailable'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'parse_status',
    },
    parseError: { type: DataTypes.TEXT, allowNull: true, field: 'parse_error' },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  {
    sequelize,
    modelName: 'JobRequirementParsed',
    tableName: 'job_requirements_parsed',
    timestamps: false,
  },
);
