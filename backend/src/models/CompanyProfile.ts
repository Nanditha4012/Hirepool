import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type CompanySize = '1-10' | '11-50' | '51-200' | '201-1000' | '1000+';

export interface CompanyProfileAttributes {
  id: string;
  userId: string;
  companyName: string;
  domain: string | null;
  verified: boolean;
  logoLink: string | null;
  website: string | null;
  industry: string | null;
  size: CompanySize | null;
  gstNumber: string | null;
  planId: string | null;
  remainingUnlocks: number;
  unlocksResetAt: Date | null;
  messagesSentThisPeriod: number;
  messagesPeriodResetAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type CompanyProfileCreationAttributes = Optional<
  CompanyProfileAttributes,
  | 'id'
  | 'domain'
  | 'verified'
  | 'logoLink'
  | 'website'
  | 'industry'
  | 'size'
  | 'gstNumber'
  | 'planId'
  | 'remainingUnlocks'
  | 'unlocksResetAt'
  | 'messagesSentThisPeriod'
  | 'messagesPeriodResetAt'
  | 'createdAt'
  | 'updatedAt'
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
  declare logoLink: string | null;
  declare website: string | null;
  declare industry: string | null;
  declare size: CompanySize | null;
  declare gstNumber: string | null;
  declare planId: string | null;
  declare remainingUnlocks: number;
  declare unlocksResetAt: Date | null;
  declare messagesSentThisPeriod: number;
  declare messagesPeriodResetAt: Date | null;
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
    logoLink: { type: DataTypes.STRING, allowNull: true, field: 'logo_link' },
    website: { type: DataTypes.STRING, allowNull: true },
    industry: { type: DataTypes.STRING, allowNull: true },
    size: {
      type: DataTypes.ENUM('1-10', '11-50', '51-200', '201-1000', '1000+'),
      allowNull: true,
    },
    gstNumber: { type: DataTypes.STRING, allowNull: true, field: 'gst_number' },
    planId: { type: DataTypes.UUID, allowNull: true, field: 'plan_id' },
    remainingUnlocks: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'remaining_unlocks',
    },
    unlocksResetAt: { type: DataTypes.DATE, allowNull: true, field: 'unlocks_reset_at' },
    messagesSentThisPeriod: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'messages_sent_this_period',
    },
    messagesPeriodResetAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'messages_period_reset_at',
    },
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
