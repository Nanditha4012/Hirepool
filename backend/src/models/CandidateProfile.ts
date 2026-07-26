import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type CandidateCategory = 'fresher' | 'experienced' | 'executive';
export type CandidateStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'needs_info';

export interface CandidateProfileAttributes {
  id: string;
  userId: string;
  category: CandidateCategory | null;
  status: CandidateStatus;
  createdAt: Date;
  updatedAt: Date;
}

type CandidateProfileCreationAttributes = Optional<
  CandidateProfileAttributes,
  'id' | 'category' | 'status' | 'createdAt' | 'updatedAt'
>;

export class CandidateProfile
  extends Model<CandidateProfileAttributes, CandidateProfileCreationAttributes>
  implements CandidateProfileAttributes
{
  declare id: string;
  declare userId: string;
  declare category: CandidateCategory | null;
  declare status: CandidateStatus;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

CandidateProfile.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id', unique: true },
    category: {
      type: DataTypes.ENUM('fresher', 'experienced', 'executive'),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(
        'draft',
        'submitted',
        'under_review',
        'approved',
        'rejected',
        'needs_info',
      ),
      allowNull: false,
      defaultValue: 'draft',
    },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  {
    sequelize,
    modelName: 'CandidateProfile',
    tableName: 'candidate_profiles',
    timestamps: false,
  },
);
