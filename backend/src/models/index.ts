import { sequelize } from '../config/database';
import { User } from './User';
import { CandidateProfile } from './CandidateProfile';
import { CompanyProfile } from './CompanyProfile';
import { VerificationLog } from './VerificationLog';
import { AdminAuditLog } from './AdminAuditLog';
import { RoleMaster } from './RoleMaster';
import { PlatformBadgeMaster } from './PlatformBadgeMaster';
import { CompanyMaster } from './CompanyMaster';
import { Message } from './Message';
import { Notification } from './Notification';
import { CandidatePlatformBadge } from './CandidatePlatformBadge';
import { CandidateAchievement } from './CandidateAchievement';
import { TotpSecret } from './TotpSecret';
import { SkillMaster } from './SkillMaster';
import { DomainMaster } from './DomainMaster';
import { CandidateSkill } from './CandidateSkill';
import { CandidateSecondaryRole } from './CandidateSecondaryRole';
import { CompanyRequest } from './CompanyRequest';
import { PlanMaster } from './PlanMaster';
import { Unlock } from './Unlock';
import { CompanyBlock } from './CompanyBlock';

// User <-> CandidateProfile (1:1)
User.hasOne(CandidateProfile, { foreignKey: 'userId', as: 'candidateProfile' });
CandidateProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// User <-> CompanyProfile (1:1)
User.hasOne(CompanyProfile, { foreignKey: 'userId', as: 'companyProfile' });
CompanyProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// User <-> TotpSecret (1:1)
User.hasOne(TotpSecret, { foreignKey: 'userId', as: 'totpSecret' });
TotpSecret.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// User <-> CandidatePlatformBadge (1:many, via candidate_id)
User.hasMany(CandidatePlatformBadge, { foreignKey: 'candidateId', as: 'platformBadges' });
CandidatePlatformBadge.belongsTo(User, { foreignKey: 'candidateId', as: 'candidate' });

// User <-> CandidateAchievement (1:many, via candidate_id)
User.hasMany(CandidateAchievement, { foreignKey: 'candidateId', as: 'achievements' });
CandidateAchievement.belongsTo(User, { foreignKey: 'candidateId', as: 'candidate' });

// User <-> Message (1:many twice, as company and as candidate)
User.hasMany(Message, { foreignKey: 'companyId', as: 'sentAsCompany' });
User.hasMany(Message, { foreignKey: 'candidateId', as: 'sentAsCandidate' });
Message.belongsTo(User, { foreignKey: 'companyId', as: 'company' });
Message.belongsTo(User, { foreignKey: 'candidateId', as: 'candidate' });

// User <-> Notification (1:many, via user_id)
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// User <-> VerificationLog (1:many, via reviewer_id)
User.hasMany(VerificationLog, { foreignKey: 'reviewerId', as: 'verificationLogs' });
VerificationLog.belongsTo(User, { foreignKey: 'reviewerId', as: 'reviewer' });

// User <-> AdminAuditLog (1:many, via admin_id)
User.hasMany(AdminAuditLog, { foreignKey: 'adminId', as: 'adminAuditLogs' });
AdminAuditLog.belongsTo(User, { foreignKey: 'adminId', as: 'admin' });

// User <-> CandidateSkill (1:many, via candidate_id)
User.hasMany(CandidateSkill, { foreignKey: 'candidateId', as: 'candidateSkills' });
CandidateSkill.belongsTo(User, { foreignKey: 'candidateId', as: 'candidate' });
CandidateSkill.belongsTo(SkillMaster, { foreignKey: 'skillId', as: 'skill' });

// User <-> CandidateSecondaryRole (1:many, via candidate_id)
User.hasMany(CandidateSecondaryRole, { foreignKey: 'candidateId', as: 'secondaryRoles' });
CandidateSecondaryRole.belongsTo(User, { foreignKey: 'candidateId', as: 'candidate' });
CandidateSecondaryRole.belongsTo(RoleMaster, { foreignKey: 'roleId', as: 'role' });

// User <-> CompanyRequest (1:many, via requested_by)
User.hasMany(CompanyRequest, { foreignKey: 'requestedBy', as: 'companyRequests' });
CompanyRequest.belongsTo(User, { foreignKey: 'requestedBy', as: 'requester' });

// CandidateProfile <-> new master tables
CandidateProfile.belongsTo(RoleMaster, { as: 'primaryRole', foreignKey: 'primaryRoleId' });
CandidateProfile.belongsTo(DomainMaster, { as: 'domain', foreignKey: 'domainId' });
CandidateProfile.belongsTo(CompanyMaster, { as: 'currentCompany', foreignKey: 'currentCompanyId' });
CandidateProfile.belongsTo(RoleMaster, { as: 'designationRole', foreignKey: 'designationRoleId' });

// CompanyProfile <-> PlanMaster (many companies -> one plan)
CompanyProfile.belongsTo(PlanMaster, { as: 'plan', foreignKey: 'planId' });

// User <-> Unlock (1:many twice, as company and as candidate — same
// double-hasMany pattern as Message above)
User.hasMany(Unlock, { foreignKey: 'companyId', as: 'unlocksMade' });
User.hasMany(Unlock, { foreignKey: 'candidateId', as: 'unlockedBy' });
Unlock.belongsTo(User, { foreignKey: 'companyId', as: 'company' });
Unlock.belongsTo(User, { foreignKey: 'candidateId', as: 'candidate' });

// User <-> CompanyBlock (1:many twice, as company and as candidate)
User.hasMany(CompanyBlock, { foreignKey: 'companyId', as: 'blocksMade' });
User.hasMany(CompanyBlock, { foreignKey: 'candidateId', as: 'blockedBy' });
CompanyBlock.belongsTo(User, { foreignKey: 'companyId', as: 'company' });
CompanyBlock.belongsTo(User, { foreignKey: 'candidateId', as: 'candidate' });

export {
  sequelize,
  User,
  CandidateProfile,
  CompanyProfile,
  VerificationLog,
  AdminAuditLog,
  RoleMaster,
  PlatformBadgeMaster,
  CompanyMaster,
  Message,
  Notification,
  CandidatePlatformBadge,
  CandidateAchievement,
  TotpSecret,
  SkillMaster,
  DomainMaster,
  CandidateSkill,
  CandidateSecondaryRole,
  CompanyRequest,
  PlanMaster,
  Unlock,
  CompanyBlock,
};
