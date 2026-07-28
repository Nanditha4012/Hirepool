import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface VerifierInviteAttributes {
  id: string;
  email: string;
  invitedBy: string;
  createdAt: Date;
  consumedAt: Date | null;
  consumedByUserId: string | null;
}

type VerifierInviteCreationAttributes = Optional<
  VerifierInviteAttributes,
  'id' | 'createdAt' | 'consumedAt' | 'consumedByUserId'
>;

export class VerifierInvite
  extends Model<VerifierInviteAttributes, VerifierInviteCreationAttributes>
  implements VerifierInviteAttributes
{
  declare id: string;
  declare email: string;
  declare invitedBy: string;
  declare readonly createdAt: Date;
  declare consumedAt: Date | null;
  declare consumedByUserId: string | null;
}

VerifierInvite.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    invitedBy: { type: DataTypes.UUID, allowNull: false, field: 'invited_by' },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    consumedAt: { type: DataTypes.DATE, allowNull: true, field: 'consumed_at' },
    consumedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'consumed_by_user_id' },
  },
  {
    sequelize,
    modelName: 'VerifierInvite',
    tableName: 'verifier_invites',
    timestamps: false,
  },
);
