import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CandidateSecondaryRoleAttributes {
  candidateId: string;
  roleId: string;
}

/**
 * Pure join table with a composite primary key (candidate_id, role_id) —
 * no surrogate `id` column. Every attribute is required on creation, so the
 * attributes type doubles as the creation-attributes type.
 */
export class CandidateSecondaryRole
  extends Model<CandidateSecondaryRoleAttributes, CandidateSecondaryRoleAttributes>
  implements CandidateSecondaryRoleAttributes
{
  declare candidateId: string;
  declare roleId: string;
}

CandidateSecondaryRole.init(
  {
    candidateId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      field: 'candidate_id',
    },
    roleId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      field: 'role_id',
    },
  },
  {
    sequelize,
    modelName: 'CandidateSecondaryRole',
    tableName: 'candidate_secondary_roles',
    timestamps: false,
  },
);
