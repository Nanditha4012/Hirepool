import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type VerificationDocumentType = 'aadhaar' | 'marks_card' | 'degree_certificate';
export type VerificationDocumentSource = 'drive_link' | 'digilocker';

/**
 * `manual_review` is the important one. A scan the reader could open but not
 * confidently match is not a fraudulent candidate — it is a phone photo taken
 * at an angle. Sending those to a human is what stops automation from being
 * worse than the manual process it replaces.
 */
export type VerificationDocumentStatus =
  | 'pending'
  | 'processing'
  | 'auto_verified'
  | 'manual_review'
  | 'failed';

/** Whatever the reader managed to parse. Every field independently optional. */
export interface ExtractedDocumentFields {
  fullName?: string;
  dob?: string;
  gender?: string;
  /** Never the full number — see `aadhaarLast4` and the migration's comment. */
  aadhaarLast4?: string;
  institution?: string;
  boardOrUniversity?: string;
  rollNumber?: string;
  passingYear?: number;
  scoreValue?: number;
  scoreType?: string;
  /** The raw text, kept only long enough for a verifier to eyeball a mismatch. */
  rawTextSample?: string;
}

/** Per-field agreement between the document and what the candidate typed. */
export type DocumentFieldMatches = Record<string, boolean>;

export interface CandidateVerificationDocumentAttributes {
  id: string;
  candidateId: string;
  docType: VerificationDocumentType;
  source: VerificationDocumentSource;
  documentLink: string | null;
  educationId: string | null;
  status: VerificationDocumentStatus;
  extracted: ExtractedDocumentFields | null;
  fieldMatches: DocumentFieldMatches | null;
  confidence: number | null;
  aadhaarLast4: string | null;
  failureReason: string | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type CandidateVerificationDocumentCreationAttributes = Optional<
  CandidateVerificationDocumentAttributes,
  | 'id'
  | 'source'
  | 'documentLink'
  | 'educationId'
  | 'status'
  | 'extracted'
  | 'fieldMatches'
  | 'confidence'
  | 'aadhaarLast4'
  | 'failureReason'
  | 'processedAt'
  | 'createdAt'
  | 'updatedAt'
>;

export class CandidateVerificationDocument
  extends Model<
    CandidateVerificationDocumentAttributes,
    CandidateVerificationDocumentCreationAttributes
  >
  implements CandidateVerificationDocumentAttributes
{
  declare id: string;
  declare candidateId: string;
  declare docType: VerificationDocumentType;
  declare source: VerificationDocumentSource;
  declare documentLink: string | null;
  declare educationId: string | null;
  declare status: VerificationDocumentStatus;
  declare extracted: ExtractedDocumentFields | null;
  declare fieldMatches: DocumentFieldMatches | null;
  declare confidence: number | null;
  declare aadhaarLast4: string | null;
  declare failureReason: string | null;
  declare processedAt: Date | null;
  declare readonly createdAt: Date;
  /** Writable — see the note on CandidateEducation.updatedAt. */
  declare updatedAt: Date;
}

CandidateVerificationDocument.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    candidateId: { type: DataTypes.UUID, allowNull: false, field: 'candidate_id' },
    docType: {
      type: DataTypes.ENUM('aadhaar', 'marks_card', 'degree_certificate'),
      allowNull: false,
      field: 'doc_type',
    },
    source: {
      type: DataTypes.ENUM('drive_link', 'digilocker'),
      allowNull: false,
      defaultValue: 'drive_link',
    },
    documentLink: { type: DataTypes.STRING, allowNull: true, field: 'document_link' },
    educationId: { type: DataTypes.UUID, allowNull: true, field: 'education_id' },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'auto_verified', 'manual_review', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    extracted: { type: DataTypes.JSONB, allowNull: true },
    fieldMatches: { type: DataTypes.JSONB, allowNull: true, field: 'field_matches' },
    confidence: {
      type: DataTypes.DECIMAL(4, 3),
      allowNull: true,
      // Same string-from-DECIMAL reason as CandidateEducation.scoreValue.
      get(): number | null {
        const raw = this.getDataValue('confidence') as unknown as string | number | null;
        return raw === null || raw === undefined ? null : Number(raw);
      },
    },
    aadhaarLast4: { type: DataTypes.STRING(4), allowNull: true, field: 'aadhaar_last4' },
    failureReason: { type: DataTypes.TEXT, allowNull: true, field: 'failure_reason' },
    processedAt: { type: DataTypes.DATE, allowNull: true, field: 'processed_at' },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    modelName: 'CandidateVerificationDocument',
    tableName: 'candidate_verification_documents',
    timestamps: false,
  },
);
