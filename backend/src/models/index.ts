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
import { RejectionReasonMaster } from './RejectionReasonMaster';
import { ProfileFieldCheck } from './ProfileFieldCheck';
import { Announcement } from './Announcement';
import { SiteSetting } from './SiteSetting';
import { Payment } from './Payment';
import { VerifierInvite } from './VerifierInvite';
import { PasswordResetOtp } from './PasswordResetOtp';
import { Contest } from './Contest';
import { ContestQuestion } from './ContestQuestion';
import { ContestAttempt } from './ContestAttempt';
import { ContestQuestionResponse } from './ContestQuestionResponse';
import { Community } from './Community';
import { CommunityMember } from './CommunityMember';
import { FeedPost } from './FeedPost';
import { PostReaction } from './PostReaction';
import { CommentReaction } from './CommentReaction';
import { PostComment } from './PostComment';
import { PostReport } from './PostReport';

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

// User <-> CandidateProfile (1:many, via assigned_verifier_id) — Phase 4:
// the verifier currently assigned to review this profile.
User.hasMany(CandidateProfile, { foreignKey: 'assignedVerifierId', as: 'assignedProfiles' });
CandidateProfile.belongsTo(User, { as: 'assignedVerifier', foreignKey: 'assignedVerifierId' });

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

// CandidateProfile <-> ProfileFieldCheck (1:many) — Phase 5: the per-field
// Yes/No verdicts recorded during review. Also joined to the reviewer and
// to the picked rejection reason so the timeline can render names/text
// without a second round-trip.
CandidateProfile.hasMany(ProfileFieldCheck, { foreignKey: 'profileId', as: 'fieldChecks' });
ProfileFieldCheck.belongsTo(CandidateProfile, { foreignKey: 'profileId', as: 'profile' });
ProfileFieldCheck.belongsTo(User, { foreignKey: 'reviewerId', as: 'reviewer' });
ProfileFieldCheck.belongsTo(RejectionReasonMaster, { foreignKey: 'reasonId', as: 'reason' });

// User <-> Announcement (1:many, via created_by) — Phase 5 admin portal.
User.hasMany(Announcement, { foreignKey: 'createdBy', as: 'announcements' });
Announcement.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

// User <-> SiteSetting (1:many, via updated_by — nullable, same shape as
// CandidateProfile <-> assignedVerifier above) — Phase 5 admin portal.
User.hasMany(SiteSetting, { foreignKey: 'updatedBy', as: 'siteSettingsUpdated' });
SiteSetting.belongsTo(User, { foreignKey: 'updatedBy', as: 'updatedByUser' });

// User <-> Payment (1:many, via payer_user_id) — Phase 6 payments.
User.hasMany(Payment, { foreignKey: 'payerUserId', as: 'payments' });
Payment.belongsTo(User, { foreignKey: 'payerUserId', as: 'payer' });

// User <-> VerifierInvite — an admin invites (invitedBy), and at most one
// user ever consumes a given invite (consumedByUserId, set by
// authController.signup on success).
User.hasMany(VerifierInvite, { foreignKey: 'invitedBy', as: 'verifierInvitesSent' });
VerifierInvite.belongsTo(User, { foreignKey: 'invitedBy', as: 'inviter' });
VerifierInvite.belongsTo(User, { foreignKey: 'consumedByUserId', as: 'consumedByUser' });

// Contest module. A contest owns its questions; a candidate's attempt at a
// contest owns one response row per question answered.
Contest.hasMany(ContestQuestion, { foreignKey: 'contestId', as: 'questions' });
ContestQuestion.belongsTo(Contest, { foreignKey: 'contestId', as: 'contest' });

Contest.hasMany(ContestAttempt, { foreignKey: 'contestId', as: 'attempts' });
ContestAttempt.belongsTo(Contest, { foreignKey: 'contestId', as: 'contest' });

User.hasMany(ContestAttempt, { foreignKey: 'candidateId', as: 'contestAttempts' });
ContestAttempt.belongsTo(User, { foreignKey: 'candidateId', as: 'candidate' });

ContestAttempt.hasMany(ContestQuestionResponse, { foreignKey: 'attemptId', as: 'responses' });
ContestQuestionResponse.belongsTo(ContestAttempt, { foreignKey: 'attemptId', as: 'attempt' });

ContestQuestion.hasMany(ContestQuestionResponse, { foreignKey: 'questionId', as: 'responses' });
ContestQuestionResponse.belongsTo(ContestQuestion, { foreignKey: 'questionId', as: 'question' });

// Social module: Walk-in Pedia, Job Book and Communities. One post table
// (FeedPost.kind) backs all three surfaces, so the reactions/comments/reports
// associations below are declared once rather than per surface.
Community.hasMany(CommunityMember, { foreignKey: 'communityId', as: 'members' });
CommunityMember.belongsTo(Community, { foreignKey: 'communityId', as: 'community' });
User.hasMany(CommunityMember, { foreignKey: 'userId', as: 'communityMemberships' });
CommunityMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Community.hasMany(FeedPost, { foreignKey: 'communityId', as: 'posts' });
FeedPost.belongsTo(Community, { foreignKey: 'communityId', as: 'community' });

User.hasMany(FeedPost, { foreignKey: 'authorId', as: 'feedPosts' });
FeedPost.belongsTo(User, { foreignKey: 'authorId', as: 'author' });

FeedPost.hasMany(PostReaction, { foreignKey: 'postId', as: 'reactions' });
PostReaction.belongsTo(FeedPost, { foreignKey: 'postId', as: 'post' });
User.hasMany(PostReaction, { foreignKey: 'userId', as: 'postReactions' });
PostReaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });

FeedPost.hasMany(PostComment, { foreignKey: 'postId', as: 'comments' });
PostComment.belongsTo(FeedPost, { foreignKey: 'postId', as: 'post' });

// Self-reference: a reply belongs to the comment it answers. Capped at one
// level by feedController.addComment, not by the association.
PostComment.hasMany(PostComment, { foreignKey: 'parentCommentId', as: 'replies' });
PostComment.belongsTo(PostComment, { foreignKey: 'parentCommentId', as: 'parent' });

PostComment.hasMany(CommentReaction, { foreignKey: 'commentId', as: 'reactions' });
CommentReaction.belongsTo(PostComment, { foreignKey: 'commentId', as: 'comment' });
User.hasMany(CommentReaction, { foreignKey: 'userId', as: 'commentReactions' });
CommentReaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(PostComment, { foreignKey: 'userId', as: 'postComments' });
PostComment.belongsTo(User, { foreignKey: 'userId', as: 'user' });

FeedPost.hasMany(PostReport, { foreignKey: 'postId', as: 'reports' });
PostReport.belongsTo(FeedPost, { foreignKey: 'postId', as: 'post' });
User.hasMany(PostReport, { foreignKey: 'userId', as: 'postReports' });
PostReport.belongsTo(User, { foreignKey: 'userId', as: 'user' });

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
  RejectionReasonMaster,
  ProfileFieldCheck,
  Announcement,
  SiteSetting,
  Payment,
  VerifierInvite,
  PasswordResetOtp,
  Contest,
  ContestQuestion,
  ContestAttempt,
  ContestQuestionResponse,
  Community,
  CommunityMember,
  FeedPost,
  PostReaction,
  PostComment,
  CommentReaction,
  PostReport,
};
