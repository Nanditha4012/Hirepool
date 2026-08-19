import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Admin-editable pricing config for relevancy packages, same "admin CRUD
 * over a master table" shape as PlanMaster. price is null exactly when
 * isContactSales is true (the 200+ band) — isContactSales carries that
 * meaning explicitly so the frontend never has to infer it from a null.
 */
export interface RelevancyPackagePriceBandAttributes {
  id: string;
  label: string;
  minCandidates: number;
  maxCandidates: number | null;
  price: number | null;
  isContactSales: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

type RelevancyPackagePriceBandCreationAttributes = Optional<
  RelevancyPackagePriceBandAttributes,
  'id' | 'maxCandidates' | 'price' | 'isContactSales' | 'sortOrder' | 'createdAt' | 'updatedAt'
>;

export class RelevancyPackagePriceBand
  extends Model<RelevancyPackagePriceBandAttributes, RelevancyPackagePriceBandCreationAttributes>
  implements RelevancyPackagePriceBandAttributes
{
  declare id: string;
  declare label: string;
  declare minCandidates: number;
  declare maxCandidates: number | null;
  declare price: number | null;
  declare isContactSales: boolean;
  declare sortOrder: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}

RelevancyPackagePriceBand.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    label: { type: DataTypes.STRING, allowNull: false },
    minCandidates: { type: DataTypes.INTEGER, allowNull: false, field: 'min_candidates' },
    maxCandidates: { type: DataTypes.INTEGER, allowNull: true, field: 'max_candidates' },
    price: { type: DataTypes.DECIMAL, allowNull: true },
    isContactSales: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_contact_sales',
    },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'sort_order' },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  {
    sequelize,
    modelName: 'RelevancyPackagePriceBand',
    tableName: 'relevancy_package_price_bands',
    timestamps: false,
  },
);
