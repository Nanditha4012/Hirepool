import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface AdminAuditLogAttributes {
  id: string;
  adminId: string;
  action: string;
  target: string | null;
  createdAt: Date;
}

type AdminAuditLogCreationAttributes = Optional<
  AdminAuditLogAttributes,
  'id' | 'target' | 'createdAt'
>;

export class AdminAuditLog
  extends Model<AdminAuditLogAttributes, AdminAuditLogCreationAttributes>
  implements AdminAuditLogAttributes
{
  declare id: string;
  declare adminId: string;
  declare action: string;
  declare target: string | null;
  declare readonly createdAt: Date;
}

AdminAuditLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    adminId: { type: DataTypes.UUID, allowNull: false, field: 'admin_id' },
    action: { type: DataTypes.STRING, allowNull: false },
    target: { type: DataTypes.STRING, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
  },
  {
    sequelize,
    modelName: 'AdminAuditLog',
    tableName: 'admin_audit_logs',
    timestamps: false,
  },
);
