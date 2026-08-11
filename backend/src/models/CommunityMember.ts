import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface CommunityMemberAttributes {
  id: string;
  communityId: string;
  userId: string;
  createdAt: Date;
}

type CommunityMemberCreationAttributes = Optional<CommunityMemberAttributes, 'id' | 'createdAt'>;

export class CommunityMember
  extends Model<CommunityMemberAttributes, CommunityMemberCreationAttributes>
  implements CommunityMemberAttributes
{
  declare id: string;
  declare communityId: string;
  declare userId: string;
  declare readonly createdAt: Date;
}

CommunityMember.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    communityId: { type: DataTypes.UUID, allowNull: false, field: 'community_id' },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
  },
  {
    sequelize,
    modelName: 'CommunityMember',
    tableName: 'community_members',
    timestamps: false,
  },
);
