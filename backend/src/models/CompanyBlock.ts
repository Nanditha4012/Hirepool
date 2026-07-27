import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface CompanyBlockAttributes {
  id: string;
  companyId: string;
  candidateId: string;
  reason: string | null;
  createdAt: Date;
}

type CompanyBlockCreationAttributes = Optional<
  CompanyBlockAttributes,
  'id' | 'reason' | 'createdAt'
>;

export class CompanyBlock
  extends Model<CompanyBlockAttributes, CompanyBlockCreationAttributes>
  implements CompanyBlockAttributes
{
  declare id: string;
  declare companyId: string;
  declare candidateId: string;
  declare reason: string | null;
  declare readonly createdAt: Date;
}

CompanyBlock.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyId: { type: DataTypes.UUID, allowNull: false, field: 'company_id' },
    candidateId: { type: DataTypes.UUID, allowNull: false, field: 'candidate_id' },
    reason: { type: DataTypes.TEXT, allowNull: true },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  },
  {
    sequelize,
    modelName: 'CompanyBlock',
    tableName: 'company_blocks',
    timestamps: false,
  },
);
