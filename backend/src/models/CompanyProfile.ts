import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface CompanyProfileAttributes {
  id: string;
  userId: string;
  companyName: string;
  domain: string | null;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type CompanyProfileCreationAttributes = Optional<
  CompanyProfileAttributes,
  'id' | 'domain' | 'verified' | 'createdAt' | 'updatedAt'
>;

export class CompanyProfile
  extends Model<CompanyProfileAttributes, CompanyProfileCreationAttributes>
  implements CompanyProfileAttributes
{
  declare id: string;
  declare userId: string;
  declare companyName: string;
  declare domain: string | null;
  declare verified: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

CompanyProfile.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id', unique: true },
    companyName: { type: DataTypes.STRING, allowNull: false, field: 'company_name' },
    domain: { type: DataTypes.STRING, allowNull: true },
    verified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  {
    sequelize,
    modelName: 'CompanyProfile',
    tableName: 'company_profiles',
    timestamps: false,
  },
);
