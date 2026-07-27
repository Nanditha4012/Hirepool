import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CandidateSkillAttributes {
  candidateId: string;
  skillId: string;
}

/**
 * Pure join table with a composite primary key (candidate_id, skill_id) —
 * no surrogate `id` column. Every attribute is required on creation, so the
 * attributes type doubles as the creation-attributes type.
 */
export class CandidateSkill
  extends Model<CandidateSkillAttributes, CandidateSkillAttributes>
  implements CandidateSkillAttributes
{
  declare candidateId: string;
  declare skillId: string;
}

CandidateSkill.init(
  {
    candidateId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      field: 'candidate_id',
    },
    skillId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      field: 'skill_id',
    },
  },
  {
    sequelize,
    modelName: 'CandidateSkill',
    tableName: 'candidate_skills',
    timestamps: false,
  },
);
