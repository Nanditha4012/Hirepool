import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface UnlockAttributes {
  id: string;
  companyId: string;
  candidateId: string;
  unlockedAt: Date;
  note: string | null;
}

type UnlockCreationAttributes = Optional<UnlockAttributes, 'id' | 'unlockedAt' | 'note'>;

export class Unlock
  extends Model<UnlockAttributes, UnlockCreationAttributes>
  implements UnlockAttributes
{
  declare id: string;
  declare companyId: string;
  declare candidateId: string;
  declare readonly unlockedAt: Date;
  declare note: string | null;
}

Unlock.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyId: { type: DataTypes.UUID, allowNull: false, field: 'company_id' },
    candidateId: { type: DataTypes.UUID, allowNull: false, field: 'candidate_id' },
    unlockedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'unlocked_at',
    },
    note: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Unlock',
    tableName: 'unlocks',
    timestamps: false,
  },
);
