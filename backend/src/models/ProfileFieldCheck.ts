import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One verifier Yes/No on one field of a candidate profile.
 *
 * Append-only by design (see migrations/20240105000001): a re-review inserts
 * a fresh row rather than updating the old one, so the full history of who
 * checked what and when stays reconstructable for the profile timeline. The
 * *current* verdict on a field is just its most recent row.
 *
 * `fieldKey` is a free-form string rather than an enum because per-item
 * checks use a composite key (`project:<uuid>`, `badge:<uuid>`) whose value
 * set depends on the candidate's own data.
 */
export interface ProfileFieldCheckAttributes {
  id: string;
  profileId: string;
  candidateId: string;
  reviewerId: string;
  fieldKey: string;
  fieldLabel: string | null;
  passed: boolean;
  reasonId: string | null;
  reasonText: string | null;
  createdAt: Date;
}

type ProfileFieldCheckCreationAttributes = Optional<
  ProfileFieldCheckAttributes,
  'id' | 'fieldLabel' | 'reasonId' | 'reasonText' | 'createdAt'
>;

export class ProfileFieldCheck
  extends Model<ProfileFieldCheckAttributes, ProfileFieldCheckCreationAttributes>
  implements ProfileFieldCheckAttributes
{
  declare id: string;
  declare profileId: string;
  declare candidateId: string;
  declare reviewerId: string;
  declare fieldKey: string;
  declare fieldLabel: string | null;
  declare passed: boolean;
  declare reasonId: string | null;
  declare reasonText: string | null;
  declare readonly createdAt: Date;
}

ProfileFieldCheck.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    profileId: { type: DataTypes.UUID, allowNull: false, field: 'profile_id' },
    candidateId: { type: DataTypes.UUID, allowNull: false, field: 'candidate_id' },
    reviewerId: { type: DataTypes.UUID, allowNull: false, field: 'reviewer_id' },
    fieldKey: { type: DataTypes.STRING, allowNull: false, field: 'field_key' },
    fieldLabel: { type: DataTypes.STRING, allowNull: true, field: 'field_label' },
    passed: { type: DataTypes.BOOLEAN, allowNull: false },
    reasonId: { type: DataTypes.UUID, allowNull: true, field: 'reason_id' },
    reasonText: { type: DataTypes.TEXT, allowNull: true, field: 'reason_text' },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  },
  {
    sequelize,
    modelName: 'ProfileFieldCheck',
    tableName: 'profile_field_checks',
    timestamps: false,
  },
);
