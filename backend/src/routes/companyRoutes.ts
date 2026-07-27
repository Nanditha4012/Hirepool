import { Router } from 'express';
import * as companyController from '../controllers/companyController';
import * as unlockController from '../controllers/unlockController';
import * as companyMessageController from '../controllers/companyMessageController';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.get('/ping', requireAuth, requireRole('company'), companyController.ping);

// Profile
router.get('/me/profile', requireAuth, requireRole('company'), companyController.getMyCompanyProfile);
router.put('/me/profile', requireAuth, requireRole('company'), companyController.upsertMyCompanyProfile);

// Search / browse candidates
router.get('/search', requireAuth, requireRole('company'), companyController.searchCandidates);

// Unlock-contact flow
router.post('/unlock', requireAuth, requireRole('company'), unlockController.unlockCandidate);
router.get('/me/unlocked', requireAuth, requireRole('company'), unlockController.listMyUnlocked);
router.patch(
  '/me/unlocked/:candidateId/note',
  requireAuth,
  requireRole('company'),
  unlockController.updateUnlockNote,
);

// Messaging
router.get('/me/messages', requireAuth, requireRole('company'), companyMessageController.listMyThreads);
router.post(
  '/me/messages/:candidateId',
  requireAuth,
  requireRole('company'),
  companyMessageController.startOrReplyThread,
);

export default router;
