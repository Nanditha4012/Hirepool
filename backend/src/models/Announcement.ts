import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type AnnouncementAudience = 'all' | 'candidate' | 'company' | 'verifier';

export interface AnnouncementAttributes {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  createdBy: string;
  createdAt: Date;
}

type AnnouncementCreationAttributes = Optional<AnnouncementAttributes, 'id' | 'createdAt'>;

export class Announcement
  extends Model<AnnouncementAttributes, AnnouncementCreationAttributes>
  implements AnnouncementAttributes
{
  declare id: string;
  declare title: string;
  declare body: string;
  declare audience: AnnouncementAudience;
  declare createdBy: string;
  declare readonly createdAt: Date;
}

Announcement.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    title: { type: DataTypes.STRING, allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    audience: {
      type: DataTypes.ENUM('all', 'candidate', 'company', 'verifier'),
      allowNull: false,
    },
    createdBy: { type: DataTypes.UUID, allowNull: false, field: 'created_by' },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
  },
  {
    sequelize,
    modelName: 'Announcement',
    tableName: 'announcements',
    timestamps: false,
  },
);
