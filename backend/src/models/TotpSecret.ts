import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface TotpSecretAttributes {
  userId: string;
  secret: string;
  enabledAt: Date | null;
}

type TotpSecretCreationAttributes = Optional<TotpSecretAttributes, 'enabledAt'>;

export class TotpSecret
  extends Model<TotpSecretAttributes, TotpSecretCreationAttributes>
  implements TotpSecretAttributes
{
  declare userId: string;
  declare secret: string;
  declare enabledAt: Date | null;
}

TotpSecret.init(
  {
    userId: {
      type: DataTypes.UUID,
      primaryKey: true,
      field: 'user_id',
    },
    secret: { type: DataTypes.STRING, allowNull: false },
    enabledAt: { type: DataTypes.DATE, allowNull: true, field: 'enabled_at' },
  },
  {
    sequelize,
    modelName: 'TotpSecret',
    tableName: 'user_totp_secrets',
    timestamps: false,
  },
);
