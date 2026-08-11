import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface CommunityAttributes {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type CommunityCreationAttributes = Optional<
  CommunityAttributes,
  'id' | 'description' | 'icon' | 'createdAt' | 'updatedAt'
>;

export class Community
  extends Model<CommunityAttributes, CommunityCreationAttributes>
  implements CommunityAttributes
{
  declare id: string;
  declare slug: string;
  declare name: string;
  declare description: string | null;
  declare icon: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Community.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    slug: { type: DataTypes.STRING, allowNull: false, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    icon: { type: DataTypes.STRING, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  {
    sequelize,
    modelName: 'Community',
    tableName: 'communities',
    timestamps: false,
  },
);
