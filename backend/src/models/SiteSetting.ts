import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Small admin-editable key/value store (app name, landing hero copy, FAQ,
 * Boost price placeholder). Primary key is the `key` string itself, not a
 * generated `id` — same non-uuid-PK shape as TotpSecret (PK = userId).
 */
export interface SiteSettingAttributes {
  key: string;
  value: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

type SiteSettingCreationAttributes = Optional<SiteSettingAttributes, 'value' | 'updatedAt' | 'updatedBy'>;

export class SiteSetting
  extends Model<SiteSettingAttributes, SiteSettingCreationAttributes>
  implements SiteSettingAttributes
{
  declare key: string;
  declare value: string | null;
  declare updatedAt: Date;
  declare updatedBy: string | null;
}

SiteSetting.init(
  {
    key: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    value: { type: DataTypes.TEXT, allowNull: true },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
    updatedBy: { type: DataTypes.UUID, allowNull: true, field: 'updated_by' },
  },
  {
    sequelize,
    modelName: 'SiteSetting',
    tableName: 'site_settings',
    timestamps: false,
  },
);
