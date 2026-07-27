import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type CandidatePlatformBadgeVerificationStatus = 'pending' | 'verified' | 'rejected';

export interface CandidatePlatformBadgeAttributes {
  id: string;
  candidateId: string;
  platformName: string;
  badgeSelected: string;
  platformProfileLink: string;
  verificationStatus: CandidatePlatformBadgeVerificationStatus;
  rejectionReason: string | null;
  totalQuestionsSolved: number;
  createdAt: Date;
  updatedAt: Date;
}

type CandidatePlatformBadgeCreationAttributes = Optional<
  CandidatePlatformBadgeAttributes,
  'id' | 'verificationStatus' | 'rejectionReason' | 'totalQuestionsSolved' | 'createdAt' | 'updatedAt'
>;

export class CandidatePlatformBadge
  extends Model<CandidatePlatformBadgeAttributes, CandidatePlatformBadgeCreationAttributes>
  implements CandidatePlatformBadgeAttributes
{
  declare id: string;
  declare candidateId: string;
  declare platformName: string;
  declare badgeSelected: string;
  declare platformProfileLink: string;
  declare verificationStatus: CandidatePlatformBadgeVerificationStatus;
  declare rejectionReason: string | null;
  declare totalQuestionsSolved: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

CandidatePlatformBadge.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    candidateId: { type: DataTypes.UUID, allowNull: false, field: 'candidate_id' },
    platformName: { type: DataTypes.STRING, allowNull: false, field: 'platform_name' },
    badgeSelected: { type: DataTypes.STRING, allowNull: false, field: 'badge_selected' },
    platformProfileLink: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'platform_profile_link',
    },
    verificationStatus: {
      type: DataTypes.ENUM('pending', 'verified', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'verification_status',
    },
    rejectionReason: { type: DataTypes.TEXT, allowNull: true, field: 'rejection_reason' },
    totalQuestionsSolved: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'total_questions_solved',
    },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  {
    sequelize,
    modelName: 'CandidatePlatformBadge',
    tableName: 'candidate_platform_badges',
    timestamps: false,
  },
);
