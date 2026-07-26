import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface PlatformBadgeMasterAttributes {
  id: string;
  platformName: string;
  badgeName: string;
  sortOrder: number;
}

type PlatformBadgeMasterCreationAttributes = Optional<
  PlatformBadgeMasterAttributes,
  'id' | 'sortOrder'
>;

export class PlatformBadgeMaster
  extends Model<PlatformBadgeMasterAttributes, PlatformBadgeMasterCreationAttributes>
  implements PlatformBadgeMasterAttributes
{
  declare id: string;
  declare platformName: string;
  declare badgeName: string;
  declare sortOrder: number;
}

PlatformBadgeMaster.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    platformName: { type: DataTypes.STRING, allowNull: false, field: 'platform_name' },
    badgeName: { type: DataTypes.STRING, allowNull: false, field: 'badge_name' },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'sort_order' },
  },
  {
    sequelize,
    modelName: 'PlatformBadgeMaster',
    tableName: 'platform_badges_master',
    timestamps: false,
  },
);
