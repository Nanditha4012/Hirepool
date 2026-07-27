import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface SkillMasterAttributes {
  id: string;
  skillName: string;
}

type SkillMasterCreationAttributes = Optional<SkillMasterAttributes, 'id'>;

export class SkillMaster
  extends Model<SkillMasterAttributes, SkillMasterCreationAttributes>
  implements SkillMasterAttributes
{
  declare id: string;
  declare skillName: string;
}

SkillMaster.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    skillName: { type: DataTypes.STRING, allowNull: false, field: 'skill_name', unique: true },
  },
  {
    sequelize,
    modelName: 'SkillMaster',
    tableName: 'skills_master',
    timestamps: false,
  },
);
