import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type CompanyRequestStatus = 'pending' | 'approved' | 'rejected';

export interface CompanyRequestAttributes {
  id: string;
  requestedBy: string | null;
  companyName: string;
  status: CompanyRequestStatus;
  createdAt: Date;
}

type CompanyRequestCreationAttributes = Optional<
  CompanyRequestAttributes,
  'id' | 'requestedBy' | 'status' | 'createdAt'
>;

export class CompanyRequest
  extends Model<CompanyRequestAttributes, CompanyRequestCreationAttributes>
  implements CompanyRequestAttributes
{
  declare id: string;
  declare requestedBy: string | null;
  declare companyName: string;
  declare status: CompanyRequestStatus;
  declare readonly createdAt: Date;
}

CompanyRequest.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    requestedBy: { type: DataTypes.UUID, allowNull: true, field: 'requested_by' },
    companyName: { type: DataTypes.STRING, allowNull: false, field: 'company_name' },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
    },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
  },
  {
    sequelize,
    modelName: 'CompanyRequest',
    tableName: 'company_requests',
    timestamps: false,
  },
);
