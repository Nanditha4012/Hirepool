import { Router } from 'express';
import * as adminController from '../controllers/adminController';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

const router = Router();

// Every route below is admin-only; the pair is applied per-route rather than
// via router.use() — same convention as verifierRoutes/candidateRoutes.
const adminOnly = [requireAuth, requireRole('admin')] as const;

router.get('/ping', ...adminOnly, adminController.ping);

// ----- Candidates -----
// '/candidates/export' is declared before '/candidates/:id' so the literal
// path can never be swallowed by the :id parameter (same ordering discipline
// as verifierRoutes' '/me' before '/profiles/:id').
router.get('/candidates/export', ...adminOnly, adminController.exportCandidates);
router.get('/candidates', ...adminOnly, adminController.listCandidates);
router.get('/candidates/:id', ...adminOnly, adminController.getCandidateDetail);
router.patch('/candidates/:id', ...adminOnly, adminController.updateCandidate);
router.patch('/candidates/:id/badges/:badgeId', ...adminOnly, adminController.updateCandidateBadge);

// ----- Users (generic account moderation) -----
router.post('/users/:id/suspend', ...adminOnly, adminController.suspendUser);
router.post('/users/:id/ban', ...adminOnly, adminController.banUser);
router.post('/users/:id/reactivate', ...adminOnly, adminController.reactivateUser);
router.delete('/users/:id', ...adminOnly, adminController.deleteUser);
router.post('/users/:id/impersonate', ...adminOnly, adminController.impersonateUser);

// ----- Companies -----
router.get('/companies', ...adminOnly, adminController.listCompanies);
router.get('/companies/:id', ...adminOnly, adminController.getCompanyDetail);
router.patch('/companies/:id', ...adminOnly, adminController.updateCompany);
router.post('/companies/:id/grant-unlocks', ...adminOnly, adminController.grantUnlocks);

// ----- Verifiers -----
router.get('/verifiers', ...adminOnly, adminController.listVerifiers);
router.post('/verifiers', ...adminOnly, adminController.createVerifier);

// ----- Company requests -----
router.get('/company-requests', ...adminOnly, adminController.listCompanyRequests);
router.post('/company-requests/:id/approve', ...adminOnly, adminController.approveCompanyRequest);
router.post('/company-requests/:id/reject', ...adminOnly, adminController.rejectCompanyRequest);

// ----- Master data CRUD (list/read is public, under /masters — this is the
// admin-only write side) -----
router.post('/masters/roles', ...adminOnly, adminController.createRoleMaster);
router.patch('/masters/roles/:id', ...adminOnly, adminController.updateRoleMaster);
router.delete('/masters/roles/:id', ...adminOnly, adminController.deleteRoleMaster);

router.post('/masters/platform-badges', ...adminOnly, adminController.createPlatformBadgeMaster);
router.patch('/masters/platform-badges/:id', ...adminOnly, adminController.updatePlatformBadgeMaster);
router.delete('/masters/platform-badges/:id', ...adminOnly, adminController.deletePlatformBadgeMaster);

// '/masters/companies/:id/merge' declared before the plain '/:id' write
// routes so it can't be shadowed if Express ever changed matching order —
// harmless either way since the HTTP method differs, but keeps the file
// consistent with the "specific literal path before :id" rule used above.
router.post('/masters/companies/:id/merge', ...adminOnly, adminController.mergeCompanyMaster);
router.post('/masters/companies', ...adminOnly, adminController.createCompanyMaster);
router.patch('/masters/companies/:id', ...adminOnly, adminController.updateCompanyMaster);
router.delete('/masters/companies/:id', ...adminOnly, adminController.deleteCompanyMaster);

router.post('/masters/skills', ...adminOnly, adminController.createSkillMaster);
router.patch('/masters/skills/:id', ...adminOnly, adminController.updateSkillMaster);
router.delete('/masters/skills/:id', ...adminOnly, adminController.deleteSkillMaster);

router.post('/masters/domains', ...adminOnly, adminController.createDomainMaster);
router.patch('/masters/domains/:id', ...adminOnly, adminController.updateDomainMaster);
router.delete('/masters/domains/:id', ...adminOnly, adminController.deleteDomainMaster);

router.post('/masters/rejection-reasons', ...adminOnly, adminController.createRejectionReasonMaster);
router.patch('/masters/rejection-reasons/:id', ...adminOnly, adminController.updateRejectionReasonMaster);
router.delete('/masters/rejection-reasons/:id', ...adminOnly, adminController.deleteRejectionReasonMaster);

router.get('/masters/plans', ...adminOnly, adminController.listPlanMasters);
router.post('/masters/plans', ...adminOnly, adminController.createPlanMaster);
router.patch('/masters/plans/:id', ...adminOnly, adminController.updatePlanMaster);
router.delete('/masters/plans/:id', ...adminOnly, adminController.deletePlanMaster);

// ----- Site settings -----
router.get('/site-settings', ...adminOnly, adminController.getSiteSettings);
router.patch('/site-settings', ...adminOnly, adminController.updateSiteSettings);

// ----- Announcements -----
router.get('/announcements', ...adminOnly, adminController.listAnnouncements);
router.post('/announcements', ...adminOnly, adminController.createAnnouncement);

// ----- Analytics -----
router.get('/analytics/overview', ...adminOnly, adminController.getAnalyticsOverview);

// ----- Financial ledger (Phase 6) -----
router.get('/payments', ...adminOnly, adminController.listPayments);

// ----- Security -----
router.get('/audit-log', ...adminOnly, adminController.listAuditLog);

export default router;
