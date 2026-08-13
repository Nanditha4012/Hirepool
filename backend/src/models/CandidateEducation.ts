import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type EducationLevel =
  | 'tenth'
  | 'twelfth'
  | 'diploma'
  | 'undergraduate'
  | 'postgraduate'
  | 'doctorate';

/**
 * `auto_verified` is a distinct state from `verified` on purpose. Both mean
 * "a company may treat this as true", but only one of them had a human look
 * at it, and a verifier auditing the queue needs to be able to tell which.
 */
export type EducationVerificationStatus = 'pending' | 'auto_verified' | 'verified' | 'rejected';

/** Ordered oldest-qualification-first, for sorting a candidate's timeline. */
export const EDUCATION_LEVEL_ORDER: Record<EducationLevel, number> = {
  tenth: 0,
  twelfth: 1,
  diploma: 2,
  undergraduate: 3,
  postgraduate: 4,
  doctorate: 5,
};

export interface CandidateEducationAttributes {
  id: string;
  candidateId: string;
  level: EducationLevel;
  institution: string;
  boardOrUniversity: string | null;
  degree: string | null;
  branch: string | null;
  startYear: number | null;
  endYear: number | null;
  isOngoing: boolean;
  /**
   * The figure as awarded, in the unit it was awarded in — see `scoreType`.
   * Not normalised to a percentage; see the migration for why.
   */
  scoreValue: number | null;
  scoreType: string | null;
  marksCardLink: string | null;
  verificationStatus: EducationVerificationStatus;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type CandidateEducationCreationAttributes = Optional<
  CandidateEducationAttributes,
  | 'id'
  | 'boardOrUniversity'
  | 'degree'
  | 'branch'
  | 'startYear'
  | 'endYear'
  | 'isOngoing'
  | 'scoreValue'
  | 'scoreType'
  | 'marksCardLink'
  | 'verificationStatus'
  | 'rejectionReason'
  | 'createdAt'
  | 'updatedAt'
>;

export class CandidateEducation
  extends Model<CandidateEducationAttributes, CandidateEducationCreationAttributes>
  implements CandidateEducationAttributes
{
  declare id: string;
  declare candidateId: string;
  declare level: EducationLevel;
  declare institution: string;
  declare boardOrUniversity: string | null;
  declare degree: string | null;
  declare branch: string | null;
  declare startYear: number | null;
  declare endYear: number | null;
  declare isOngoing: boolean;
  declare scoreValue: number | null;
  declare scoreType: string | null;
  declare marksCardLink: string | null;
  declare verificationStatus: EducationVerificationStatus;
  declare rejectionReason: string | null;
  declare readonly createdAt: Date;
  /**
   * Writable, unlike the `readonly updatedAt` on the older models here.
   *
   * Those declare it readonly and also set `timestamps: false`, so in practice
   * their `updated_at` is frozen at insert time and means nothing. This model
   * is read by the verifier queue ("what changed since I last looked?"), so
   * the column has to be true — controllers bump it on every write.
   */
  declare updatedAt: Date;
}

CandidateEducation.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    candidateId: { type: DataTypes.UUID, allowNull: false, field: 'candidate_id' },
    level: {
      type: DataTypes.ENUM(
        'tenth',
        'twelfth',
        'diploma',
        'undergraduate',
        'postgraduate',
        'doctorate',
      ),
      allowNull: false,
    },
    institution: { type: DataTypes.STRING, allowNull: false },
    boardOrUniversity: { type: DataTypes.STRING, allowNull: true, field: 'board_or_university' },
    degree: { type: DataTypes.STRING, allowNull: true },
    branch: { type: DataTypes.STRING, allowNull: true },
    startYear: { type: DataTypes.INTEGER, allowNull: true, field: 'start_year' },
    endYear: { type: DataTypes.INTEGER, allowNull: true, field: 'end_year' },
    isOngoing: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_ongoing',
    },
    scoreValue: {
      type: DataTypes.DECIMAL(6, 3),
      allowNull: true,
      field: 'score_value',
      // node-postgres hands DECIMAL back as a string to avoid float precision
      // loss. Every consumer here wants a number (comparisons, JSON output),
      // and the range in play — a percentage or a CGPA — is nowhere near
      // where a double loses precision.
      get(): number | null {
        const raw = this.getDataValue('scoreValue') as unknown as string | number | null;
        return raw === null || raw === undefined ? null : Number(raw);
      },
    },
    scoreType: { type: DataTypes.STRING, allowNull: true, field: 'score_type' },
    marksCardLink: { type: DataTypes.STRING, allowNull: true, field: 'marks_card_link' },
    verificationStatus: {
      type: DataTypes.ENUM('pending', 'auto_verified', 'verified', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'verification_status',
    },
    rejectionReason: { type: DataTypes.TEXT, allowNull: true, field: 'rejection_reason' },
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
    modelName: 'CandidateEducation',
    tableName: 'candidate_education',
    timestamps: false,
  },
);
