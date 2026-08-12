import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One "like" by one user on one comment.
 *
 * Deliberately a twin of PostReaction rather than a shared polymorphic
 * `reactions(target_type, target_id)` table: a polymorphic FK cannot be a
 * real foreign key, so neither the cascade on delete nor the uniqueness would
 * be enforced by the database. Two small tables with proper constraints beat
 * one table with none. See the unique index in the migration.
 */
export interface CommentReactionAttributes {
  id: string;
  commentId: string;
  userId: string;
  createdAt: Date;
}

type CommentReactionCreationAttributes = Optional<
  CommentReactionAttributes,
  'id' | 'createdAt'
>;

export class CommentReaction
  extends Model<CommentReactionAttributes, CommentReactionCreationAttributes>
  implements CommentReactionAttributes
{
  declare id: string;
  declare commentId: string;
  declare userId: string;
  declare readonly createdAt: Date;
}

CommentReaction.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    commentId: { type: DataTypes.UUID, allowNull: false, field: 'comment_id' },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  },
  {
    sequelize,
    modelName: 'CommentReaction',
    tableName: 'comment_reactions',
    timestamps: false,
  },
);
