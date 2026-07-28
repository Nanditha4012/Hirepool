import { Router } from 'express';
import * as verifierController from '../controllers/verifierController';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

const router = Router();

// Every route below is verifier-only; the pair is applied per-route rather
// than via router.use() to keep each line self-documenting (same convention
// as candidateRoutes/companyRoutes).
const verifierOnly = [requireAuth, requireRole('verifier')] as const;

router.get('/ping', ...verifierOnly, verifierController.ping);

// Own account + personal stats. Declared before '/profiles/:id' so the
// literal path can never be swallowed by the :id parameter.
router.get('/me', ...verifierOnly, verifierController.getMyVerifierAccount);
router.patch('/me', ...verifierOnly, verifierController.updateMyVerifierAccount);
router.post('/me/password', ...verifierOnly, verifierController.changeMyVerifierPassword);

// The three catalogs (unverified / verified / rejected).
router.get('/queue/profiles', ...verifierOnly, verifierController.listProfileQueue);

// Profile management — every reviewable profile, unconstrained by catalog.
router.get('/profiles', ...verifierOnly, verifierController.listAllProfiles);

router.post('/profiles/:id/claim', ...verifierOnly, verifierController.claimProfile);
router.get('/profiles/:id', ...verifierOnly, verifierController.getProfileForReview);
router.get('/profiles/:id/timeline', ...verifierOnly, verifierController.getProfileTimeline);
router.post('/profiles/:id/field-checks', ...verifierOnly, verifierController.saveFieldChecks);
router.post('/profiles/:id/decision', ...verifierOnly, verifierController.decideProfile);
router.post('/profiles/:id/reopen', ...verifierOnly, verifierController.reopenProfile);

router.get('/queue/badges', ...verifierOnly, verifierController.listBadgeQueue);
router.post('/badges/:id/decision', ...verifierOnly, verifierController.decideBadge);

router.get('/queue/achievements', ...verifierOnly, verifierController.listAchievementQueue);
router.post('/achievements/:id/decision', ...verifierOnly, verifierController.decideAchievement);

router.get('/analytics', ...verifierOnly, verifierController.getAnalytics);

export default router;
