import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type InterviewSessionStatus = 'scheduled' | 'completed' | 'cancelled';

export interface InterviewSessionAttributes {
  id: string;
  applicationId: string;
  roundId: string;
  meetingLink: string;
  scheduledAt: Date;
  status: InterviewSessionStatus;
  createdAt: Date;
}

type InterviewSessionCreationAttributes = Optional<
  InterviewSessionAttributes,
  'id' | 'status' | 'createdAt'
>;

export class InterviewSession
  extends Model<InterviewSessionAttributes, InterviewSessionCreationAttributes>
  implements InterviewSessionAttributes
{
  declare id: string;
  declare applicationId: string;
  declare roundId: string;
  declare meetingLink: string;
  declare scheduledAt: Date;
  declare status: InterviewSessionStatus;
  declare createdAt: Date;
}

InterviewSession.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    applicationId: { type: DataTypes.UUID, allowNull: false, field: 'application_id' },
    roundId: { type: DataTypes.UUID, allowNull: false, field: 'round_id' },
    meetingLink: { type: DataTypes.STRING, allowNull: false, field: 'meeting_link' },
    scheduledAt: { type: DataTypes.DATE, allowNull: false, field: 'scheduled_at' },
    status: {
      type: DataTypes.ENUM('scheduled', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'scheduled',
    },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
  },
  { sequelize, modelName: 'InterviewSession', tableName: 'interview_sessions', timestamps: false },
);
