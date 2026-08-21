import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type BgvStatus = 'pending' | 'in_progress' | 'cleared' | 'flagged';

export interface JoiningDocument {
  docType: string;
  link: string;
}

export interface JoiningFormalityAttributes {
  id: string;
  applicationId: string;
  documents: JoiningDocument[];
  bgvStatus: BgvStatus;
  bgvAgencyName: string | null;
  bgvUpdatedAt: Date | null;
}

type JoiningFormalityCreationAttributes = Optional<
  JoiningFormalityAttributes,
  'id' | 'documents' | 'bgvStatus' | 'bgvAgencyName' | 'bgvUpdatedAt'
>;

export class JoiningFormality
  extends Model<JoiningFormalityAttributes, JoiningFormalityCreationAttributes>
  implements JoiningFormalityAttributes
{
  declare id: string;
  declare applicationId: string;
  declare documents: JoiningDocument[];
  declare bgvStatus: BgvStatus;
  declare bgvAgencyName: string | null;
  declare bgvUpdatedAt: Date | null;
}

JoiningFormality.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    applicationId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'application_id' },
    documents: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    bgvStatus: {
      type: DataTypes.ENUM('pending', 'in_progress', 'cleared', 'flagged'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'bgv_status',
    },
    bgvAgencyName: { type: DataTypes.STRING, allowNull: true, field: 'bgv_agency_name' },
    bgvUpdatedAt: { type: DataTypes.DATE, allowNull: true, field: 'bgv_updated_at' },
  },
  { sequelize, modelName: 'JoiningFormality', tableName: 'joining_formalities', timestamps: false },
);
