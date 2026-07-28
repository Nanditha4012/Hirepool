import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type CandidateCategory = 'fresher' | 'experienced' | 'executive';
export type CandidateStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'needs_info';
export type CompanyType = 'mnc' | 'startup' | 'agency';
export type NoticePeriod = 'immediate' | '15_days' | '30_days' | '60_days' | '90_plus_days';

export interface CandidateProfileAttributes {
  id: string;
  userId: string;
  category: CandidateCategory | null;
  status: CandidateStatus;
  primaryRoleId: string | null;
  domainId: string | null;
  resumeLink: string | null;
  portfolioLink: string | null;
  yearsOfExperience: number | null;
  currentCompanyId: string | null;
  designationRoleId: string | null;
  offerLetterOrLinkedinLink: string | null;
  companyType: CompanyType | null;
  teamSizeManaged: number | null;
  budgetOwned: string | null;
  titleLevel: string | null;
  isActivelyLooking: boolean;
  location: string | null;
  noticePeriod: NoticePeriod | null;
  assignedVerifierId: string | null;
  submittedAt: Date | null;
  /**
   * True when an already-live candidate has changed something that needs a
   * fresh look (a new project, an edited badge). The profile stays
   * `approved` and visible to companies — only the new item is unverified —
   * but the candidate has to explicitly ask for re-verification, which is
   * what `reverificationRequestedAt` records.
   */
  pendingReverification: boolean;
  reverificationRequestedAt: Date | null;
  /** Phase 6: candidate profile Boost (paid, see paymentController). */
  isBoosted: boolean;
  boostExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type CandidateProfileCreationAttributes = Optional<
  CandidateProfileAttributes,
  | 'id'
  | 'category'
  | 'status'
  | 'primaryRoleId'
  | 'domainId'
  | 'resumeLink'
  | 'portfolioLink'
  | 'yearsOfExperience'
  | 'currentCompanyId'
  | 'designationRoleId'
  | 'offerLetterOrLinkedinLink'
  | 'companyType'
  | 'teamSizeManaged'
  | 'budgetOwned'
  | 'titleLevel'
  | 'isActivelyLooking'
  | 'location'
  | 'noticePeriod'
  | 'assignedVerifierId'
  | 'submittedAt'
  | 'pendingReverification'
  | 'reverificationRequestedAt'
  | 'isBoosted'
  | 'boostExpiresAt'
  | 'createdAt'
  | 'updatedAt'
>;

export class CandidateProfile
  extends Model<CandidateProfileAttributes, CandidateProfileCreationAttributes>
  implements CandidateProfileAttributes
{
  declare id: string;
  declare userId: string;
  declare category: CandidateCategory | null;
  declare status: CandidateStatus;
  declare primaryRoleId: string | null;
  declare domainId: string | null;
  declare resumeLink: string | null;
  declare portfolioLink: string | null;
  declare yearsOfExperience: number | null;
  declare currentCompanyId: string | null;
  declare designationRoleId: string | null;
  declare offerLetterOrLinkedinLink: string | null;
  declare companyType: CompanyType | null;
  declare teamSizeManaged: number | null;
  declare budgetOwned: string | null;
  declare titleLevel: string | null;
  declare isActivelyLooking: boolean;
  declare location: string | null;
  declare noticePeriod: NoticePeriod | null;
  declare assignedVerifierId: string | null;
  declare submittedAt: Date | null;
  declare pendingReverification: boolean;
  declare reverificationRequestedAt: Date | null;
  declare isBoosted: boolean;
  declare boostExpiresAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

CandidateProfile.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id', unique: true },
    category: {
      type: DataTypes.ENUM('fresher', 'experienced', 'executive'),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(
        'draft',
        'submitted',
        'under_review',
        'approved',
        'rejected',
        'needs_info',
      ),
      allowNull: false,
      defaultValue: 'draft',
    },
    primaryRoleId: { type: DataTypes.UUID, allowNull: true, field: 'primary_role_id' },
    domainId: { type: DataTypes.UUID, allowNull: true, field: 'domain_id' },
    resumeLink: { type: DataTypes.STRING, allowNull: true, field: 'resume_link' },
    portfolioLink: { type: DataTypes.STRING, allowNull: true, field: 'portfolio_link' },
    yearsOfExperience: { type: DataTypes.INTEGER, allowNull: true, field: 'years_of_experience' },
    currentCompanyId: { type: DataTypes.UUID, allowNull: true, field: 'current_company_id' },
    designationRoleId: { type: DataTypes.UUID, allowNull: true, field: 'designation_role_id' },
    offerLetterOrLinkedinLink: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'offer_letter_or_linkedin_link',
    },
    companyType: {
      type: DataTypes.ENUM('mnc', 'startup', 'agency'),
      allowNull: true,
      field: 'company_type',
    },
    teamSizeManaged: { type: DataTypes.INTEGER, allowNull: true, field: 'team_size_managed' },
    budgetOwned: { type: DataTypes.STRING, allowNull: true, field: 'budget_owned' },
    titleLevel: { type: DataTypes.STRING, allowNull: true, field: 'title_level' },
    isActivelyLooking: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_actively_looking',
    },
    location: { type: DataTypes.STRING, allowNull: true },
    noticePeriod: {
      type: DataTypes.ENUM('immediate', '15_days', '30_days', '60_days', '90_plus_days'),
      allowNull: true,
      field: 'notice_period',
    },
    assignedVerifierId: { type: DataTypes.UUID, allowNull: true, field: 'assigned_verifier_id' },
    submittedAt: { type: DataTypes.DATE, allowNull: true, field: 'submitted_at' },
    pendingReverification: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'pending_reverification',
    },
    reverificationRequestedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reverification_requested_at',
    },
    isBoosted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_boosted',
    },
    boostExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'boost_expires_at',
    },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  {
    sequelize,
    modelName: 'CandidateProfile',
    tableName: 'candidate_profiles',
    timestamps: false,
  },
);
