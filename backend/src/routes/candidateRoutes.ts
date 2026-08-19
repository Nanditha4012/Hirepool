import { Router } from 'express';
import * as candidateController from '../controllers/candidateController';
import * as platformBadgeController from '../controllers/platformBadgeController';
import * as achievementController from '../controllers/achievementController';
import * as educationController from '../controllers/educationController';
import * as verificationController from '../controllers/verificationController';
import * as messageController from '../controllers/messageController';
import * as candidateBlockController from '../controllers/candidateBlockController';
import * as paymentController from '../controllers/paymentController';
import * as candidateRoundController from '../controllers/candidateRoundController';
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
router.get(
  '/me/applications',
  requireAuth,
  requireRole('candidate'),
  candidateController.listMyApplications,
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

// Education
router.get('/me/education', requireAuth, requireRole('candidate'), educationController.list);
router.post('/me/education', requireAuth, requireRole('candidate'), educationController.create);
router.patch('/me/education/:id', requireAuth, requireRole('candidate'), educationController.update);
router.delete('/me/education/:id', requireAuth, requireRole('candidate'), educationController.remove);

// Automated verification (OCR over a candidate-supplied document link, plus
// the DigiLocker hand-off). See controllers/verificationController.ts.
router.get(
  '/me/verification-documents',
  requireAuth,
  requireRole('candidate'),
  verificationController.listMyDocuments,
);
router.post(
  '/me/verification-documents',
  requireAuth,
  requireRole('candidate'),
  verificationController.submitDocument,
);
router.delete(
  '/me/verification-documents/:id',
  requireAuth,
  requireRole('candidate'),
  verificationController.removeDocument,
);
router.get(
  '/me/digilocker/status',
  requireAuth,
  requireRole('candidate'),
  verificationController.digilockerStatus,
);
router.post(
  '/me/digilocker/start',
  requireAuth,
  requireRole('candidate'),
  verificationController.digilockerStart,
);
router.post(
  '/me/digilocker/callback',
  requireAuth,
  requireRole('candidate'),
  verificationController.digilockerCallback,
);

// Inbox
router.get('/me/messages', requireAuth, requireRole('candidate'), messageController.listMyThreads);
router.post(
  '/me/messages/:companyId/reply',
  requireAuth,
  requireRole('candidate'),
  messageController.replyToThread,
);
router.patch(
  '/me/messages/:companyId/read',
  requireAuth,
  requireRole('candidate'),
  messageController.markThreadRead,
);

// Blocks (company-side messaging respects these — see
// companyMessageController.startOrReplyThread)
router.post(
  '/me/blocks/:companyId',
  requireAuth,
  requireRole('candidate'),
  candidateBlockController.blockCompany,
);

// Coding & MCQ rounds (Phase 8).
router.get(
  '/applications/:applicationId/rounds/:roundId',
  requireAuth,
  requireRole('candidate'),
  candidateRoundController.getRound,
);
router.post(
  '/applications/:applicationId/rounds/:roundId/submit',
  requireAuth,
  requireRole('candidate'),
  candidateRoundController.submitRoundAttempt,
);

// Payments (Phase 6)
router.post('/payments/boost', requireAuth, requireRole('candidate'), paymentController.boost);
router.get('/payments/history', requireAuth, requireRole('candidate'), paymentController.listMyPayments);

export default router;
