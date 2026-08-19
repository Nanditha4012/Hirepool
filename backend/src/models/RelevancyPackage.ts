import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import type { RelevancyTier } from './CandidateRelevancyScore';

/**
 * A purchased (or purchasable-and-not-yet-bought) batch snapshot for one
 * job/tier. purchasedByCompanyId/purchasedAt are null until the Phase 3
 * Razorpay purchase flow fills them in.
 */
export interface RelevancyPackageAttributes {
  id: string;
  jobId: string;
  tier: RelevancyTier;
  candidateCount: number;
  price: number;
  purchasedByCompanyId: string | null;
  purchasedAt: Date | null;
  downloadedAt: Date | null;
  createdAt: Date;
}

type RelevancyPackageCreationAttributes = Optional<
  RelevancyPackageAttributes,
  'id' | 'purchasedByCompanyId' | 'purchasedAt' | 'downloadedAt' | 'createdAt'
>;

export class RelevancyPackage
  extends Model<RelevancyPackageAttributes, RelevancyPackageCreationAttributes>
  implements RelevancyPackageAttributes
{
  declare id: string;
  declare jobId: string;
  declare tier: RelevancyTier;
  declare candidateCount: number;
  declare price: number;
  declare purchasedByCompanyId: string | null;
  declare purchasedAt: Date | null;
  declare downloadedAt: Date | null;
  declare createdAt: Date;
}

RelevancyPackage.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    jobId: { type: DataTypes.UUID, allowNull: false, field: 'job_id' },
    tier: { type: DataTypes.ENUM('100_percent', '90_plus', '75_plus', '50_plus'), allowNull: false },
    candidateCount: { type: DataTypes.INTEGER, allowNull: false, field: 'candidate_count' },
    price: { type: DataTypes.DECIMAL, allowNull: false },
    purchasedByCompanyId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'purchased_by_company_id',
    },
    purchasedAt: { type: DataTypes.DATE, allowNull: true, field: 'purchased_at' },
    downloadedAt: { type: DataTypes.DATE, allowNull: true, field: 'downloaded_at' },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
  },
  {
    sequelize,
    modelName: 'RelevancyPackage',
    tableName: 'relevancy_packages',
    timestamps: false,
  },
);
