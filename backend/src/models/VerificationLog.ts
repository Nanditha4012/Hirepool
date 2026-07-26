import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type VerificationTargetType = 'candidate_profile' | 'platform_badge' | 'achievement';
export type VerificationDecision =
  | 'approved'
  | 'rejected'
  | 'needs_info'
  | 'flagged'
  | 'verified'
  | 'incorrect';

export interface VerificationLogAttributes {
  id: string;
  reviewerId: string;
  targetType: VerificationTargetType;
  targetId: string;
  decision: VerificationDecision;
  notes: string | null;
  createdAt: Date;
}

type VerificationLogCreationAttributes = Optional<
  VerificationLogAttributes,
  'id' | 'notes' | 'createdAt'
>;

export class VerificationLog
  extends Model<VerificationLogAttributes, VerificationLogCreationAttributes>
  implements VerificationLogAttributes
{
  declare id: string;
  declare reviewerId: string;
  declare targetType: VerificationTargetType;
  declare targetId: string;
  declare decision: VerificationDecision;
  declare notes: string | null;
  declare readonly createdAt: Date;
}

VerificationLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    reviewerId: { type: DataTypes.UUID, allowNull: false, field: 'reviewer_id' },
    targetType: {
      type: DataTypes.ENUM('candidate_profile', 'platform_badge', 'achievement'),
      allowNull: false,
      field: 'target_type',
    },
    targetId: { type: DataTypes.UUID, allowNull: false, field: 'target_id' },
    decision: {
      type: DataTypes.ENUM(
        'approved',
        'rejected',
        'needs_info',
        'flagged',
        'verified',
        'incorrect',
      ),
      allowNull: false,
    },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
  },
  {
    sequelize,
    modelName: 'VerificationLog',
    tableName: 'verification_logs',
    timestamps: false,
  },
);
