import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface PlanMasterAttributes {
  id: string;
  name: string;
  monthlyUnlocks: number;
  // NULL = unlimited messages per month on this plan.
  monthlyMessageCap: number | null;
  price: number;
  isActive: boolean;
}

type PlanMasterCreationAttributes = Optional<
  PlanMasterAttributes,
  'id' | 'monthlyMessageCap' | 'price' | 'isActive'
>;

export class PlanMaster
  extends Model<PlanMasterAttributes, PlanMasterCreationAttributes>
  implements PlanMasterAttributes
{
  declare id: string;
  declare name: string;
  declare monthlyUnlocks: number;
  declare monthlyMessageCap: number | null;
  declare price: number;
  declare isActive: boolean;
}

PlanMaster.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    monthlyUnlocks: { type: DataTypes.INTEGER, allowNull: false, field: 'monthly_unlocks' },
    monthlyMessageCap: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'monthly_message_cap',
    },
    price: { type: DataTypes.DECIMAL, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
  },
  {
    sequelize,
    modelName: 'PlanMaster',
    tableName: 'plans_master',
    timestamps: false,
  },
);
