import { Router } from 'express';
import * as companyController from '../controllers/companyController';
import * as unlockController from '../controllers/unlockController';
import * as companyMessageController from '../controllers/companyMessageController';
import * as paymentController from '../controllers/paymentController';
import * as contestController from '../controllers/contestController';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';
import { requireVerified } from '../middleware/requireVerified';
import { searchLimiter } from '../middleware/rateLimiter';

const router = Router();

// Two tiers, deliberately.
//
// `companyOnly` is "signed in as a company": the account's own record and its
// billing trail. An unverified company must still be able to read back what it
// submitted and where that stands — that screen IS its whole app until an
// admin approves it — and it must be able to edit and resubmit.
//
// `verifiedCompany` is everything that touches *candidates*: search, contest
// performance, unlocks and messaging. searchCandidates already threw its own
// 403 for an unverified company; the rest did not, so an unverified account
// could still unlock a contact it had bought unlocks for, read and send
// messages, and pull a named candidate's contest history. The gate is now
// declared once per route instead of re-derived inside three controllers.
const companyOnly = [requireAuth, requireRole('company')] as const;
const verifiedCompany = [...companyOnly, requireVerified] as const;

router.get('/ping', ...companyOnly, companyController.ping);

// Profile
router.get('/me/profile', ...companyOnly, companyController.getMyCompanyProfile);
router.put('/me/profile', ...companyOnly, companyController.upsertMyCompanyProfile);

// Search / browse candidates
router.get('/search', ...verifiedCompany, searchLimiter, companyController.searchCandidates);

// Contest performance for one candidate. Deliberately NOT behind an unlock —
// it's Hirepool's own scored data, treated like the Achievements section
// rather than like contact details.
router.get(
  '/candidates/:candidateId/contest-performance',
  ...verifiedCompany,
  contestController.getCandidateContestPerformance,
);

// Unlock-contact flow
router.post('/unlock', ...verifiedCompany, unlockController.unlockCandidate);
router.get('/me/unlocked', ...verifiedCompany, unlockController.listMyUnlocked);
router.patch(
  '/me/unlocked/:candidateId/note',
  ...verifiedCompany,
  unlockController.updateUnlockNote,
);

// Messaging. The literal '/read' sub-resource is declared before the bare
// ':candidateId' POST target for the ordering discipline used throughout this
// codebase, even though the two differ by method.
router.get('/me/messages', ...verifiedCompany, companyMessageController.listMyThreads);
router.patch(
  '/me/messages/:candidateId/read',
  ...verifiedCompany,
  companyMessageController.markThreadRead,
);
router.post(
  '/me/messages/:candidateId',
  ...verifiedCompany,
  companyMessageController.startOrReplyThread,
);

// Payments (Phase 6)
router.post('/payments/subscribe', requireAuth, requireRole('company'), paymentController.subscribe);
router.post(
  '/payments/unlock-topup',
  requireAuth,
  requireRole('company'),
  paymentController.unlockTopup,
);
router.get('/payments/history', requireAuth, requireRole('company'), paymentController.listMyPayments);

export default router;
