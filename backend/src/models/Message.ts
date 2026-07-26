import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type MessageSenderRole = 'company' | 'candidate';

export interface MessageAttributes {
  id: string;
  companyId: string;
  candidateId: string;
  senderRole: MessageSenderRole;
  body: string;
  createdAt: Date;
  readAt: Date | null;
}

type MessageCreationAttributes = Optional<
  MessageAttributes,
  'id' | 'createdAt' | 'readAt'
>;

export class Message
  extends Model<MessageAttributes, MessageCreationAttributes>
  implements MessageAttributes
{
  declare id: string;
  declare companyId: string;
  declare candidateId: string;
  declare senderRole: MessageSenderRole;
  declare body: string;
  declare readonly createdAt: Date;
  declare readAt: Date | null;
}

Message.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyId: { type: DataTypes.UUID, allowNull: false, field: 'company_id' },
    candidateId: { type: DataTypes.UUID, allowNull: false, field: 'candidate_id' },
    senderRole: {
      type: DataTypes.ENUM('company', 'candidate'),
      allowNull: false,
      field: 'sender_role',
    },
    body: { type: DataTypes.TEXT, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    readAt: { type: DataTypes.DATE, allowNull: true, field: 'read_at' },
  },
  {
    sequelize,
    modelName: 'Message',
    tableName: 'messages',
    timestamps: false,
  },
);
