import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type JobStatus = 'open' | 'closed';
export type ApplicationFormType = 'simple' | 'detailed' | 'foreign' | 'custom';

/** One field in a company-built custom application form. Shares its
 * `type`/`options` vocabulary with application_forms_master's `field_type`/
 * `options` columns so the careers-page renderer (Phase 6) treats a preset
 * template and a custom schema identically. */
export interface CustomFormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date';
  required: boolean;
  options?: string[];
  sortOrder: number;
}

/**
 * A company's job posting. Started lean in Feature 1 Phase 1 (id/companyId/
 * title/description/timestamps); Feature 2 Phase 5 adds the ATS/careers-page
 * columns below additively.
 */
export interface JobAttributes {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  /** Company's own external tracking id — optional, unique per company
   * (not globally). Feature 1-only jobs never set this. */
  customJobId: string | null;
  status: JobStatus;
  /** Set by a separate "generate careers link" action, not at creation —
   * see jdController.generateCareersLink. Null until then. */
  careersLinkSlug: string | null;
  formType: ApplicationFormType | null;
  /** Only populated when formType === 'custom'. */
  customFormSchema: CustomFormField[] | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type JobCreationAttributes = Optional<
  JobAttributes,
  | 'id'
  | 'description'
  | 'customJobId'
  | 'status'
  | 'careersLinkSlug'
  | 'formType'
  | 'customFormSchema'
  | 'closedAt'
  | 'createdAt'
  | 'updatedAt'
>;

export class Job extends Model<JobAttributes, JobCreationAttributes> implements JobAttributes {
  declare id: string;
  declare companyId: string;
  declare title: string;
  declare description: string | null;
  declare customJobId: string | null;
  declare status: JobStatus;
  declare careersLinkSlug: string | null;
  declare formType: ApplicationFormType | null;
  declare customFormSchema: CustomFormField[] | null;
  declare closedAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

Job.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyId: { type: DataTypes.UUID, allowNull: false, field: 'company_id' },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    customJobId: { type: DataTypes.STRING, allowNull: true, field: 'custom_job_id' },
    status: { type: DataTypes.ENUM('open', 'closed'), allowNull: false, defaultValue: 'open' },
    careersLinkSlug: { type: DataTypes.STRING, allowNull: true, field: 'careers_link_slug' },
    formType: {
      type: DataTypes.ENUM('simple', 'detailed', 'foreign', 'custom'),
      allowNull: true,
      field: 'form_type',
    },
    customFormSchema: { type: DataTypes.JSONB, allowNull: true, field: 'custom_form_schema' },
    closedAt: { type: DataTypes.DATE, allowNull: true, field: 'closed_at' },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  { sequelize, modelName: 'Job', tableName: 'jobs', timestamps: false },
);
