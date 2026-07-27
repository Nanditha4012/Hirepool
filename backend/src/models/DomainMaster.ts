import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface DomainMasterAttributes {
  id: string;
  domainName: string;
}

type DomainMasterCreationAttributes = Optional<DomainMasterAttributes, 'id'>;

export class DomainMaster
  extends Model<DomainMasterAttributes, DomainMasterCreationAttributes>
  implements DomainMasterAttributes
{
  declare id: string;
  declare domainName: string;
}

DomainMaster.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    domainName: { type: DataTypes.STRING, allowNull: false, field: 'domain_name', unique: true },
  },
  {
    sequelize,
    modelName: 'DomainMaster',
    tableName: 'domains_master',
    timestamps: false,
  },
);
