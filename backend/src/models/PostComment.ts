import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

/** One message in a post's discussion thread. */
export interface PostCommentAttributes {
  id: string;
  postId: string;
  userId: string;
  /** Snapshot of the commenter, for the same reason as FeedPost.authorName. */
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: Date;
}

type PostCommentCreationAttributes = Optional<PostCommentAttributes, 'id' | 'createdAt'>;

export class PostComment
  extends Model<PostCommentAttributes, PostCommentCreationAttributes>
  implements PostCommentAttributes
{
  declare id: string;
  declare postId: string;
  declare userId: string;
  declare authorName: string;
  declare authorRole: string;
  declare body: string;
  declare readonly createdAt: Date;
}

PostComment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    postId: { type: DataTypes.UUID, allowNull: false, field: 'post_id' },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    authorName: { type: DataTypes.STRING, allowNull: false, field: 'author_name' },
    authorRole: { type: DataTypes.STRING, allowNull: false, field: 'author_role' },
    body: { type: DataTypes.TEXT, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
  },
  {
    sequelize,
    modelName: 'PostComment',
    tableName: 'post_comments',
    timestamps: false,
  },
);
