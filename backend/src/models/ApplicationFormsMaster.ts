import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import type { ApplicationFormType } from './Job';

export type ApplicationFormFieldType = 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date';

/**
 * One field of a predefined (Simple/Detailed/Foreign) application form
 * template — seeded by migration, admin-editable is not built in Phase 5
 * (see FEATURE2_PHASE5_SUMMARY.md). `custom`-type jobs don't use this table
 * at all; their field list lives directly on jobs.customFormSchema instead.
 */
export interface ApplicationFormsMasterAttributes {
  id: string;
  formType: ApplicationFormType;
  fieldKey: string;
  fieldLabel: string;
  fieldType: ApplicationFormFieldType;
  isRequired: boolean;
  options: string[] | null;
  sortOrder: number;
  createdAt: Date;
}

type ApplicationFormsMasterCreationAttributes = Optional<
  ApplicationFormsMasterAttributes,
  'id' | 'isRequired' | 'options' | 'sortOrder' | 'createdAt'
>;

export class ApplicationFormsMaster
  extends Model<ApplicationFormsMasterAttributes, ApplicationFormsMasterCreationAttributes>
  implements ApplicationFormsMasterAttributes
{
  declare id: string;
  declare formType: ApplicationFormType;
  declare fieldKey: string;
  declare fieldLabel: string;
  declare fieldType: ApplicationFormFieldType;
  declare isRequired: boolean;
  declare options: string[] | null;
  declare sortOrder: number;
  declare createdAt: Date;
}

ApplicationFormsMaster.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    formType: {
      type: DataTypes.ENUM('simple', 'detailed', 'foreign', 'custom'),
      allowNull: false,
      field: 'form_type',
    },
    fieldKey: { type: DataTypes.STRING, allowNull: false, field: 'field_key' },
    fieldLabel: { type: DataTypes.STRING, allowNull: false, field: 'field_label' },
    fieldType: { type: DataTypes.STRING, allowNull: false, field: 'field_type' },
    isRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_required' },
    options: { type: DataTypes.JSONB, allowNull: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'sort_order' },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
  },
  {
    sequelize,
    modelName: 'ApplicationFormsMaster',
    tableName: 'application_forms_master',
    timestamps: false,
  },
);
