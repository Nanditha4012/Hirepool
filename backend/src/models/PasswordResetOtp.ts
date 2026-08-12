import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface PasswordResetOtpAttributes {
  id: string;
  userId: string;
  otpHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  createdAt: Date;
}

type PasswordResetOtpCreationAttributes = Optional<
  PasswordResetOtpAttributes,
  'id' | 'attempts' | 'consumedAt' | 'createdAt'
>;

export class PasswordResetOtp
  extends Model<PasswordResetOtpAttributes, PasswordResetOtpCreationAttributes>
  implements PasswordResetOtpAttributes
{
  declare id: string;
  declare userId: string;
  declare otpHash: string;
  declare expiresAt: Date;
  declare attempts: number;
  declare consumedAt: Date | null;
  declare readonly createdAt: Date;
}

PasswordResetOtp.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    otpHash: { type: DataTypes.STRING, allowNull: false, field: 'otp_hash' },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    consumedAt: { type: DataTypes.DATE, allowNull: true, field: 'consumed_at' },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  },
  {
    sequelize,
    modelName: 'PasswordResetOtp',
    tableName: 'password_reset_otps',
    timestamps: false,
  },
);
