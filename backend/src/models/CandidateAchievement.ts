import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type CandidateAchievementType = 'project' | 'research' | 'achievement';
export type CandidateAchievementVerificationStatus = 'pending' | 'verified' | 'rejected';

export interface CandidateAchievementAttributes {
  id: string;
  candidateId: string;
  type: CandidateAchievementType;
  title: string;
  description: string | null;
  links: string | null;
  certificateOrProofLink: string;
  verificationStatus: CandidateAchievementVerificationStatus;
  rejectionReason: string | null;
  createdAt: Date;
}

type CandidateAchievementCreationAttributes = Optional<
  CandidateAchievementAttributes,
  'id' | 'description' | 'links' | 'verificationStatus' | 'rejectionReason' | 'createdAt'
>;

export class CandidateAchievement
  extends Model<CandidateAchievementAttributes, CandidateAchievementCreationAttributes>
  implements CandidateAchievementAttributes
{
  declare id: string;
  declare candidateId: string;
  declare type: CandidateAchievementType;
  declare title: string;
  declare description: string | null;
  declare links: string | null;
  declare certificateOrProofLink: string;
  declare verificationStatus: CandidateAchievementVerificationStatus;
  declare rejectionReason: string | null;
  declare readonly createdAt: Date;
}

CandidateAchievement.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    candidateId: { type: DataTypes.UUID, allowNull: false, field: 'candidate_id' },
    type: {
      type: DataTypes.ENUM('project', 'research', 'achievement'),
      allowNull: false,
    },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    links: { type: DataTypes.TEXT, allowNull: true },
    certificateOrProofLink: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'certificate_or_proof_link',
    },
    verificationStatus: {
      type: DataTypes.ENUM('pending', 'verified', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'verification_status',
    },
    rejectionReason: { type: DataTypes.TEXT, allowNull: true, field: 'rejection_reason' },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
  },
  {
    sequelize,
    modelName: 'CandidateAchievement',
    tableName: 'candidate_achievements',
    timestamps: false,
  },
);
