import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type OfferStatus = 'sent' | 'accepted' | 'declined';

export interface OfferAttributes {
  id: string;
  applicationId: string;
  offerLetterLink: string;
  status: OfferStatus;
  sentAt: Date;
  respondedAt: Date | null;
}

type OfferCreationAttributes = Optional<OfferAttributes, 'id' | 'status' | 'sentAt' | 'respondedAt'>;

export class Offer extends Model<OfferAttributes, OfferCreationAttributes> implements OfferAttributes {
  declare id: string;
  declare applicationId: string;
  declare offerLetterLink: string;
  declare status: OfferStatus;
  declare sentAt: Date;
  declare respondedAt: Date | null;
}

Offer.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    applicationId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'application_id' },
    offerLetterLink: { type: DataTypes.STRING, allowNull: false, field: 'offer_letter_link' },
    status: { type: DataTypes.ENUM('sent', 'accepted', 'declined'), allowNull: false, defaultValue: 'sent' },
    sentAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'sent_at' },
    respondedAt: { type: DataTypes.DATE, allowNull: true, field: 'responded_at' },
  },
  { sequelize, modelName: 'Offer', tableName: 'offers', timestamps: false },
);
