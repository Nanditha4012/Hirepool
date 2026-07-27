import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type RejectionReasonScope = 'profile' | 'item';

export interface RejectionReasonMasterAttributes {
  id: string;
  scope: RejectionReasonScope;
  reasonText: string;
}

type RejectionReasonMasterCreationAttributes = Optional<RejectionReasonMasterAttributes, 'id'>;

export class RejectionReasonMaster
  extends Model<RejectionReasonMasterAttributes, RejectionReasonMasterCreationAttributes>
  implements RejectionReasonMasterAttributes
{
  declare id: string;
  declare scope: RejectionReasonScope;
  declare reasonText: string;
}

RejectionReasonMaster.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    scope: {
      type: DataTypes.ENUM('profile', 'item'),
      allowNull: false,
    },
    reasonText: { type: DataTypes.STRING, allowNull: false, field: 'reason_text' },
  },
  {
    sequelize,
    modelName: 'RejectionReasonMaster',
    tableName: 'rejection_reasons_master',
    timestamps: false,
  },
);
