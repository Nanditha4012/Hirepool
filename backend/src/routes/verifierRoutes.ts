import { Router } from 'express';
import * as verifierController from '../controllers/verifierController';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.get('/ping', requireAuth, requireRole('verifier'), verifierController.ping);

router.get(
  '/queue/profiles',
  requireAuth,
  requireRole('verifier'),
  verifierController.listProfileQueue,
);
router.post(
  '/profiles/:id/claim',
  requireAuth,
  requireRole('verifier'),
  verifierController.claimProfile,
);
router.get(
  '/profiles/:id',
  requireAuth,
  requireRole('verifier'),
  verifierController.getProfileForReview,
);
router.post(
  '/profiles/:id/decision',
  requireAuth,
  requireRole('verifier'),
  verifierController.decideProfile,
);

router.get(
  '/queue/badges',
  requireAuth,
  requireRole('verifier'),
  verifierController.listBadgeQueue,
);
router.post(
  '/badges/:id/decision',
  requireAuth,
  requireRole('verifier'),
  verifierController.decideBadge,
);

router.get(
  '/queue/achievements',
  requireAuth,
  requireRole('verifier'),
  verifierController.listAchievementQueue,
);
router.post(
  '/achievements/:id/decision',
  requireAuth,
  requireRole('verifier'),
  verifierController.decideAchievement,
);

router.get('/analytics', requireAuth, requireRole('verifier'), verifierController.getAnalytics);

export default router;
