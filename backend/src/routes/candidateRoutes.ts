import { Router } from 'express';
import * as candidateController from '../controllers/candidateController';
import * as platformBadgeController from '../controllers/platformBadgeController';
import * as achievementController from '../controllers/achievementController';
import * as messageController from '../controllers/messageController';
import * as candidateBlockController from '../controllers/candidateBlockController';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.patch('/me/category', requireAuth, requireRole('candidate'), candidateController.setCategory);
router.get('/ping', requireAuth, requireRole('candidate'), candidateController.ping);

// Profile
router.get('/me/profile', requireAuth, requireRole('candidate'), candidateController.getMyProfile);
router.put('/me/profile', requireAuth, requireRole('candidate'), candidateController.upsertMyProfile);
router.post(
  '/me/profile/submit',
  requireAuth,
  requireRole('candidate'),
  candidateController.submitMyProfile,
);
router.post(
  '/me/profile/request-reverification',
  requireAuth,
  requireRole('candidate'),
  candidateController.requestReverification,
);
router.patch(
  '/me/looking-status',
  requireAuth,
  requireRole('candidate'),
  candidateController.setLookingStatus,
);
router.get(
  '/me/unlocked-by',
  requireAuth,
  requireRole('candidate'),
  candidateController.listWhoUnlockedMe,
);

// Platform badges
router.get(
  '/me/platform-badges',
  requireAuth,
  requireRole('candidate'),
  platformBadgeController.list,
);
router.post(
  '/me/platform-badges',
  requireAuth,
  requireRole('candidate'),
  platformBadgeController.create,
);
router.patch(
  '/me/platform-badges/:id',
  requireAuth,
  requireRole('candidate'),
  platformBadgeController.update,
);
router.delete(
  '/me/platform-badges/:id',
  requireAuth,
  requireRole('candidate'),
  platformBadgeController.remove,
);

// Achievements
router.get('/me/achievements', requireAuth, requireRole('candidate'), achievementController.list);
router.post('/me/achievements', requireAuth, requireRole('candidate'), achievementController.create);
router.patch(
  '/me/achievements/:id',
  requireAuth,
  requireRole('candidate'),
  achievementController.update,
);
router.delete(
  '/me/achievements/:id',
  requireAuth,
  requireRole('candidate'),
  achievementController.remove,
);

// Inbox
router.get('/me/messages', requireAuth, requireRole('candidate'), messageController.listMyThreads);
router.post(
  '/me/messages/:companyId/reply',
  requireAuth,
  requireRole('candidate'),
  messageController.replyToThread,
);

// Blocks (company-side messaging respects these — see
// companyMessageController.startOrReplyThread)
router.post(
  '/me/blocks/:companyId',
  requireAuth,
  requireRole('candidate'),
  candidateBlockController.blockCompany,
);

export default router;
