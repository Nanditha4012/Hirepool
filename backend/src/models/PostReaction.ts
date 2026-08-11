import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

/** One "like" by one user on one post — see the unique index in the migration. */
export interface PostReactionAttributes {
  id: string;
  postId: string;
  userId: string;
  createdAt: Date;
}

type PostReactionCreationAttributes = Optional<PostReactionAttributes, 'id' | 'createdAt'>;

export class PostReaction
  extends Model<PostReactionAttributes, PostReactionCreationAttributes>
  implements PostReactionAttributes
{
  declare id: string;
  declare postId: string;
  declare userId: string;
  declare readonly createdAt: Date;
}

PostReaction.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    postId: { type: DataTypes.UUID, allowNull: false, field: 'post_id' },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
  },
  {
    sequelize,
    modelName: 'PostReaction',
    tableName: 'post_reactions',
    timestamps: false,
  },
);
