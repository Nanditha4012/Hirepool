import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface NotificationAttributes {
  id: string;
  userId: string;
  type: string;
  message: string;
  link: string | null;
  createdAt: Date;
  readAt: Date | null;
}

type NotificationCreationAttributes = Optional<
  NotificationAttributes,
  'id' | 'link' | 'createdAt' | 'readAt'
>;

export class Notification
  extends Model<NotificationAttributes, NotificationCreationAttributes>
  implements NotificationAttributes
{
  declare id: string;
  declare userId: string;
  declare type: string;
  declare message: string;
  declare link: string | null;
  declare readonly createdAt: Date;
  declare readAt: Date | null;
}

Notification.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    type: { type: DataTypes.STRING, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    link: { type: DataTypes.STRING, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    readAt: { type: DataTypes.DATE, allowNull: true, field: 'read_at' },
  },
  {
    sequelize,
    modelName: 'Notification',
    tableName: 'notifications',
    timestamps: false,
  },
);
