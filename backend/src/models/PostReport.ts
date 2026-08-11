import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One "this looks like a scam" flag by one user on one post.
 *
 * `userId` is readable by anyone at the row level (the count has to be — see
 * the RLS note in 20240113000001-social-module.js), so it must never be
 * serialised to a non-admin. feedController is the only place these rows are
 * shaped for a response.
 */
export interface PostReportAttributes {
  id: string;
  postId: string;
  userId: string;
  reason: string | null;
  createdAt: Date;
}

type PostReportCreationAttributes = Optional<PostReportAttributes, 'id' | 'reason' | 'createdAt'>;

export class PostReport
  extends Model<PostReportAttributes, PostReportCreationAttributes>
  implements PostReportAttributes
{
  declare id: string;
  declare postId: string;
  declare userId: string;
  declare reason: string | null;
  declare readonly createdAt: Date;
}

PostReport.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    postId: { type: DataTypes.UUID, allowNull: false, field: 'post_id' },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    reason: { type: DataTypes.TEXT, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
  },
  {
    sequelize,
    modelName: 'PostReport',
    tableName: 'post_reports',
    timestamps: false,
  },
);
