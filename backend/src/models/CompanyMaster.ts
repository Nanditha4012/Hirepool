import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface CompanyMasterAttributes {
  id: string;
  companyName: string;
  isMnc: boolean;
  isFaangMaang: boolean;
}

type CompanyMasterCreationAttributes = Optional<
  CompanyMasterAttributes,
  'id' | 'isMnc' | 'isFaangMaang'
>;

export class CompanyMaster
  extends Model<CompanyMasterAttributes, CompanyMasterCreationAttributes>
  implements CompanyMasterAttributes
{
  declare id: string;
  declare companyName: string;
  declare isMnc: boolean;
  declare isFaangMaang: boolean;
}

CompanyMaster.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyName: { type: DataTypes.STRING, allowNull: false, field: 'company_name', unique: true },
    isMnc: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_mnc' },
    isFaangMaang: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_faang_maang',
    },
  },
  {
    sequelize,
    modelName: 'CompanyMaster',
    tableName: 'companies_master',
    timestamps: false,
  },
);
