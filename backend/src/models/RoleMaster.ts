import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface RoleMasterAttributes {
  id: string;
  roleName: string;
}

type RoleMasterCreationAttributes = Optional<RoleMasterAttributes, 'id'>;

export class RoleMaster
  extends Model<RoleMasterAttributes, RoleMasterCreationAttributes>
  implements RoleMasterAttributes
{
  declare id: string;
  declare roleName: string;
}

RoleMaster.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    roleName: { type: DataTypes.STRING, allowNull: false, field: 'role_name', unique: true },
  },
  {
    sequelize,
    modelName: 'RoleMaster',
    tableName: 'roles_master',
    timestamps: false,
  },
);
